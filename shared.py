import logging
import os
import re

import mimetypes
import model

from __mimic import mimic

from google.appengine.api import users
from google.appengine.api import namespace_manager


# namespace for bliss specific data
_BLISS_NAMESPACE = '_bliss'

# Extensions to exclude when creating template projects
_SKIP_EXTENSIONS = ('swp','pyc','svn')


def e(msg, *args, **kwargs):
  if isinstance(msg, basestring):
    msg = msg.format(*args, **kwargs)
  raise Exception(repr(msg))


def w(msg, *args, **kwargs):
  if isinstance(msg, basestring):
    msg = msg.format(*args, **kwargs)
  logging.warning('##### {0}'.format(repr(msg)))


# TODO: use the MIME Type list at http://codemirror.net/
_TEXT_MIME_TYPES = {
  'css': 'text/css',
  # *.dart uses *.js MIME Type for now
  'dart': 'text/javascript',
  'html': 'text/html',
  'js': 'text/javascript',
  'jsp': 'application/x-jsp',
  'json': 'application/json',
  'php': 'application/x-httpd-php',
  'sh': 'text/x-sh',
  'sql': 'text/x-mysql',
  'xml': 'application/xml',
  'yaml': 'text/x-yaml',
}


def IsTextMimeType(mime_type):
  return mime_type.startswith('text/') or mime_type in _TEXT_MIME_TYPES.values()


def GetExtension(filename):
  return filename.lower().split('.')[-1]


def GuessMimeType(filename):
  """Guess the MIME Type based on the provided filename."""
  extension = GetExtension(filename)
  if extension in _TEXT_MIME_TYPES:
    return _TEXT_MIME_TYPES[extension]
  mime_type, _ = mimetypes.guess_type(filename)
  if not mime_type:
    logging.warning('Failed to guess MIME Type for "%s" with extension "%s"',
                    filename, extension)
    # TODO: remove once production App Engine does not return (None, None) for
    # import mimetypes; mimetypes.guess_type('favicon.ico')
    if extension == 'ico':
      mime_type = 'image/x-icon'
  if mime_type:
    return mime_type
  return 'text/plain'


def DoesCurrentProjectExist():
  project_name = mimic.GetProjectName()
  if not project_name:
    return None
  prj = model.GetProject(project_name)
  if not prj:
    return None
  assert namespace_manager.get_namespace() == project_name
  return True
