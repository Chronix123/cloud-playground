"""URL Fetch Tree which caches responses during the current request."""


import os

import urlfetch_tree


class CachingUrlFetchTree(urlfetch_tree.UrlFetchTree):
  """An caching implementation of URL Fetch Tree."""

  def __init__(self, project_name=None):
    super(CachingUrlFetchTree, self).__init__(project_name)
    self.file_cache = {}
    # uniquely identifies the current HTTP request
    self.request_log_id = os.environ['REQUEST_LOG_ID']

  def RemoteGetFile(self, path):
    # cached should not be used across multiple requests
    assert self.request_log_id == os.environ['REQUEST_LOG_ID']
    f = self.file_cache.get(path)
    if not f:
      f = super(CachingUrlFetchTree, self).RemoteGetFile(path)
      self.file_cache[path] = f
    return f

  def RemotePutFile(self, path, content):
    resp = super(CachingUrlFetchTree, self).RemotePutFile(path, content)
    self.file_cache.pop(path, None)
    return resp
