"""Module containing the bliss WSGI handlers."""

import cgi
import json
import logging
import os
import re
import urllib

from jinja2 import Environment
from jinja2 import FileSystemLoader

import webapp2
from webapp2_extras import security
from webapp2_extras import sessions

from __mimic import common
from __mimic import mimic

import codesite
import error
import model
import secret
import settings
import shared

from google.appengine.api import app_identity
from google.appengine.api import namespace_manager
from google.appengine.api import users
from google.appengine.ext import ndb


_JSON_MIME_TYPE = 'application/json'

_JSON_ENCODER = json.JSONEncoder()
_JSON_ENCODER.indent = 4
_JSON_ENCODER.sort_keys = True

_DEV_APPSERVER = os.environ['SERVER_SOFTWARE'].startswith('Development/')

_JINJA2_ENV = Environment(autoescape=True, loader=FileSystemLoader(''))

_DASH_DOT_DASH = '-dot-'

# must fit in front of '-dot-appid.appspot.com' and not contain '-dot-'
_VALID_PROJECT_RE = re.compile('^[a-z0-9-]{0,50}$')

_ANON_USER_KEY = u'anon_user_key'


def tojson(r):
  return _JSON_ENCODER.encode(r)


# From http://webapp-improved.appspot.com/guide/extras.html
class SessionHandler(webapp2.RequestHandler):
  """Convenience request handler for dealing with sessions."""

  def get_user_key(self):
    """Returns the email from logged in user or the session user key."""
    user = users.get_current_user()
    if user:
      return user.email()
    return self.session.get(_ANON_USER_KEY)

  def _PerformCsrfRequestValidation(self):
    session_csrf = self.session['csrf']
    client_csrf = self.request.headers['X-Bliss-CSRF']
    if not client_csrf:
      raise Exception('Missing client csrf token')
    if client_csrf != session_csrf:
      raise Exception('Client csrf token {0!r} does not match '
                      'session csrf token {1!r}'
                      .format(client_csrf, session_csrf))

  def dispatch(self):
    # Get a session store for this request.
    self.session_store = sessions.get_store(request=self.request)
    # Ensure valid session is present (including GET requests)
    self.session
    self.user = model.GetUser(self.get_user_key())
    if self.request.method != 'GET':
      self._PerformCsrfRequestValidation()

    try:
      # Dispatch the request.
      webapp2.RequestHandler.dispatch(self)
    finally:
      # Save all sessions.
      self.session_store.save_sessions(self.response)

  @webapp2.cached_property
  def session(self):
    # Returns a session using the default cookie key.
    session = self.session_store.get_session()
    if not session:
      # initialize the session
      session['csrf'] = security.generate_random_string(entropy=128)
      self.response.set_cookie('csrf', session['csrf'])
      suffix = security.generate_random_string(
          length=10,
          pool=security.LOWERCASE_ALPHANUMERIC)
      session[_ANON_USER_KEY] = 'user_{0}'.format(suffix)
    return session


class BlissHandler(SessionHandler):
  """Convenice request handler with bliss specific functionality."""

  def not_found(self):
    self.render('404.html', path_info=self.request.path_info)

  @webapp2.cached_property
  def project_name(self):
    return mimic.GetProjectNameFromPathInfo(self.request.path_info)

  @webapp2.cached_property
  def project(self):
    if not self.project_name:
      return None
    return model.GetProject(self.project_name)

  @webapp2.cached_property
  def tree(self):
    if not self.project:
      raise Exception('Project {0} does not exist'.format(self.project_name))
    # TODO: instantiate tree elsewhere
    assert namespace_manager.get_namespace() == self.project_name, (
        'namespace_manager.get_namespace()={0!r}, project_name={1!r}'
        .format(namespace_manager.get_namespace(), self.project_name))
    return common.config.CREATE_TREE_FUNC(self.project_name)

  def dispatch(self):
    if not shared.ThisIsBlissApp():
      url = 'https://{0}/bliss'.format(settings.BLISS_HOSTNAME)
      self.error(501)  # not implemented
      self.response.write('Bliss user interface not implemented here.<br>'
                          'See <a href="{0}">{0}</a> instead.'
                          .format(url))
      return

    # Dispatch the request.
    SessionHandler.dispatch(self)

  def handle_exception(self, exception, debug_mode):
    """Called if this handler throws an exception during execution.

    Args:
      exception: the exception that was thrown
      debug_mode: True if the web application is running in debug mode
    """
    if not isinstance(exception, error.BlissError):
      super(BlissHandler, self).handle_exception(exception, debug_mode)
      return
    self.error(500)
    logging.exception(exception)
    self.response.clear()
    self.response.headers['Content-Type'] = 'text/plain'
    self.response.out.write('%s' % (cgi.escape(exception.message, quote=True)))

  def render(self, template, *args, **kwargs):
    """Renders the provided template."""
    template = _JINJA2_ENV.get_template(template)

    namespace = mimic.GetNamespace() or settings.BLISS_NAMESPACE
    app_id = app_identity.get_application_id()

    if _DEV_APPSERVER:
      datastore_admin_url = '/_ah/admin/datastore?namespace=%s' % namespace
      memcache_admin_url = '/_ah/admin/memcache?namespace=%s' % namespace
    elif users.is_current_user_admin():
      datastore_admin_url = ('https://appengine.google.com/datastore/explorer'
                             '?&app_id=%s&namespace=%s' % (app_id, namespace))
      memcache_admin_url = ('https://appengine.google.com/memcache'
                            '?&app_id=%s&namespace=%s' % (app_id, namespace))
    else:
      datastore_admin_url = None
      memcache_admin_url = None

    if self.project:
      kwargs['project_name'] = self.project.project_name
      kwargs['project_description'] = self.project.project_description
      kwargs['project_run_url'] = ('/bliss/p/{0}/run'
                                   .format(self.project.project_name))

    if users.get_current_user():
      kwargs['is_logged_in'] = True
    if users.is_current_user_admin():
      kwargs['is_admin'] = True

    self.response.write(template.render(
        *args,
        namespace=namespace,
        email=self.user.key.id(),
        git_bliss_url='http://code.google.com/p/cloud-playground/',
        datastore_admin_url=datastore_admin_url,
        memcache_admin_url=memcache_admin_url,
        **kwargs))


