# Engineering Standards

## Code Organization

- `components/` contains reusable UI pieces.
- `pages/` contains route-level screens.
- `services/` contains data access and persistence adapters.
- `stores/` contains Zustand state.
- `types/` contains shared contracts.
- `data/` contains mock catalog data shaped for a future provider adapter.

## Programming Practices

- Keep React components focused on rendering and interaction wiring.
- Move catalog, playback, session, filtering, and persistence logic into services or stores.
- Use strict TypeScript types for public interfaces.
- Every primary interactive element must support mouse, touch, keyboard, and remote-style focus.
- Design loading, empty, error, focused, hover, active, and selected states where they affect user flow.

## Commits

Use Conventional Commits:

- `feat:` user-facing feature
- `fix:` bug fix
- `refactor:` internal structure change with no behavior change
- `test:` test-only change
- `docs:` documentation-only change
- `chore:` tooling or maintenance

Prefer one logical change per commit.
