# Server Xtreme IPTV Player

Server Xtreme is a Web + TV layout MVP for an IPTV player. It starts with mock data,
streaming-style catalog organization, keyboard/remote navigation, local playback progress,
and a design system based on the supplied Xtreme Video Engine references.

The login screen connects to Xtream Codes-compatible servers through the local Vite proxy at
`/api/xtream`, validates credentials with `player_api.php`, and replaces the demo catalog with
live, movie, and series catalogs returned by the server.

## Stack

- React, TypeScript, and Vite
- Tailwind CSS with project design tokens
- React Router for screens
- Zustand for local favorites, session, playback progress, and preferences
- Vitest for unit tests
- Playwright for browser, mobile, and TV-like flows
- ESLint, Prettier, and strict TypeScript

## Commands

```bash
npm install
npm run dev
npm run lint
npm run test
npm run build
npm run test:e2e
```

## Commit Standard

Use Conventional Commits in English:

- `feat: add catalog home rails`
- `fix: persist playback progress after refresh`
- `refactor: split player controls`
- `test: cover catalog filtering`
- `docs: document project standards`
- `chore: configure eslint and prettier`

Branch names should be short and scoped, for example:

- `codex/setup-react-vite`
- `codex/catalog-ui`
- `codex/player-progress`
