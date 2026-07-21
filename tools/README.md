# Dev Tools

All tools live under `tools/` and are served by the tools Vite server:

```
npx vite --config vite.tools.mjs
```

Opens at **http://localhost:5179**. The server's root is `tools/` — any HTML file here is directly accessible by name (e.g. `/combat-sim.html`).

---

## Tools

### ⚔️ Combat Sim (`combat-sim.html`)

**Visual, tick-by-tick combat simulator.** Configure hero stats + depth, then watch the auto-battle play out with detailed event logging.

- **Hero config**: ATK, DEF%, HP, Crit%, Lifesteal%, Dodge%, HP Regen
- **Presets**: Fresh Squire → Mid Gear → Geared → Endgame (click to load)
- **Depth selector**: spawns the correct monster template + rarity + passives
- **Visual HP bars**: green hero / red monster, animate each tick
- **Combat log**: color-coded — hero hits, monster hits, crits, procs (thorns, dodge, block, revive, explode, doubleStrike, execute, lifesteal, counterAttack, armorPierce)
- **Controls**: Run (auto-play), Step (one tick), Reset, speed selector (instant / fast / normal / slow)
- **Result banner**: winner, total damage dealt, proc counters per side

Also available as a CLI version: `npx tsx tools/combat-sim.ts [depth] [atk] [def] [hp]` — logs the same events to the console.

---

### 🎒 Gear Editor (`gear-editor.html`)

**Full gear data editor.** Two tabs:

- **Items**: edit every base item (weapon, shield, armor, helm, greaves, boots, belt, rings, amulet). Change slot, primary stat, affix pools. See which stats are in each pool.
- **Stat Registry**: browse all 41 stats — name, abbreviation, kind (flat/behavioral), hook point, handler, implemented flag, max cap, per-budget. Toggle `implemented` on/off to stage or activate stats.

Right panel shows the compiled TypeScript output. **Download** or **Copy JSON** to export. Loads live data from localStorage, seeds from the built-in defaults.

---

### 🗺️ UI Map Editor (`ui-map.html`)

**Assign sprite sheet frames to HUD roles.** The wooden-fantasy UI kit lives in `src/client/public/ui-sheet.png` (1024² atlas). This tool maps frames → semantic roles for the Phaser canvas HUD.

- **Left**: picker — browse all frames, hover for name/size, click for coords
- **Right**: 29 predefined role cards (Panels, Buttons, Bars, Slots, Icons)
- **Flow**: click a role's "Assign…" → click a frame → assigned
- **Nine-slice roles**: L/T/R/B inset inputs + live stretch preview
- **Bar roles**: fill-color picker (HP bar red, MP bar blue, XP bar purple)
- **Autosave** to localStorage. **Download ui-map.json** or **Copy JSON** to export.

Output goes to `src/client/public/ui-map.json` — the game's HudScene reads this at load time.

---

### 🔍 UI Atlas Picker (`picker.html`)

**Raw sprite-sheet frame browser.** Part of the UI map editor workflow — a lightweight viewer for all frames in `ui-sheet.png`.

- Browse all frames with zoom and hide-slivers toggle
- Hover = name + pixel size
- Click = frame coords + Phaser snippet (ready to paste into code or the map editor)

---

### 🖼️ HUD Preview (`hud-preview.html`)

**Static HTML preview of the HUD layout.** Renders the DOM-based HUD (the original pre-canvas version) for layout reference. Shows top bar, stat bars, skill slots, gear grid, money display, and bag button. Purely visual — no game logic.

---

## Other files

| File | Purpose |
|------|---------|
| `combat-sim.ts` | CLI version of the combat simulator — run with `npx tsx tools/combat-sim.ts [depth] [atk] [def] [hp]` |
| `tsconfig.base.json` | Shared TS config extended by all project tsconfigs |
| `tsconfig.client.json` | Client-side TS config |
| `tsconfig.server.json` | Server-side TS config |
| `tsconfig.shared.json` | Shared-code TS config |
| `tsconfig.vite.json` | Vite build TS config |

---

## Adding a new tool

1. Create `tools/your-tool.html` — standalone HTML (CSS + JS inline)
2. Access at `http://localhost:5179/your-tool.html`
3. Document it in this README

For tools that need to import from `src/shared/`, create a `.ts` file instead and run via `npx tsx`.
