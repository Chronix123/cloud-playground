angular.module('blissful', ['ngResource'])

.config(function($httpProvider, $locationProvider, $routeProvider) {
  $httpProvider.responseInterceptors.push('blissHttpInterceptor');

  $locationProvider.html5Mode(true);

  $routeProvider
    .when('/bliss/', {
       templateUrl: '/bliss/main.html',
       controller: MainController,
    })
    .when('/bliss/p/:project_id/', {
       templateUrl: '/bliss/project.html',
       controller: ProjectController,
    })
    .otherwise({redirectTo: '/bliss/'});
})

.factory('blissHttpInterceptor', function($q) {
  return function(promise) {
    return promise.then(function(response) {
      return response;
    }, function(err) {
      if (err instanceof Error) {
        alert(err);
      } else if (err.headers('X-Bliss-Error')) {
        alert('Error:\n' + err.data);
      } else {
        // TODO: address problems such as OPTIONS pre-flight request failures
        console.log('err', err);
        alert(err.status + ' <- ' + err.config.method + ' ' + err.config.url +
              '\n' + err.data);
      }
      return $q.reject(err);
    });
  };
})

.factory('Config', function($resource) {
  var Config = $resource('getprojects');
  return Config;
});

function HeaderController($scope, $location) {

  $scope.alreadyhome = function() {
    return $location.path() == '/bliss/';
  }

}

function AdminController($scope, $http) {

  $scope.big_red_button = function() {
    box = lightbox('Bye, bye, data.', 'Please wait...');
    $http.post('nuke')
    .success(function(data, status, headers, config) {
      box();
      document.body.scrollTop = 0;
      window.location.reload();
    });
  };

}

function MainController($scope, $http, $location, $window, Config) {

  $scope.config = Config.get({}, function(data) { data.loaded=true; });

  $scope.login = function() {
    $window.location = '/bliss/login';
  }

  $scope.select_project = function(project) {
    $location.path('/bliss/p/' + project.key);
  }

  $scope.prompt_for_new_project = function(template) {
    box = lightbox('Creating project', 'Please wait.');
    $http.post('createproject', {
        template_url: template.key,
        project_name: template.name,
        project_description: template.description})
    .success(function(data, status, headers, config) {
      box();
      document.body.scrollTop = 0;
      window.location.reload();
    });
  };

  $scope.prompt_to_delete_project = function(project) {
    var answer = prompt("Are you sure you want to delete project " +
                        project.name + "?\nType 'yes' to confirm.", "no");
    if (!answer || answer.toLowerCase()[0] != 'y') {
      return;
    }
    $http.post('/bliss/p/' + encodeURI(project.key) + '/delete')
    .success(function(data, status, headers, config) {
      document.body.scrollTop = 0;
      window.location.reload();
    });
  };

}

