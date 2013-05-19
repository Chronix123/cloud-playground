"""Module for shared playground functions."""

import logging
import os

from mimic.__mimic import common
from mimic.__mimic import mimic

import settings

from google.appengine.api import app_identity
from google.appengine.api import namespace_manager


# 10 minutes
MEMCACHE_TIME = 3600


def e(msg, *args, **kwargs):
  if isinstance(msg, basestring):
    if args or kwargs:
      msg = msg.format(*args, **kwargs)
  raise RuntimeError(repr(msg))


def i(msg, *args, **kwargs):
  if isinstance(msg, basestring):
    if args or kwargs:
      msg = msg.format(*args, **kwargs)
  logging.info('@@@@@ {0}'.format(repr(msg)))


def w(msg, *args, **kwargs):
  if isinstance(msg, basestring):
    if args or kwargs:
      msg = msg.format(*args, **kwargs)
  logging.warning('##### {0}'.format(repr(msg)))


def GetCurrentTaskName():
  return os.environ.get('HTTP_X_APPENGINE_TASKNAME')


def EnsureRunningInTask():
  """Ensures that we're currently executing inside a task.

  If not, raise a RuntimeError.
  """
  if GetCurrentTaskName():
    return
  raise RuntimeError('Not executing in a task queue')


def ThisIsPlaygroundApp():
  """Determines whether this is the playground app id."""
  if common.IsDevMode():
    return True
  return app_identity.get_application_id() == settings.PLAYGROUND_APP_ID
