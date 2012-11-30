#!/bin/bash
#
set -ue

$(dirname $0)/sdkapi.sh

function deploy() {
  echo -e "\n*** Rolling back any pending updates (just in case) ***\n"
  appcfg.py --oauth2 $* rollback .

  echo -e "\n*** DEPLOYING ***\n"
  appcfg.py --oauth2 $* update .
}


if [ $( echo "$*" | egrep -- '-A'\|'--application=' >/dev/null; echo $? ) == 0 ]
then
  deploy $*
else
  appids=$(SERVER_SOFTWARE=$0 APPLICATION_ID=foo python -c 'import settings; settings.PrintAppIdsInMap()')
  for appid in $appids
  do
    deploy -A $appid $*
  done
fi
