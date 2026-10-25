#!/bin/zsh
set -eu
cd "${0:A:h}/.."
./scripts/build-macos.sh
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' native/Info.plist)
name="REA-Markdown-${version}-macos-$(uname -m).zip"
ditto -c -k --sequesterRsrc --keepParent 'release/REA Markdown.app' "release/$name"
(cd release && shasum -a 256 "$name" > "$name.sha256")
print "Created release/$name"
