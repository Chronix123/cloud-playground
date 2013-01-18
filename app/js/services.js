'use strict';

/* Services */

angular.module('playgroundApp.services', [])

// TODO: improve upon flushDoSerial(); allow one step to be executed at a time
.factory('DoSerial', function($q, $timeout, $log) {

  var deferred = $q.defer();
  deferred.resolve();
  var promise = deferred.promise;

  function promisehack(val) {
    if (val && val.then) {
      return val;
    }
    return val();
  }

  // TODO: rename to 'Queue'
  var DoSerial = {
    // yield execution until next tick from the event loop
    tick: function() {
      var d = $q.defer();
      $timeout(function() {
        d.resolve();
      });
      // TODO: stop leaks; maybe use array instead; use array of promises; push()
      promise = promise.then(function() { return d.promise; });
      return DoSerial;
    },
    // schedule action to perform next
    then: function(func) {
      if (func == null) {
        throw 'DoSerial.then() must not be called with null value';
      }
      promise = promise.then(function() {
        return promisehack(func);
      },
      function(err) {
        $log.error('DoSerial encountered', err);
        return promisehack(func);
      });
      // allow chained calls, e.g. DoSerial.then(...).then(...)
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
      if (err instanceof Error) {
        $log.error(err);
      } else if (err.headers('X-Cloud-Playground-Error')) {
        $log.error('Error:\n' + err.data);
      } else {
        $log.error('HTTP ERROR', err);
      }
      return $q.reject(err);
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

/*

// TODO: DETERMINE if there's a better way
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

.factory('LightBox', function($rootScope) {

  $rootScope.lightboxes = [];

  return {
    lightbox: function(summary, details) {
      $rootScope.lightboxes.push({'summary': summary, 'details': details});
    }
  };

})

*/
