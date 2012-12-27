'use strict';

/* jasmine specs for controllers */

/* http://docs.angularjs.org/api/angular.mock.inject */

describe('HeaderController', function() {
  var scope, location;

  beforeEach(inject(function($rootScope, $controller, $location) {
    scope = $rootScope.$new();
    $controller(HeaderController, {$scope: scope});
    location = $location
  }));


  it('should provide "alreadyhome" function', function() {
    expect(typeof scope.alreadyhome).toEqual('function');

    location.path('/');
    expect(scope.alreadyhome()).toBe(false);
    location.path('/playground');
    expect(scope.alreadyhome()).toBe(false);
    location.path('/playground/');
    expect(scope.alreadyhome()).toBe(true);
    location.path('/playground/p/42/');
    expect(scope.alreadyhome()).toBe(false);
  });

});


describe('PageController', function() {

  describe('initialization', function () {

    var scope, $httpBackend;

    beforeEach(module('playgroundApp.services'));

    beforeEach(inject(function($rootScope, $injector) {
      scope = $rootScope.$new();
      $httpBackend = $injector.get('$httpBackend');

      $httpBackend
      .when('GET', '/playground/getconfig')
      .respond({
          "PLAYGROUND_USER_CONTENT_HOST": "localhost:9100",
          "email": "user_q0inuf3vs5",
          "git_playground_url": "http://code.google.com/p/cloud-playground/",
          "is_admin": false,
          "is_logged_in": false,
          "playground_namespace": "_playground",
      });

      $httpBackend
      .when('GET', '/playground/getprojects')
      .respond([]);
    }));


    afterEach(function() {
      $httpBackend.verifyNoOutstandingExpectation();
      $httpBackend.verifyNoOutstandingRequest();
    });


    it('should, when instantiated, get configuration, then project data', inject(function($timeout, $controller) {
      expect(scope.config).toBeUndefined();
      expect(scope.projects).toBeUndefined();
      $httpBackend.expectGET('/playground/getconfig');
      $httpBackend.expectGET('/playground/getprojects');
      $controller(PageController, {$scope: scope});
      flushDoSerial($timeout);
      $httpBackend.flush();
      expect(scope.config).toBeDefined();
      expect(scope.config.email).toBeDefined();
      expect(scope.config.playground_namespace).toBe('_playground');
      expect(scope.projects).toBeDefined();
      expect(scope.projects.length).toBe(0);
    }));

  });


  describe('namespace function', function() {

    var scope, routeParams;

    beforeEach(module('playgroundApp.services'));

    beforeEach(inject(function($rootScope, $controller, $routeParams) {
      scope = $rootScope.$new();
      scope.config = {};
      routeParams = $routeParams;
      routeParams.project_id = undefined;
      $controller(PageController, {$scope: scope});
    }));


    it('should have no default', function() {
      expect(scope.namespace()).toBeUndefined();
    });


    it('should use $routeParams project_id', function() {
      expect(scope.namespace()).toBeUndefined();
      routeParams.project_id = 'route_param';
      expect(scope.namespace()).toBe('route_param');
    });


    it('should use $scope.config.playground_namespace', function() {
      expect(scope.namespace()).toBeUndefined();
      scope.config.playground_namespace = 'pg_namepsace';
      expect(scope.namespace()).toBe('pg_namepsace');
    });


    it('should prefer $routeParams to $scope.config', function() {
      expect(scope.namespace()).toBeUndefined();
      routeParams.project_id = 'route_param';
      scope.config.playground_namespace = 'pg_namepsace';
      expect(scope.namespace()).toBe('route_param');
    });

  });


  describe('datastore_admin function', function() {

    var scope;

    beforeEach(module('playgroundApp.services'));

    beforeEach(inject(function($rootScope, $controller, $routeParams, $window) {
      scope = $rootScope.$new();
      $routeParams.project_id = 'some_namespace';
      $window.open = jasmine.createSpy();
      $controller(PageController, {$scope: scope});
    }));


    it('should open new window to /playground/datastore/some_namespace', inject(function($window) {
      expect($window.open).not.toHaveBeenCalled();
      scope.datastore_admin();
      expect($window.open).toHaveBeenCalledWith('/playground/datastore/some_namespace', '_blank');
    }));

  });


  describe('memcache_admin function', function() {

    var scope;

    beforeEach(module('playgroundApp.services'));

    beforeEach(inject(function($rootScope, $controller, $routeParams, $window) {
      scope = $rootScope.$new();
      $routeParams.project_id = 'some_namespace';
      $window.open = jasmine.createSpy();
      $controller(PageController, {$scope: scope});
    }));


    it('should open new window to /playground/memcache/some_namespace', inject(function($window) {
      expect($window.open).not.toHaveBeenCalled();
      scope.memcache_admin();
      expect($window.open).toHaveBeenCalledWith('/playground/memcache/some_namespace', '_blank');
    }));

  });

});


describe('MainController', function() {

  var scope;

  beforeEach(module(function($provide) {
    $provide.factory('$window', function() {
      return {
        location: { replace: jasmine.createSpy() },
        navigator: {},
      };
    });
  }));


  beforeEach(inject(function($rootScope, $controller, $window) {
    scope = $rootScope.$new();
    $controller(MainController, {$scope: scope});
  }));


  describe('login function', function() {

    it('should navigate to /playground/login', inject(function($window) {
      expect($window.location.replace).not.toHaveBeenCalled();
      scope.login();
      expect($window.location.replace).toHaveBeenCalledWith('/playground/login');
    }));

  });

});
