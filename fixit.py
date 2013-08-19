"""Module migrating/fixing schemas"""

import webapp2

from mimic.__mimic import common

from google.appengine.api import taskqueue
from google.appengine.datastore.datastore_query import Cursor

import model
import settings
import shared


# number of entities to fix at a time
_PAGE_SIZE = 20


def Begin():
  taskqueue.add(url='/playground/fix/project')


def FixProject(project):
  """Fix or update a project entity."""
  shared.w(project.key.id())
  dirty = False
  if not project.access_key:
    project.access_key = secret.GenerateRandomString()
    dirty = True
  if project._properties.has_key('end_user_url'):
    project._properties.pop('end_user_url')
    dirty = True
  if dirty:
    project.put()
    shared.w('fixed {}'.format(project.key))


class ProjectHandler(webapp2.RequestHandler):

  def post(self):
    assert self.request.environ[common.HTTP_X_APPENGINE_QUEUENAME]
    query = model.PlaygroundProject.query(
        namespace=settings.PLAYGROUND_NAMESPACE)
    cursor = self.request.get('cursor', None)
    if cursor:
      cursor = Cursor(urlsafe=cursor)
    projects, next_cursor, more = query.fetch_page(_PAGE_SIZE,
                                                   start_cursor=cursor)
    if next_cursor:
      taskqueue.add(url='/playground/fix/project',
                    params={'cursor': next_cursor.urlsafe()})
    for project in projects:
      FixProject(project)
    if not next_cursor:
      shared.w('REACHED END OF QUERY CURSOR, '
               'ALTHOUGH OTHER TASKS MAY STILL BE EXECUTING')


app = webapp2.WSGIApplication([
    ('/playground/fix/project', ProjectHandler),
], debug=True)