function ProjectController($scope, $http, $resource, $filter) {

  var Files = $resource('listfiles');

  var source_code = document.getElementById('source-code');
  var source_container = document.getElementById('source-container');
  var source_image = document.getElementById('source-image');

  var _editor;
  var _dirty = false;
  var _save_timeout;
  var _output_window;
  var _popout = false;

  $scope.popout = function() {
    _popout = true;
    _output_window = undefined;
  }

  $scope.selectme = function(evt) {
    var elem = evt.srcElement;
    elem.focus();
    elem.select();
  }

  $scope.run = function() {
    $scope.save(function() {
      var container = document.getElementById('output-container');
      if (_output_window && _output_window.closed) {
        _popout = false;
      }
      if (_popout) {
        container.style.display = 'none';
        _output_window = window.open($scope.config.project_run_url,
                                     $scope.config.project_id);
      } else {
        container.style.display = 'block';
        var iframe = document.getElementById('output-iframe');
        iframe.src = $scope.config.project_run_url;
      }
    });
  }

  // called from setTimeout after editor is marked dirty
  $scope.save = function(callback) {
    if (!_dirty) {
      if (callback) {
        callback.call();
      }
      return;
    }

    // TODO: fix me
    _dirty = false;

    $scope.filestatus = 'Saving...';
    $scope.$apply();

    $scope.putfile($scope.currentFilename(), _editor.getValue(), function () {
      $scope.filestatus = ''; // saved
      if (callback) {
        callback.call();
      }
    });
  }

  function markDirty() {
    _dirty = true;

    if (_save_timeout) {
      return;
    }
    _save_timeout = setTimeout(function() {
      $scope.save(function() {
        _save_timeout = null;
      });
    }, 1000);
  }

  // editor onChange
  function editorOnChange(from, to, text, next) {
     markDirty();
  }

  $scope.prompt_file_delete = function() {
    var answer = prompt("Are you sure you want to delete " + $scope.currentFilename() + "?\nType 'yes' to confirm.", "no");
    if (!answer || answer.toLowerCase()[0] != 'y') {
      return;
    }
    $scope.deletepath($scope.currentFilename());
  }

  $scope.prompt_project_rename = function() {
    var new_project_name = prompt(
        'Enter a new name for this project',
        $scope.config.project_name);
    if (!new_project_name) {
      return;
    }
    $scope.config.project_name = new_project_name;
  }

  $scope.prompt_file_rename = function() {
    var new_filename = prompt(
        'New filename?\n(You may specify a full path such as: foo/bar.txt)',
        $scope.currentFilename());
    if (!new_filename) {
      return;
    }
    if (new_filename[0] == '/') {
      new_filename = new_filename.substr(1);
    }
    if (!new_filename || new_filename == $scope.currentFilename()) {
      return;
    }
    $scope.movefile($scope.currentFilename(), new_filename);
  }

  function hide_context_menus() {
    $scope.showfilecontextmenu = false;
    $scope.showprojectcontextmenu = false;
  }

  // setup context menu clear handler
  window.addEventListener('click', function(evt) {
    hide_context_menus();
    $scope.$apply();
  }, false);

  function insertAfter(newNode, existingNode) {
    var parentNode = existingNode.parentNode;
    if (existingNode.nextSibling) {
      return parentNode.insertBefore(newNode, existingNode.nextSibling);
    } else {
      return parentNode.appendChild(newNode);
    }
  }

  $scope.project_context_menu = function(evt) {
    evt.stopPropagation();
    hide_context_menus();
    $scope.showprojectcontextmenu = true;
    var menuDiv = document.getElementById('project-context-menu');
    menuDiv.style.left = evt.pageX + 'px';
    menuDiv.style.top = evt.pageY + 'px';
  };

  $scope.file_context_menu = function(evt, i) {
    evt.stopPropagation();
    hide_context_menus();
    $scope.select(i);
    $scope.showfilecontextmenu = true;
    var menuDiv = document.getElementById('file-context-menu');
    menuDiv.style.left = evt.pageX + 'px';
    menuDiv.style.top = evt.pageY + 'px';
  };

  $scope.orderFilesAndSelectByPath = function(path) {
    $scope.files = $filter('orderBy')($scope.files, 'name');
    $scope.selectByPath(path);
  };

  $scope.insertPath = function(path) {
    if ($scope.selectByPath(path)) {
      return;
    }
    $scope.putfile(path, '');
    files = $scope.files;
    files.push({name: path});
    $scope.orderFilesAndSelectByPath(path);
  };

  $scope.prompt_for_new_file = function() {
    var filename = prompt('New filename?', '');
    if (!filename) {
      return;
    }
    if (filename[0] == '/') {
      filename = filename.substr(1)
    }

    $scope.insertPath(filename);
  };

  $scope.currentFilename = function() {
    if (!$scope.files) return '';
    return $scope.files[$scope.currentIndex].name;
  };

  $scope.deletepath = function(filename) {
    $http.post('deletepath/' + encodeURI(filename))
    .success(function(data, status, headers, config) {
      $scope.files.splice($scope.currentIndex, 1);
      $scope.select(0);
    });
  };

  $scope.movefile = function(path, newpath) {
    $http.post('movefile/' + encodeURI(path),{newpath: newpath})
    .success(function(data, status, headers, config) {
      $scope.files[$scope.currentIndex].name = newpath;
      $scope.orderFilesAndSelectByPath(newpath);
    });
  };

  $scope.putfile = function(filename, data, callback) {
    
    $http.put('putfile/' + encodeURI(filename), data, {
           headers: {'Content-Type': 'text/plain; charset=utf-8'}
    })
    .success(function(data, status, headers, config) {
      if (callback) {
        callback.call();
      }
    }).error(function(resp) {
      $scope.select($scope.currentIndex);
    });
  };

  $scope.selectByPath = function(path) {
    for (i in $scope.files) {
      if ($scope.files[i].name == path) {
        $scope.select(i);
        return true;
      }
    }
    return false;
  };

  $scope.select = function(i) {
    $scope.save(function() {
      _select(i)
    });
  };

  function createEditor(mime_type) {
    return CodeMirror(source_code, {
      value: 'Initializing...',
      mode: mime_type,
      lineNumbers: true,
      matchBrackets: true,
      undoDepth: 440, // default = 40
    });
  }

  var noJsonTransform = function(data) { return data; };

  var _select = function(i) {
    $scope.currentIndex = i;

    url = '//' + $scope.config.BLISS_USER_CONTENT_HOST +
          document.location.pathname + 'getfile/' +
          encodeURI($scope.currentFilename());
    $http.get(url, {transformResponse: noJsonTransform})
    .success(function(data, status, headers, config) {
      // e.g. 'text/html; charset=UTF-8'
      var mime_type = headers('Content-Type');
      // Workaround missing HTTP response headers for CORS requests
      // See https://github.com/angular/angular.js/issues/1468
      // See https://bugzilla.mozilla.org/show_bug.cgi?id=608735
      if (!mime_type) {
        mime_type = 'application/octet-stream';
      }
      // strip '; charset=...'
      mime_type = mime_type.replace(/ ?;.*/, '');
      if (/^image\//.test(mime_type)) {
        source_image.setAttribute('src', config.url);
        source_container.setAttribute('class', 'image');
      } else {
        while(source_code.hasChildNodes()) {
          source_code.removeChild(source_code.childNodes[0]);
        }
        _editor = createEditor(mime_type);
        _editor.getScrollerElement().id = 'scroller-element';
        source_container.setAttribute('class', 'code');
        _editor.setValue(data);
        _editor.setOption('onChange', editorOnChange);
        _editor.focus();
      }
    });
  };

  var listfiles = function() {
    Files.query(function(files) {
      $scope.files = files;
      $scope.select(0);
    });
  };

  var getconfig = function() {
    $http.get('getconfig')
    .success(function(data, status, headers, config) {
       $scope.config = data;
       listfiles();
    });
  };

  getconfig();

}
