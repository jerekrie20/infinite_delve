// Combat sim CLI v2 — a thin shell over the SHARED headless simulator
// (src/shared/sim/runSim.ts), which drives THE combat engine. No combat rule
// lives here (the v1 file re-implemented the loop — that copy is dead).
//
// Run:  npx tsx tools/combat-sim.ts [seed] [level] [extractAt] [--events]
//   seed       number (default 12345) — same seed twice = identical output
//   level      hero level (default 1, naked squire baseline)
//   extractAt  extract after clearing this depth (default: push until death)
//   --events   print the full event log (verbose)
//
// Examples:
//   npx tsx tools/combat-sim.ts                  # seeded baseline push
//   npx tsx tools/combat-sim.ts 42 10 15         # L10 hero, extract at 15
//   npx tsx tools/combat-sim.ts 42 10 15 --events

import { runSim } from '../src/shared/sim/runSim';

const args = process.argv.slice(2).filter((a) => a !== '--events');
const showEvents = process.argv.includes('--events');

const seed = Number(args[0] ?? 12345);
const level = Number(args[1] ?? 1);
const extractAtArg = args[2] !== undefined ? Number(args[2]) : undefined;

const summary = runSim({
  seed,
  level,
  ...(extractAtArg !== undefined ? { extractAt: extractAtArg } : {}),
});

console.log(`── combat sim v2 · seed ${seed} · L${level} squire${extractAtArg !== undefined ? ` · extract@${extractAtArg}` : ' · push-until-death'}`);
console.log(`outcome: ${summary.outcome.toUpperCase()}  depth cleared: ${summary.depthCleared}  gold: ${summary.runGold}  loot: ${summary.haulCount}`);
console.log(`sim time: ${(summary.totalSimMs / 1000).toFixed(0)}s  events: ${summary.eventCount}`);
console.log('');
console.log('depth  pack  ttk(s)  dmg-taken');
for (const f of summary.floors) {
  console.log(
    `${String(f.depth).padStart(5)}  ${String(f.packSize).padStart(4)}  ${(f.ttkMs / 1000).toFixed(1).padStart(6)}  ${String(f.heroDamageTaken).padStart(9)}`
  );
}

if (showEvents) {
  console.log('\n── events ──');
  for (const e of summary.events) console.log(JSON.stringify(e));
}
