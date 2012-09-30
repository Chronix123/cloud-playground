"""App Engine configuration file."""

import re

from __mimic import common
from __mimic import datastore_tree
from __mimic import mimic
import settings
import urlfetch_tree

from google.appengine.api import app_identity


# our current app id
app_id = app_identity.get_application_id()

urlfetch_tree_SOURCE_CODE_APP_ID = settings.BLISS_APP_ID

if common.IsDevMode() or urlfetch_tree_SOURCE_CODE_APP_ID == app_id:
  mimic_CREATE_TREE_FUNC = datastore_tree.DatastoreTree
else:
  mimic_CREATE_TREE_FUNC = urlfetch_tree.UrlFetchTree

mimic_PROJECT_NAME_COOKIE = '_bliss_project'

mimic_PROJECT_NAME_FROM_PATH_INFO_RE = re.compile('/bliss/p/(.+?)/')


def namespace_manager_default_namespace_for_request():
  return mimic.GetNamespace()
