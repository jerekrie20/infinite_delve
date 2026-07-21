// Local-preview config for the dev TOOLS under tools/ (the UI atlas picker and
// the ui-map editor). Separate from the game preview (vite.preview.mjs, port
// 5178) and from the Devvit build (vite.config.ts) so these dev-only pages never
// ship in the app bundle.
//   Run:  npx vite --config vite.tools.mjs   →  http://localhost:5179/ui-map.html
// publicDir points at the client's public dir so /ui-sheet.png, /ui-sheet.json,
// and /ui-map.json all resolve here too.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'tools',
  publicDir: resolve(process.cwd(), 'src/client/public'),
  server: {
    port: 5179,
    strictPort: true,
    fs: { strict: false },
  },
});
