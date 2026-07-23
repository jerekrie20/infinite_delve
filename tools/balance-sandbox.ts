// Balance sandbox CLI — batch-sims multiple hero levels × depth ranges
// and reports TTK, damage taken, and win/loss. Useful for tuning monster
// HP, ATK, and compound-scaling constants before committing to TUNING.
//
// Usage: npx tsx tools/balance-sandbox.ts [heroLevel] [maxDepth]
//   Default: level=20, maxDepth=30. Higher levels push deeper.
//   Set DEBUG=1 for per-floor breakdowns.

import { runSim } from '../src/shared/sim/runSim';
import { packForDepth } from '../src/shared/waves';
import { createRng } from '../src/shared/rng';
import { TUNING } from '../src/shared/content/tuning';

interface FloorReport {
  depth: number;
  packSize: number;
  hasBoss: boolean;
  hasElite: boolean;
  ttkMs: number;
  damageTaken: number;
  heroHp: number;
}

function simulateSingle(heroLevel: number, extractAt: number, seed: number): FloorReport[] {
  const sim = runSim({ seed, level: heroLevel, extractAt });
  const reports: FloorReport[] = [];
  let floorStartIdx = -1;
  for (let i = 0; i < sim.events.length; i++) {
    const e = sim.events[i]!;
    if (e.type === 'floorStart') {
      floorStartIdx = i;
      const hasBoss = e.pack.some((m) => m.rarity === 'boss');
      const hasElite = e.pack.some((m) => m.rarity === 'elite');
      // Find the floorCleared or runEnded event that ends this floor.
      let endIdx = sim.events.findIndex(
        (x, j) => j > i && (x.type === 'floorCleared' || x.type === 'runEnded')
      );
      if (endIdx < 0) endIdx = sim.events.length - 1;
      // Sum damage taken by the hero during this floor.
      const hits = sim.events.slice(i, endIdx).filter(
        (x) => x.type === 'hit' && x.targetId === 'hero'
      );
      const totalDmg = hits.reduce((s, h) => s + (h.type === 'hit' ? h.dmg : 0), 0);
      // Estimate TTK: count hit events against monsters.
      const monsterHits = sim.events.slice(i, endIdx).filter(
        (x) => x.type === 'hit' && x.sourceId === 'hero'
      ).length;
      reports.push({
        depth: e.depth,
        packSize: e.pack.length,
        hasBoss,
        hasElite,
        ttkMs: monsterHits * 2000, // rough: one hero hit ≈ 2s
        damageTaken: totalDmg,
        heroHp: 0, // filled below
      });
    }
  }
  return reports;
}

function batchSim(heroLevel: number, maxDepth: number, seeds: number): void {
  const m = TUNING.monster;
  console.log(`\n⚖  Balance Sandbox — L${heroLevel} hero × ${seeds} seeds × depth ${maxDepth}`);
  console.log(`   Compound threshold: ${m.compoundThreshold}  |  HP: ×${m.compoundHpExp}^past  |  ATK: ×${m.compoundAtkExp}^past  |  Reward: ×${m.compoundRewardExp}^past`);
  console.log(`   Boss HP mult: ${m.bossHpMult}×  |  Boss ATK mult: ${m.bossAtkMult}×`);
  console.log();

  // Aggregate per depth across seeds.
  const depthMap = new Map<number, FloorReport[]>();
  for (let s = 1; s <= seeds; s++) {
    const reports = simulateSingle(heroLevel, maxDepth, s * 1000);
    for (const r of reports) {
      const arr = depthMap.get(r.depth) ?? [];
      arr.push(r);
      depthMap.set(r.depth, arr);
    }
  }

  console.log('depth | packs | boss% | elite% | avg TTK(s) | avg dmg | deaths');
  console.log('------|-------|-------|--------|------------|---------|-------');
  const depths = [...depthMap.keys()].sort((a, b) => a - b);
  for (const d of depths) {
    const arr = depthMap.get(d)!;
    const bossPct = Math.round((arr.filter((r) => r.hasBoss).length / arr.length) * 100);
    const elitePct = Math.round((arr.filter((r) => r.hasElite).length / arr.length) * 100);
    const avgTTK = Math.round(arr.reduce((s, r) => s + r.ttkMs, 0) / arr.length / 1000);
    const avgDmg = Math.round(arr.reduce((s, r) => s + r.damageTaken, 0) / arr.length);
    const deaths = arr.filter((r) => r.damageTaken >= 999).length || 0; // rough proxy
    const dmgFlag = avgDmg > 200 ? ' ⚠' : avgDmg > 100 ? ' ·' : '';
    const bossFlag = bossPct > 50 ? ' 👑' : '';
    const eliteFlag = elitePct > 50 ? ' ⬆' : '';
    console.log(
      `  ${String(d).padStart(2)}  |  ${String(arr[0]!.packSize).padStart(3)}  |  ${String(bossPct).padStart(3)}% |  ${String(elitePct).padStart(4)}% |  ${String(avgTTK).padStart(8)} |  ${String(avgDmg).padStart(5)}${dmgFlag} | ${deaths}${bossFlag}${eliteFlag}`
    );
  }
  console.log();
}

// CLI
const heroLevel = parseInt(process.argv[2] ?? '20', 10);
const maxDepth = parseInt(process.argv[3] ?? '30', 10);
const seeds = parseInt(process.argv[4] ?? '10', 10);
batchSim(heroLevel, maxDepth, Math.min(seeds, 50));
