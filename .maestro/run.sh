#!/bin/bash
# Cold-start the app and leave it on the entry screen.
set -e
export JAVA_HOME=$(/usr/libexec/java_home 2>/dev/null || echo /opt/homebrew/opt/openjdk)
export PATH="$JAVA_HOME/bin:$PATH"
M=~/.maestro/bin/maestro
cd "$(dirname "$0")/.."
xcrun simctl terminate booted com.matryxsociallabs.blendn 2>/dev/null || true
$M test .maestro/00-reset.yaml 2>&1 | grep -vE "^WARNING" | tail -3
xcrun simctl openurl booted "exp+blendn://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
sleep 25
$M test .maestro/01-dismiss.yaml 2>&1 | grep -vE "^WARNING" | tail -4
