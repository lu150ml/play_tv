# Play TV subtitle service

Requires Node 22 or newer. Configure the environment variables documented in
`.env.example`, then run `npm run subtitles:serve` from the repository root.

The Android/web build receives the public service address through
`VITE_SUBTITLE_API_BASE_URL`. The OpenSubtitles key must only exist in this
server process and must never be added to the APK.
