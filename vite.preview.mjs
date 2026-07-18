// Local-preview-only Vite config (NOT the Devvit build — that stays in
// vite.config.ts). The Devvit plugin only supports `vite build`, so this plain
// config lets us run a dev server to see the Phaser client render standalone.
// The /api/* calls fall back to mock data here; real API is tested via
// `npm run dev` (devvit playtest).
//   Run:  npx vite --config vite.preview.mjs
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  server: {
    port: 5178,
    strictPort: true,
    fs: { strict: false },
  },
});