class GetFile(BlissHandler):

  def get(self, project_name, filename):
    """Handles HTTP GET requests."""
    assert project_name
    assert filename
    contents = self.tree.GetFileContents(filename)
    if contents is None:
      self.response.set_status(404)
      self.response.headers['Content-Type'] = 'text/plain'
      self.response.write('File does not exist: %s' % filename)
      return

    self.response.headers['Content-Type'] = shared.GuessMimeType(filename)
    self.response.write(contents)


class PutFile(BlissHandler):

  def put(self, project_name, filename):
    """Handles HTTP PUT requests."""
    assert project_name
    assert filename
    self.tree.SetFile(path=filename,
                                        contents=self.request.body)

    self.response.headers['Content-Type'] = 'text/plain'
    self.response.write('OK')


class MoveFile(BlissHandler):

  def post(self, project_name, oldpath):
    """Handles HTTP POST requests."""
    assert project_name
    assert oldpath
    if not model.GetProject(project_name):
      raise Exception('Project {0} does not exist'.format(project_name))
    newpath = self.request.get('newpath')
    assert newpath
    self.tree.MoveFile(oldpath, newpath)


class DeletePath(BlissHandler):

  def post(self, project_name, path):
    """Handles HTTP POST requests."""
    assert project_name
    if not model.GetProject(project_name):
      raise Exception('Project {0} does not exist'.format(project_name))
    self.tree.DeletePath(path)


class ListFiles(BlissHandler):

  def get(self, project_name, path):
    """Handles HTTP GET requests."""
    project = model.GetProject(project_name)
    if not project:
      return self.not_found()
    r = self.tree.ListDirectory(path)
    self.response.headers['Content-Type'] = _JSON_MIME_TYPE
    self.response.write(tojson(r))


class Project(BlissHandler):

  def get(self, project_name):
    """Handles HTTP GET requests."""
    assert project_name
    project = model.GetProject(project_name)
    if not project:
      return self.not_found()
    self.render('project.html')


class WhoAmI(BlissHandler):

  def get(self, project_name):
    """Handles HTTP GET requests."""
    assert project_name
    project = model.GetProject(project_name)
    if not project:
      return self.not_found()
    major_version = os.environ['CURRENT_VERSION_ID'].split('.')[0]
    if _DEV_APPSERVER:
      version_hostname = self.request.headers['HOST']
    else:
      default_hostname = app_identity.get_default_version_hostname()
      version_hostname = '{0}{1}{2}'.format(major_version, _DASH_DOT_DASH,
                                            default_hostname)

    r = {
        'project_name': project.project_name,
        'project_description': project.project_description,
        'hostname': version_hostname,
    }
    self.response.headers['Content-Type'] = _JSON_MIME_TYPE
    self.response.write(tojson(r))


class Bliss(BlissHandler):

  def get(self):
    """Handles HTTP GET requests."""
    projects = model.GetProjects(self.user)
    p = [(p.project_name, p.project_description) for p in projects]
    template_sources = model.GetTemplateSources()
    tuples = [(s, model.GetTemplates(s)) for s in template_sources]
    self.render('main.html',
                projects=p,
                template_tuples=tuples)


class Login(BlissHandler):

  def get(self):
    """Handles HTTP GET requests."""
    self.redirect(users.create_login_url('/bliss'))


class Logout(BlissHandler):

  def get(self):
    """Handles HTTP GET requests."""
    self.redirect(users.create_logout_url('/bliss'))


