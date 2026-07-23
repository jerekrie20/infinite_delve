# Delve — Agent Brief

Idle looter RPG running as a Reddit Devvit **web** app. Phaser client in an
iframe · Hono server on Devvit serverless · Redis persistence · shared pure
TypeScript game layer.

**Read these, in order, before non-trivial work:**

1. `CODING_BIBLE.md` — engineering law + project structure (this repo)
2. `game_design/DECISIONS.md` — design source of truth (D1-D49). Design
   questions are answered THERE, never improvised in code
3. `game_design/PLAYBOOK.md` — checklists when adding any content
4. `TODO.md` — the build roadmap (phases; gates in `game_design/METRICS.md`)

## Tech stack (actual — no tRPC, no React)

- **Client** (`src/client/`): Phaser 3 + DOM overlay panels, Vite-built.
  Entrypoints `index.html` (game) + `splash.html` (inline feed view — keep
  featherweight) mapped in `devvit.json`
- **Server** (`src/server/`): Hono routes on Node 22 Devvit serverless.
  `redis`/`reddit`/`context` via `@devvit/web/server`. `/api/*` = client
  endpoints, `/internal/*` = menu/forms/triggers/scheduler (must be mapped
  in `devvit.json`)
- **Shared** (`src/shared/`): pure game math + data registries. No I/O, no
  client/server imports, no `Math.random` (injected `Rng` only)

## Hard rules

- **No builds in dev**: never run `npm run build` / `devvit` CLI /
  `vite build` unprompted. Validate with `npm run type-check`,
  `npm run lint`, `npx tsx tests/<file>` (there is NO `npm run test` yet)
- Devvit web only — never use `@devvit/public-api` or "blocks" code
- Client: `navigateTo` not `window.location`; `showToast`/`showForm` not
  `alert`; no inline script tags in HTML
- Server owns all value; never trust client amounts; new endpoints ship
  with rate limits + input caps
- Named exports, no default exports, no type casts, descriptive full-word
  variable names, house file-header comments

Docs: https://developers.reddit.com/docs/llms.txt
