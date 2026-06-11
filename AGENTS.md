# AGENTS.md

## Project Mission

This repository is a React + Vite + TypeScript + Tailwind CSS enterprise knowledge management console. Routing uses React Router and shared client state uses Zustand. Keep changes modular, typed, and easy for another engineer or Codex agent to continue.

## Architecture Rules

- `src/app`: application shell, providers, and React Router route-level composition.
- `src/routes`: top-level React Router route definitions, redirects, and route guards.
- `src/components`: reusable UI and layout components with no business ownership.
- `src/features/<domain>`: feature-owned pages, components, hooks, stores, API clients, and feature-local helpers.
- `src/stores`: global Zustand stores only.
- `src/services`: shared request layer and cross-feature service clients.
- `src/utils`: cross-feature pure utilities.
- `src/types`: cross-feature TypeScript types.
- `src/constants`: global constants and shared fixtures.
- Do not put new business logic directly in `src/App.tsx`; it should remain a thin application entry component.
- Define top-level routes in `src/routes/index.tsx`.
- Put shared Zustand stores in `src/stores`; put feature-specific stores inside `src/features/<domain>/store` when the state is not shared.
- Prefer URL state for navigation and shareable filters; prefer Zustand for cross-component UI/application state.

## File Size And Componentization

- A single source file must stay under 1000 lines.
- Start splitting before a file reaches 800 lines.
- Prefer one primary component per file.
- Extract repeated JSX into named components.
- Extract non-trivial state transitions into hooks or pure utility functions.
- Keep mock data outside components.

## Coding Standards

- Use TypeScript for all source files.
- Prefer explicit interfaces for exported component props.
- Use path alias `@/*` for imports from `src` when it improves readability.
- Keep comments short and useful; explain intent, not obvious syntax.
- Avoid adding dependencies unless they replace meaningful complexity.
- Use Tailwind utility classes consistently; do not introduce global CSS for one-off component styling.

## Verification

Before handing off code changes, run:

```bash
npm run lint
npm run build
```

If a command cannot be run, document the reason in the final response.