class RunProject(BlissHandler):

  def get(self, project_name):
    """Handles HTTP GET requests."""
    if not common.IsDevMode():
      # production
      self.redirect('https://{0}{1}{2}/'
                    .format(urllib.quote_plus(project_name),
                            _DASH_DOT_DASH,
                            settings.PLAYGROUND_HOSTNAME))
    if mimic.GetProjectNameFromCookie() == project_name:
      # cookie already set; proceed to app
      self.redirect('/')
      return
    if self.request.get('set_cookie'):
      # set cookie and redirect
      self.response.set_cookie(common.config.PROJECT_NAME_COOKIE, project_name)
      self.redirect('/')
      return
    # interstitual
    self.response.write("""
      <html>
        <head>
          <meta http-equiv="refresh" content="0;URL='{2}'">
        </head>
        <body>
          Bliss needs to set a special (dev_appserver only) cookie in
          order to simulate the multiple hostnames provided by App Engine's
          production environment:
          <blockquote>
            Set cookie <code>{0}={1}</code> and
           <a href="{2}">proceed</a>.
          </blockquote>
        </body>
      </html>
      """.format(common.config.PROJECT_NAME_COOKIE, project_name,
                 self.request.path_info + '?set_cookie=1'))


class EasyCreateProject(BlissHandler):
  """Request handler for creating projects via an HTML link."""

  def get(self):
    # allow project creation via:
    # https://appid.appspot.com/bliss/c?template_url=...
    project_name = model.NewProjectName()
    template_url = self.request.get('template_url')
    self.redirect('/bliss/p/{0}/create?template_url={1}'.format(project_name,
                                                                template_url))


class CreateProject(BlissHandler):
  """Request handler for creating projects."""

  def get(self, project_name):
    # allow EasyCreateProject GET to redirect here
    self.post(project_name)
    self.redirect('/bliss/p/{0}'.format(project_name))

  def post(self, project_name):
    """Handles HTTP POST requests."""
    assert project_name
    if (_DASH_DOT_DASH in project_name
        or not _VALID_PROJECT_RE.match(project_name)):
      raise error.BlissError('Project name must match {0} and must not contain '
                             '{1!r}'.format(_VALID_PROJECT_RE.pattern,
                                            _DASH_DOT_DASH))
    template_url = self.request.get('template_url')
    project_description = (self.request.get('project_description')
                           or project_name)
    self.make_template_project(template_url, project_name, project_description)

  @ndb.transactional(xg=True)
  def make_template_project(self, template_url, project_name,
                            project_description):
    model.CreateProject(self.user,
                        project_name=project_name,
                        project_description=project_description)
    if codesite.IsCodesiteURL(template_url):
      codesite.PopulateProjectFromCodesite(tree=self.tree,
                                           template_url=template_url)
    else:
      model.PopulateProjectWithTemplate(tree=self.tree,
                                        template_url=template_url)


class DeleteProject(BlissHandler):

  def post(self, project_name):
    assert project_name
    if not model.GetProject(project_name):
      raise Exception('Project {0} does not exist'.format(project_name))
    model.DeleteProject(self.user, tree=self.tree,
                        project_name=project_name)


class RenameProject(BlissHandler):

  def post(self, project_name):
    raise Exception('not implemented. unable to rename %s' % project_name)


class AddSlash(webapp2.RequestHandler):

  def get(self):
    self.redirect(self.request.path_info + '/')


class Nuke(BlissHandler):

  def post(self):
    if not users.is_current_user_admin():
      shared.e('You must be an admin for this app')
    model.DeleteTemplates()
    self.redirect('/bliss')


config = {}
config['webapp2_extras.sessions'] = {
    'secret_key': secret.GetSecret('webapp2_extras.sessions', entropy=128),
}

app = webapp2.WSGIApplication([
    # tree actions
    ('/bliss/p/(.*)/getfile/(.*)', GetFile),
    ('/bliss/p/(.*)/putfile/(.*)', PutFile),
    ('/bliss/p/(.*)/movefile/(.*)', MoveFile),
    ('/bliss/p/(.*)/deletepath/(.*)', DeletePath),
    ('/bliss/p/(.*)/listfiles/(.*)', ListFiles),

    # project actions
    ('/bliss/p/(.*)/create', CreateProject),
    ('/bliss/p/(.*)/delete', DeleteProject),
    ('/bliss/p/(.*)/rename', RenameProject),
    ('/bliss/p/(.*)/run', RunProject),
    ('/bliss/p/(.*)/whoami', WhoAmI),

    # bliss actions
    ('/bliss/c', EasyCreateProject),

    # /bliss/p/project_name/
    ('/bliss/p/(.*)/', Project),
    ('/bliss/p/[^/]+$', AddSlash),

    # admin tools
    ('/bliss/nuke', Nuke),

    # /bliss
    ('/bliss', AddSlash),
    ('/bliss/', Bliss),
    ('/bliss/login', Login),
    ('/bliss/logout', Logout),
], debug=True, config=config)
