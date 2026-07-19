# Infinite Delve

A side-view **idle-looter** that runs natively inside a Reddit post, built on
Reddit's [Devvit](https://developers.reddit.com) platform. Auto-battle down
through an endless dungeon, bank your loot or push deeper, and race the whole
subreddit on a shared daily challenge.

## Stack

- **Client** — [Phaser 3](https://phaser.io) (WebGL) in the Devvit webview,
  TypeScript + [Vite](https://vite.dev). Renders the idle combat lane plus an
  HTML HUD / panels overlay.
- **Server** — TypeScript on Devvit (Node serverless), [Hono](https://hono.dev)
  HTTP routes, Redis for persistence, and a scheduled daily job.
- **Shared** — deterministic combat / reward / meta math imported by both sides
  so the client and server never disagree.

## Layout

- `src/client` — the Phaser client (`main.ts` boots the game, `game/LaneScene.ts`
  is the idle lane, `ui/` holds the HTML overlays).
- `src/server` — the Hono app (`index.ts`), HTTP routes, and `core/` game logic
  (hero, frontier). Access `redis`, `reddit`, and `context` via `@devvit/web/server`.
- `src/shared` — types + pure math shared by client and server.
- `game_design/` — the design vault (open as an [Obsidian](https://obsidian.md) vault).

## Develop

- **`npm run dev`** — `devvit playtest`: build + upload to the test subreddit
  (real Reddit auth, Redis, and the scheduled jobs).
- **`npx vite --config vite.preview.mjs`** — local-only preview of the Phaser
  client at http://localhost:5178. API calls fall back to mock data (no Devvit
  runtime); resize the browser to mobile/portrait.
- **`npm run type-check`** / **`npm run lint`** — the green-bar checks.

See [`AGENTS.md`](AGENTS.md) for stack conventions and [`game_design/`](game_design/)
for the design.
