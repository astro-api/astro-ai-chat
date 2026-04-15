#!/bin/bash
# Ad-hoc code signing for macOS distribution without Apple Developer ID.
# This allows the app to run on macOS without Gatekeeper blocking it
# (users may need to right-click → Open on first launch).

APP_PATH="$BUILT_APP_PATH"

if [ -z "$APP_PATH" ]; then
  echo "sign.sh: BUILT_APP_PATH not set, skipping"
  exit 0
fi

echo "sign.sh: signing $APP_PATH"
codesign --deep --force --sign - "$APP_PATH"
echo "sign.sh: done"
