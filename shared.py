"""Module for shared playground functions."""

import httplib
import logging

from mimic.__mimic import common
from mimic.__mimic import mimic

import model
import settings

from google.appengine.api import app_identity
from google.appengine.api import namespace_manager
from google.appengine.api import urlfetch


def e(msg, *args, **kwargs):
  if isinstance(msg, basestring):
    msg = msg.format(*args, **kwargs)
  raise Exception(repr(msg))


def w(msg, *args, **kwargs):
  if isinstance(msg, basestring):
    msg = msg.format(*args, **kwargs)
  logging.warning('##### {0}'.format(repr(msg)))


def Fetch(url, follow_redirects=False, async=False):
  """Make an HTTP request using URL Fetch."""
  rpc = urlfetch.create_rpc()
  urlfetch.make_fetch_call(rpc, url,
                           follow_redirects=follow_redirects,
                           validate_certificate=True)
  if async:
    return rpc
  response = rpc.get_result()
  if response.status_code != httplib.OK:
    e('Status code {0} fetching {1} {2}', response.status_code, url,
      response.content)
  return response


def ThisIsPlaygroundApp():
  """Determines whether this is the playground app id."""
  if common.IsDevMode():
    return True
  return app_identity.get_application_id() == settings.PLAYGROUND_APP_ID


def DoesCurrentProjectExist():
  """Checks whether the curent project exists."""
  project_id = mimic.GetProjectId()
  if not project_id:
    return None
  prj = model.GetProject(project_id)
  if not prj:
    return None
  assert namespace_manager.get_namespace() == project_id, (
      'namespace_manager.get_namespace()={0!r}, project_id={1!r}'
      .format(namespace_manager.get_namespace(), project_id))
  return True
