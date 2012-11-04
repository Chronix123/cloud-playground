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

.factory('blissHttpInterceptor', function($q, $log, $window) {
  return function(promise) {
    return promise.then(function(response) {
      return response;
    }, function(err) {
      if (err instanceof Error) {
        $log.error(err);
      } else if (err.headers('X-Bliss-Error')) {
        $log.error('Error:\n' + err.data);
      } else {
        $log.error('HTTP ERROR', err);
      }
      return $q.reject(err);
    });
  };
})

.factory('Backoff', function($timeout) {

  "Exponential backoff service."

  var INIITAL_BACKOFF_MS = 1000;
  var backoff_ms;
  var timer = undefined;

  var Backoff = {
    reset: function() {
      backoff_ms = INIITAL_BACKOFF_MS;
    },
    backoff: function() {
      backoff_ms = Math.min(120 * 1000, (backoff_ms || 1000) * 2);
      return backoff_ms;
    },
    schedule: function(func) {
      if (timer) {
        return;
      }
      timer = $timeout(function() {
        timer = undefined;
        func();
      }, backoff_ms);
    },
  };

  Backoff.reset();
  return Backoff;
})

.factory('DoSerial', function($q, $log) {

  var deferred = $q.defer();
  deferred.resolve();
  var promise = deferred.promise;

  function promisehack(func) {
    var result = func();
    if (result && result.then) {
      result = result.then;
    }
    return result;
  }

  var DoSerial = {
    then: function(func) {
      promise = promise.then(function() {
        return promisehack(func);
      }, function(err) {
        $log.error('DoSerial encountered', err);
        return promisehack(func);
      });
      // allow chained calls, e.g. DoSerial.then(...).then(...)
      return DoSerial;
    }
  };
  return DoSerial;

});

function HeaderController($scope, $location) {

  $scope.alreadyhome = function() {
    return $location.path() == '/bliss/';
  }

}

function AdminController($scope, $http, $window, DoSerial) {

  $scope.big_red_button = function() {
    DoSerial
    .then(function() {
      return $http.post('nuke')
      .success(function(data, status, headers, config) {
        document.body.scrollTop = 0;
        $window.location.reload();
      });
    });
  };

}

function MainController($scope, $http, $location, $window, $log, DoSerial) {

  DoSerial
  .then(function() {
    return $http.get('getprojects')
    .success(function(data, status, headers, config) {
      $scope.projects = data;
    });
  })
  .then(function() {
    return $http.get('gettemplates')
    .success(function(data, status, headers, config) {
      $scope.templates = data;
    });
  })
  .then(function() {
    $scope.loaded = true;
  });

  $scope.login = function() {
    $window.location = '/bliss/login';
  }

  $scope.select_project = function(project) {
    $location.path('/bliss/p/' + project.key);
  }

  $scope.prompt_for_new_project = function(template) {
    return DoSerial
    .then(function() {
      return $http.post('createproject', {
          template_url: template.key,
          project_name: template.name,
          project_description: template.description})
      .success(function(data, status, headers, config) {
        $scope.projects.push(data);
        return;
      });
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
      // TODO figure out how we can modify $scope.projects directly
      // and force 'ng-show/ng-hide="projects"' to re-evaluated
      var projects = [];
      for (i in $scope.projects) {
        if ($scope.projects[i] != project) {
          projects.push($scope.projects[i]);
        }
      }
      $scope.projects = projects;
    });
  };

}

