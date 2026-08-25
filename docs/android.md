# Play TV Android

## Requirements

- Node.js 22 or newer.
- JDK 21 and Android SDK 36, normally supplied by Android Studio.
- A physical device or emulator with Android 7/API 24 or newer.

This workspace can also use the local toolchain in `.tools/jdk21` and
`.tools/android-sdk`. Those directories are intentionally ignored by Git.

## Commands

```powershell
npm run android:sync
npm run android:open
npm run android:apk:debug
npm run android:apk:release
```

The signed release APK is produced at
`android/app/build/outputs/apk/release/app-release.apk`.

## Updates

The Android app checks `android-update.json` shortly after startup and again
when returning to the foreground after six hours. A newer `versionCode` shows
an update prompt. The native updater downloads the HTTPS APK, validates its
SHA-256 value, and opens Android's package installer. Android always requires
the user to approve installation; profiles and history remain in place because
the package id and signing key do not change.

For every release, increase `versionCode` and `versionName`, build with the same
keystore, publish the APK, and then update the manifest URL and SHA-256.

## Signing key

Run `npm run android:keystore` once to create a local release identity. Back up
both `.tools/play-tv-release.jks` and `android/keystore.properties` in a secure
location. Losing either file prevents future APKs from updating an installed
copy of the app. Neither file may be committed.

## External subtitles

Deploy `server/subtitles/server.mjs` on Node 22+, configure
`OPENSUBTITLES_API_KEY`, and build the app with
`VITE_SUBTITLE_API_BASE_URL` pointing to that service. Playback remains
available when the service is absent.

## Device installation

Enable USB debugging, connect the device, and run:

```powershell
.tools\android-sdk\platform-tools\adb.exe install -r artifacts\play-tv-1.1.2-release.apk
```

HTTP IPTV servers are supported and produce an in-app security warning.
Invalid HTTPS certificates are never trusted.
