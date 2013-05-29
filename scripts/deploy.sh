#!/bin/bash
#
set -ue

VERSION=$(git log -1 --pretty=format:%H)
if [ -n "$(git status --porcelain)" ]
then
  git status
  echo
  echo -e "Hit [ENTER] to continue: \c"
  read
  VERSION="dirty-$VERSION"
fi


$(dirname $0)/sdkapi.sh

APPCFG=$(which appcfg.py) \
  || (echo "ERROR: appcfg.py must be in your PATH"; exit 1)
while [ -L $APPCFG ]
do
  APPCFG=$(readlink $APPCFG)
done

SDK_HOME=$(dirname $APPCFG)

function deploy() {
  echo -e "\n*** Rolling back any pending updates (just in case) ***\n"
  appcfg.py --oauth2 $* rollback .

  echo -e "\n*** DEPLOYING ***\n"
  appcfg.py --oauth2 $* update -V $VERSION .

  echo -e "\n*** SETTING DEFAULT VERSION ***\n"
  appcfg.py --oauth2 $* set_default_version -V $VERSION .
}


if [ $( echo "$*" | egrep -- '-A'\|'--application=' >/dev/null; echo $? ) == 0 ]
then
  deploy $*
else
  appids=$(PYTHONPATH=$SDK_HOME SERVER_SOFTWARE=$0 APPLICATION_ID=foo python -c 'import settings; settings.PrintAppIdsInMap()')
  for appid in $appids
  do
    deploy -A $appid $*
  done
fi