function ProjectController($scope, $http, $filter, $log, $timeout, Backoff,
                           DoSerial) {

  var source_code = document.getElementById('source-code');
  var source_container = document.getElementById('source-container');
  var source_image = document.getElementById('source-image');

  // { "app.yaml" : {
  //        "name"     : "app.yaml",
  //        "mime_type": "text/yaml",
  //        "contents" : "...",
  //        "dirty"    : false },
  //   "main.py" : {
  //        ...
  //   }
  // }
  $scope.files = {};

  var _editor;
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
    return DoSerial
    .then(function() {
        _saveDirtyFiles();
    })
    .then(function() {
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

  function _save(path) {
    return DoSerial
    .then(function() {
      var file = $scope.files[path];
      if (!file.dirty) {
        return;
      }
      file.dirty = false;
      $scope.filestatus = 'Saving ' + path + ' ...';
      return $http.put('putfile/' + encodeURI(path), file.contents, {
                       headers: {'Content-Type': 'text/plain; charset=utf-8'}
      })
      .success(function(data, status, headers, config) {
        $scope.filestatus = ''; // saved
        Backoff.reset();
      })
      .error(function(data, status, headers, config) {
        $scope.filestatus = 'Failed to save ' + path;
        file.dirty = true;
        var secs = Backoff.backoff() / 1000;
        $log.warn(path, 'failed to save; will retry in', secs, 'secs');
        Backoff.schedule(_saveDirtyFiles);
      });
    });
  }

  function _saveDirtyFiles() {
    for (var path in $scope.files) {
      if ($scope.files[path].dirty) {
        var dirtypath = path;
        DoSerial
        .then(function() {
          return _save(dirtypath);
        })
        break;
      }
    }
  }

  // editor onChange
  function editorOnChange(from, to, text, next) {
    $scope.$apply(function() {
      $scope.currentFile.contents = _editor.getValue();
      if ($scope.currentFile.dirty) {
        return;
      }
      $scope.currentFile.dirty = true;
      Backoff.schedule(_saveDirtyFiles);
    });
  }

  $scope.prompt_file_delete = function() {
    var answer = prompt("Are you sure you want to delete " +
                        $scope.currentFile.name + "?\nType 'yes' to confirm.", "no");
    if (!answer || answer.toLowerCase()[0] != 'y') {
      return;
    }
    $scope.deletefile($scope.currentFile);
  }

  $scope.prompt_project_rename = function() {
    var new_project_name = prompt(
        'Enter a new name for this project',
        $scope.config.project_name);
    if (!new_project_name) {
      return;
    }
    DoSerial
    .then(function() {
      return $http.post('rename', {newname: new_project_name})
      .success(function(data, status, headers, config) {
        $scope.config.project_name = new_project_name;
      });
    });
  }

  $scope.prompt_file_rename = function() {
    var new_filename = prompt(
        'New filename?\n(You may specify a full path such as: foo/bar.txt)',
        $scope.currentFile.name);
    if (!new_filename) {
      return;
    }
    if (new_filename[0] == '/') {
      new_filename = new_filename.substr(1);
    }
    if (!new_filename || new_filename == $scope.currentFile.name) {
      return;
    }
    $scope.movefile($scope.currentFile, new_filename);
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

  $scope.project_context_menu = function(evt) {
    evt.stopPropagation();
    hide_context_menus();
    $scope.showprojectcontextmenu = true;
    var menuDiv = document.getElementById('project-context-menu');
    menuDiv.style.left = evt.pageX + 'px';
    menuDiv.style.top = evt.pageY + 'px';
  };

  $scope.file_context_menu = function(evt, file) {
    evt.stopPropagation();
    hide_context_menus();
    $scope.select(file);
    $scope.showfilecontextmenu = true;
    var menuDiv = document.getElementById('file-context-menu');
    menuDiv.style.left = evt.pageX + 'px';
    menuDiv.style.top = evt.pageY + 'px';
  };

  $scope.insertPath = function(path) {
    var file = $scope.files[path];
    if (!file) {
      file = {
          name: path,
          mime_type: 'text/plain',
          contents: '',
          dirty: false,
      };
      $scope.files[path] = file;
    }
    $scope.select(file);
  };

  $scope.prompt_for_new_file = function() {
    var path = prompt('New filename?', '');
    if (!path) {
      return;
    }
    if (path[0] == '/') {
      path = path.substr(1)
    }

    $scope.insertPath(path);
  };

  function _selectFirstFile() {
    for (path in $scope.files) {
      $scope.select($scope.files[path]);
      break;
    }
  }

  $scope.deletefile = function(file) {
    DoSerial
    .then(function() {
      return $http.post('deletepath/' + encodeURI(file.name))
      .success(function(data, status, headers, config) {
        delete $scope.files[file.name];
        _selectFirstFile();
      });
    });
  };

  $scope.movefile = function(file, newpath) {
    DoSerial
    .then(function() {
      var oldpath = file.name;
      $scope.files[newpath] = file;
      $scope.files[newpath].name = newpath;
      delete $scope.files[oldpath];
      return $http.post('movefile/' + encodeURI(oldpath), {newpath: newpath})
      .success(function(data, status, headers, config) {
        $scope.currentFile = file;
      });
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

  var _getfileurl = function(file) {
    return '//' + $scope.config.BLISS_USER_CONTENT_HOST +
           document.location.pathname + 'getfile/' +
           encodeURI(file.name);
  };

  var _get = function(file, success_cb) {
    if (file.hasOwnProperty('contents')) {
      success_cb();
      return;
    }
    var url = _getfileurl(file);
    $http.get(url, {transformResponse: noJsonTransform})
    .success(function(data, status, headers, config) {
      file.contents = data;
      file.dirty = false;
      success_cb();
    });
  };

  $scope.select = function(file) {
    if (/^image\//.test(file.mime_type)) {
      var url = _getfileurl(file);
      source_image.setAttribute('src', url);
      source_container.setAttribute('class', 'image');
      $scope.currentFile = file;
      return;
    }
    _get(file, function() {
      while(source_code.hasChildNodes()) {
        source_code.removeChild(source_code.childNodes[0]);
      }
      _editor = createEditor(file.mime_type);
      _editor.getScrollerElement().id = 'scroller-element';
      source_container.setAttribute('class', 'code');
      _editor.setValue(file.contents);
      _editor.setOption('onChange', editorOnChange);
      _editor.focus();
      $scope.currentFile = file;
    });
  };

  var listfiles = function() {
    return $http.get('listfiles')
    .success(function(data, status, headers, config) {
      angular.forEach(data, function(props, i) {
        $scope.files[props.name] =  props;
      });
      _selectFirstFile();
    });
  };

  var getconfig = function() {
    return $http.get('getconfig')
    .success(function(data, status, headers, config) {
       $scope.config = data;
    });
  };

  DoSerial
  .then(getconfig)
  .then(listfiles)
  .then(function() {
    resizer('divider1', 'source-container');
    resizer('divider2', 'output-iframe');
  });

}
