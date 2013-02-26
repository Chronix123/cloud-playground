'use strict';

/* jasmine specs for services */

describe('service', function() {

  beforeEach(module('playgroundApp.services'));


  describe('playgroundHttpInterceptor', function() {

    it('should return HTTP normal responses unmodified', inject(function(playgroundHttpInterceptor) {
      // TODO: use jasmine spy instead
      var called = false;
      var http_promise = {
        then: function(success_fn, error_fn) {
          called = true;
          // normal HTTP response
          return success_fn('original http response');
        }
      };
      expect(called).toBe(false);
      var response = playgroundHttpInterceptor(http_promise);
      expect(response).toEqual('original http response');
      expect(called).toBe(true);
    }));


    it('should recognize and log X-Cloud-Playground-Error error repsonses', inject(function(playgroundHttpInterceptor, $log) {
      var error_response = {
        config: {},
        data: 'error response body',
        headers: function(name) { return name == 'X-Cloud-Playground-Error' ? 'True' : undefined; },
        status: 500,
      };
      var http_promise = {
        then: function(success_fn, error_fn) {
          error_fn(error_response);
        }
      };
      var response = playgroundHttpInterceptor(http_promise);
      expect(response).toBeUndefined();
      expect($log.error.logs.pop()).toEqual(['Error:\nerror response body']);
      $log.assertEmpty();
    }));


    it('should log generic HTTP error repsonses', inject(function(playgroundHttpInterceptor, $log) {
      var error_response = {
        config: {},
        data: 'error response body',
        headers: function(name) { return undefined; },
        status: 500,
      };
      var http_promise = {
        then: function(success_fn, error_fn) {
          error_fn(error_response);
        }
      };
      var response = playgroundHttpInterceptor(http_promise);
      expect(response).toBeUndefined();
      expect($log.error.logs.pop()).toEqual(['HTTP ERROR', error_response]);
      $log.assertEmpty();
    }));


    it('should log raised errors', inject(function(playgroundHttpInterceptor, $log) {
      var error_response = Error('raised error');
      var http_promise = {
        then: function(success_fn, error_fn) {
          error_fn(error_response);
        }
      };
      var response = playgroundHttpInterceptor(http_promise);
      expect(response).toBeUndefined();
      expect($log.error.logs.pop()).toEqual([error_response]);
      $log.assertEmpty();
    }));

  });


  describe('DoSerial', function() {

    it('should be chainable', inject(function(DoSerial) {
      var result = DoSerial.then(function() {});
      expect(result).toBe(DoSerial);
      result = DoSerial.tick(function() {});
      expect(result).toBe(DoSerial);
    }));


    it('should not accept null argument', inject(function(DoSerial) {
      expect(DoSerial.then).toThrow();
    }));


    it('should execute simple task synchronously', inject(function(DoSerial) {
      var fn = jasmine.createSpy();
      DoSerial.then(fn);
      expect(fn).toHaveBeenCalled();
    }));


    it('should execute tasks in order', inject(function(DoSerial, $log, $timeout) {
      DoSerial.then(function() { $log.log(1); });
      DoSerial.tick();
      DoSerial
      .then(function() { $log.log(2); })
      .then(function() { $log.log(3); })
      .tick()
      .then(function() { $log.log(4); })
      DoSerial.tick();
      expect($log.log.logs).toEqual([[1]]);
      $timeout.flush();
      expect($log.log.logs).toEqual([[1], [2], [3], [4]]);
    }));


    it('should wait for promise to be satisfied before continuing', inject(function(DoSerial, $log, $timeout) {
      DoSerial
      .then(function() { return $timeout(function() { $log.log(1); }); })
      .then(function() { $log.log(2); })
      expect($log.log.logs).toEqual([]);
      $timeout.flush();
      expect($log.log.logs).toEqual([[1], [2]]);
    }));


    xit('should accept both promises and functions', inject(function(DoSerial) {
      // TODO
    }));


    it('should log and continue after synchronous exception', function() {

      module(function($exceptionHandlerProvider) {
        $exceptionHandlerProvider.mode('log');
      });

      inject(function(DoSerial, $log, $exceptionHandler, $timeout) {
        expect($log.assertEmpty());
        DoSerial
        .then(function() { $log.log(1); })
        .then(function() { throw 'banana peel'; })
        .then(function() { $log.log(2); })
        expect($exceptionHandler.errors).toEqual(['banana peel']);
        expect($log.log.logs).toEqual([[1], [2]]);
      });

    });

    it('should log and continue after exception in promise', function() {

      module(function($exceptionHandlerProvider) {
        $exceptionHandlerProvider.mode('log');
      });

      inject(function(DoSerial, $log, $exceptionHandler, $timeout) {
        expect($log.assertEmpty());
        DoSerial
        .then(function() { $log.log(1); })
        .then(function() { return $timeout(function() { $log.log(2); }); })
        .then(function() { return $timeout(function() { throw 'apple core'; }); })
        .then(function() { $log.log(3); })
        $timeout.flush();
        expect($exceptionHandler.errors).toEqual(['apple core']);
        expect($log.log.logs).toEqual([[1], [2], [3]]);
      });

    });

  });

  // TODO: DETERMINE if there's a better way to test window / document stuff
  describe('DomElementById', function() {

    it('should call $window.document.getElementById(:id)', inject(function($window, DomElementById) {
      var elem = $window.document.createElement('div');
      elem.id = 'myid';
      $window.document.getElementById = jasmine.createSpy('getElementById').andReturn(elem);
      var result = DomElementById('myid');
      expect($window.document.getElementById).toHaveBeenCalledWith('myid');
      expect(result).toBe(elem);
    }));

  });

  describe('WrappedElementById', function() {

    it('should return angular.element(:elem)', inject(function($window, WrappedElementById) {
      var elem = $window.document.createElement('div');
      var wrappedElem = angular.element(elem);
      $window.document.getElementById = jasmine.createSpy('getElementById').andReturn(elem);
      var result = WrappedElementById('myid');
      expect($window.document.getElementById).toHaveBeenCalledWith('myid');
      expect(result).toEqual(wrappedElem);
    }));

  });

});
