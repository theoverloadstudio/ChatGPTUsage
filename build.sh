#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
output="${1:-$PWD/ChatGPTUsage.app}"
build="$(/usr/bin/mktemp -d)"
trap 'rm -rf "$build"' EXIT
cat model.js updates.js app.js > "$build/main.js"
staging="$build/ChatGPTUsage.app"
/usr/bin/osacompile -l JavaScript -s -o "$staging" "$build/main.js"
plist="$staging/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Add :CFBundleIdentifier string com.theoverloadstudio.chatgptusage' "$plist"
/usr/libexec/PlistBuddy -c 'Add :CFBundleVersion string 3' "$plist"
/usr/libexec/PlistBuddy -c 'Add :CFBundleShortVersionString string 1.0.2' "$plist"
/usr/libexec/PlistBuddy -c 'Add :LSUIElement bool true' "$plist"
/usr/libexec/PlistBuddy -c 'Add :LSMinimumSystemVersion string 13.0' "$plist"
for key in NSAppleEventsUsageDescription NSAppleMusicUsageDescription NSCalendarsUsageDescription NSCameraUsageDescription NSContactsUsageDescription NSHomeKitUsageDescription NSMicrophoneUsageDescription NSPhotoLibraryUsageDescription NSRemindersUsageDescription NSSiriUsageDescription NSSystemAdministrationUsageDescription; do
  /usr/libexec/PlistBuddy -c "Delete :$key" "$plist" 2>/dev/null || :
done
if [[ -f ChatGPTUsage.icns ]]; then
  cp ChatGPTUsage.icns "$staging/Contents/Resources/applet.icns"
fi
/usr/bin/codesign --force --sign - "$staging"
/usr/bin/codesign --verify --deep --strict "$staging"
if [[ -e "$output" ]]; then
  echo "Output already exists: $output" >&2
  exit 1
fi
/usr/bin/ditto "$staging" "$output"
