"""Module for accessing github.com projects."""

import json
import logging
import os

from mimic.__mimic import common

import model
import settings
import shared

from . import collection

from google.appengine.ext import deferred
from google.appengine.ext import ndb


_PLAYGROUND_JSON = '__playground.json'


def IsValidUrl(url):
  return url.startswith(settings.TEMPLATE_PROJECT_DIR)


class FilesystemRepoCollection(collection.RepoCollection):
  """A class for accessing file system code repositories."""

  def __init__(self, repo_collection):
    super(FilesystemRepoCollection, self).__init__(repo_collection)

  def PopulateRepos(self):
    shared.EnsureRunningInTask()  # gives us automatic retries
    repos = []
    template_dir = self.repo_collection.key.id()  # repo_collection_url
    for dirname in os.listdir(template_dir):
      dirpath = os.path.join(template_dir, dirname)
      if not os.path.isdir(dirpath):
        continue
      try:
        f = open(os.path.join(dirpath, _PLAYGROUND_JSON))
        data = json.loads(f.read())
        name = data.get('template_name')
        description = data.get('template_description')
      except IOError:
        name = dirname
        description = dirname
      url = os.path.join(template_dir, dirname)
      repo = model.CreateRepo(url, name=name, description=description)
      repos.append(repo)
    ndb.put_multi(repos)
    for repo in repos:
      deferred.defer(self.CreateTemplateProject, repo.key)

  def PopulateProjectFromRepo(self, tree, repo):
    repo_url = repo.key.id()
    tree.Clear()

    def add_files(dirname):
      for path in os.listdir(os.path.join(repo_url, dirname)):
        if path == _PLAYGROUND_JSON:
          continue
        if common.GetExtension(path) in settings.SKIP_EXTENSIONS:
          continue
        relpath = os.path.join(dirname, path)
        fullpath = os.path.join(repo_url, dirname, path)
        if os.path.isdir(fullpath):
          add_files(relpath)
        else:
          with open(fullpath, 'rb') as f:
            logging.info('- {0}'.format(relpath))
            tree.SetFile(relpath, f.read())

    add_files('')
