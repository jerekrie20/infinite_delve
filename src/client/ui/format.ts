// Number formatting for UI surfaces. Home of `formatShort`, the canonical
// abbreviated-number rule cited in game_design/FORMULAS.md ("Format rule") —
// every gold/damage/XP display uses THIS, so the client never shows the same
// quantity two different ways. Moved out of the deleted legacy HTML HUD.

/** Abbreviate large numbers: 1000→1k, 1200→1.2k, 100000→100k, 1e6→1m, 1e9→1b. */
export function formatShort(n: number): string {
  const v = Math.floor(n);
  if (v < 1000) return String(v);
  const units: Array<{ v: number; s: string }> = [
    { v: 1e12, s: 't' },
    { v: 1e9, s: 'b' },
    { v: 1e6, s: 'm' },
    { v: 1e3, s: 'k' },
  ];
  for (const u of units) {
    if (v >= u.v) {
      const scaled = v / u.v;
      const str =
        scaled < 10 ? scaled.toFixed(1).replace(/\.0$/, '') : String(Math.floor(scaled));
      return str + u.s;
    }
  }
  return String(v);
}
