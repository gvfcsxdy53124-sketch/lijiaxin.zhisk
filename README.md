# UniAction Knowledge Console

Enterprise knowledge management console built with React, Vite, TypeScript, Tailwind CSS, React Router, and Zustand.

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Project Structure

```text
src/
  app/                 Application shell and global providers
  routes/              React Router route definitions
  components/          Global layout and UI primitives
  features/            Business modules by domain
  stores/              Global Zustand stores
  services/            Request layer and shared service clients
  utils/               Global pure utilities
  types/               Global TypeScript types
  constants/           Global constants and mock fixtures
  styles/              Global styles
```

## Development Rules

- Keep feature code inside `src/features/<domain>`.
- Feature modules own their own `pages`, `components`, `hooks`, `store`, and `api` folders.
- Keep reusable UI primitives inside `src/components`.
- Keep cross-feature types, data fixtures, and utilities in `src/types`, `src/constants`, and `src/utils`.
- Define application routes in `src/routes/index.tsx`.
- Use global Zustand stores under `src/stores`; use feature-local stores under `src/features/<domain>/store`.
- Keep each source file under 1000 lines.
- Prefer typed props and pure helper functions over implicit shared state.
