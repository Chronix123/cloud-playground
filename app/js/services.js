'use strict';

/* Services */

angular.module('playgroundApp.services', [])

// TODO: test
.factory('Alert', function() {

  var alert_list = [];

  var Alert = {
    alert_list: alert_list,

    handle_exception: function(exception, cause) {
      var msg = '' + exception;
      if (cause) {
        msg += ' caused by ' + cause;
      }
      alert_list.push({type: 'error', msg: msg});
    },

    note: function(msg) {
      alert_list.push({msg: msg});
    },

    info: function(msg) {
      alert_list.push({type: 'info', msg: msg});
    },

    success: function(msg) {
      alert_list.push({type: 'success', msg: msg});
    },

    error: function(msg) {
      alert_list.push({type: 'error', msg: msg});
    },

    alerts: function() {
      return alert_list;
    },

    remove_alert: function(idx) {
      alert_list.splice(idx, 1);
    },
  };

  return Alert;

})

// TODO: improve upon flushDoSerial(); allow one step to be executed at a time
.factory('DoSerial', function($timeout, $log, $exceptionHandler) {

  var work_items = [];
  var pending_promise;

  var on_promised_satisfied = function() {
    pending_promise = undefined;
    maybe_next();
  };

  var maybe_next = function() {
    if (pending_promise) return;
    if (!work_items.length) return;

    var result;
    try {
      result = work_items.shift()();
    } catch (err) {
      $exceptionHandler(err);
    }

    if (result && result.then) {
      pending_promise = result.then(on_promised_satisfied,
                                    on_promised_satisfied);
    } else {
      maybe_next();
    }
  };

  // TODO: rename to 'Queue'
  var DoSerial = {
    // yield execution until next tick from the event loop
    tick: function() {
      return this.then(function() {
        return $timeout(angular.noop);
      });
    },
    // schedule action to perform next
    then: function(func) {
      work_items.push(func);
      maybe_next();
      return DoSerial;
    }
  };

  return DoSerial;
})

.factory('playgroundHttpInterceptor', function($q, $log, $window) {
  return function(promise) {
    return promise.then(function(response) {
      return response;
    }, function(err) {
      // TODO: use 'return $q.reject(err)' instead of throwing errors,
      // while still showing errors in Alert service and $log
      if (err instanceof Error) {
        throw err;
      } else if (err.headers('X-Cloud-Playground-Error')) {
        throw 'Cloud Playground error:\n' + err.data;
      } else {
        // err properties: data, status, headers, config
        throw 'HTTP ERROR ' + err.status + ': ' +
              err.config.method + ' ' + err.config.url + '\n' +
              err.data;
      }
    });
  };
})

// TODO: if want to focus() element create Focus service
.factory('DomElementById', function($window) {
  return function(id) {
    return $window.document.getElementById(id);
  };
})

// TODO: move output iframe into directive with a template.html
// TODO: get rid of other uses
.factory('WrappedElementById', function(DomElementById) {
  return function(id) {
    return angular.element(DomElementById(id));
  };
})

// TODO: test
// TODO: DETERMINE if there's a better way
.factory('Backoff', function($timeout) {

  // Exponential backoff service.

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

.factory('WindowService', function($window) {
  var WindowService = {
    'reload': function() {
      // TODO: don't access 'document' directly
      document.body.scrollTop = 0;
      $window.location.reload();
    },
    'open': function(url, name, specs, replace) {
      $window.open(url, name, specs, replace);
    },
  };
  return WindowService;
});
