#!/bin/zsh
set -eu
cd "${0:A:h}/.."
mkdir -p build/swift-cache release
node scripts/collect-licenses.mjs
npm run build > build/vite.log
app='release/REA Markdown.app'
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp native/App.swift build/main.swift
xcrun swiftc build/main.swift native/DocumentStore.swift native/ImageAssets.swift native/ImageTransfer.swift native/Workspace.swift native/FileWatcher.swift native/WorkspaceSearch.swift native/WritingPreferences.swift \
  -target "$(uname -m)-apple-macos13.0" \
  -o "$app/Contents/MacOS/REAMarkdown" \
  -framework Cocoa -framework WebKit -module-cache-path build/swift-cache
cp native/Info.plist "$app/Contents/Info.plist"
cp native/Resources/AppIcon.icns "$app/Contents/Resources/AppIcon.icns"
cp THIRD_PARTY_NOTICES.md "$app/Contents/Resources/THIRD_PARTY_NOTICES.md"
cp docs/THIRD_PARTY_LICENSES.txt "$app/Contents/Resources/THIRD_PARTY_LICENSES.txt"
rm -rf "$app/Contents/Resources/web"
cp -R dist "$app/Contents/Resources/web"
node -e 'const fs=require("fs"); const p="release/REA Markdown.app/Contents/Resources/web/index.html"; fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("type=\"module\" crossorigin", "defer"));'
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
