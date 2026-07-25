// Self-contained preview of the Phase-3 art pass so far: the 15 ability icons
// shown in grim-glow skill-slot frames, and every regenerated monster animated
// from its real strip PNG (CSS steps() at the game's frame rates).
//   node scratchpad/phase3-preview.mjs <out.html>
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'scratchpad/phase3-preview.html';
const PUB = 'src/client/public';
const b64 = (p) => `data:image/png;base64,${readFileSync(`${PUB}/${p}`).toString('base64')}`;

const CLASSES = [
  { name: '⚔️ Squire', accent: '#ffd77a', abilities: [
    ['slam', 'Slam', 'basic'], ['fortify', 'Fortify', '25◆'], ['tauntingShout', 'Taunting Shout', '15◆'],
    ['whirlwind', 'Whirlwind', '30◆'], ['aegisOath', 'Aegis Oath', '45◆']] },
  { name: '🏹 Archer', accent: '#9fe0a0', abilities: [
    ['piercingShot', 'Piercing Shot', 'basic'], ['tumble', 'Tumble', '15◆'], ['huntersMark', "Hunter's Mark", '15◆'],
    ['volley', 'Volley', '28◆'], ['deadeye', 'Deadeye', '45◆']] },
  { name: '🔮 Apprentice', accent: '#c9b8ff', abilities: [
    ['fireBolt', 'Fire Bolt', 'basic'], ['manaShield', 'Mana Shield', '25◆'], ['iceNova', 'Ice Nova', '30◆'],
    ['fireball', 'Fireball', '40◆'], ['pyroclasm', 'Pyroclasm', '70◆']] },
];

// Monsters regenerated as animated characters so far, with their live specs.
const MONSTERS = [
  { key: 'goblin_scout', label: 'Goblin Scout', file: 'monsters/goblin_scout.png',
    originX: 0.4743, originY: 0.875, nativeH: 96, displayH: 128, counts: { idle: 5, attack: 5 } },
  { key: 'goblin_brute', label: 'Goblin Brute', file: 'monsters/goblin_brute.png',
    originX: 0.4963, originY: 0.875, nativeH: 97, displayH: 150, counts: { idle: 5, attack: 5 } },
  { key: 'goblin_shaman', label: 'Goblin Shaman', file: 'monsters/goblin_shaman.png',
    originX: 0.5257, originY: 0.875, nativeH: 104, displayH: 134, counts: { idle: 5, attack: 5 } },
  { key: 'goblin_chief', label: 'Goblin Chieftain — BOSS', file: 'monsters/goblin_chieftain.png',
    originX: 0.5, originY: 0.8676, nativeH: 102, displayH: 150, counts: { idle: 5, attack: 5, signature: 5 } },
  { key: 'hero_squire', label: 'Squire (hero, faces east)', file: 'heroes/squire.png',
    originX: 0.5404, originY: 0.875, nativeH: 103, displayH: 150, counts: { idle: 5, attack: 5 } },
];
const FRAME = 136;

const css = [];
const cards = [];
for (const m of MONSTERS) {
  const scale = m.displayH / m.nativeH;
  const fd = FRAME * scale;
  const total = Object.values(m.counts).reduce((a, b) => a + b, 0);
  css.push(`.s-${m.key}{background-image:url('${b64(m.file)}');background-size:${fd * total}px ${fd}px;width:${fd}px;height:${fd}px}`);
  let start = 0;
  const anims = [];
  for (const [anim, n] of Object.entries(m.counts)) {
    const from = -start * fd, to = -(start + n) * fd;
    const dur = (anim === 'idle' ? n / 6 : n / 14).toFixed(3);
    css.push(`@keyframes k-${m.key}-${anim}{from{background-position-x:${from}px}to{background-position-x:${to}px}}`);
    css.push(`.a-${m.key}-${anim}{animation:k-${m.key}-${anim} ${dur}s steps(${n}) infinite}`);
    anims.push(`<div class="cell"><div class="sprite s-${m.key} a-${m.key}-${anim}"></div><span>${anim}</span></div>`);
    start += n;
  }
  cards.push(`<section class="mon"><h3>${m.label} <em>${total} frames · ${Object.keys(m.counts).join(' · ')}</em></h3>
    <div class="cells">${anims.join('')}</div></section>`);
}

const slots = CLASSES.map((c) => `
  <section class="cls">
    <h3 style="color:${c.accent}">${c.name}</h3>
    <div class="slots">
      ${c.abilities.map(([id, name, cost]) => `
        <div class="slot">
          <img src="${b64(`icons/abilities/${id}.png`)}" alt="${name}">
          <div class="nm">${name}</div>
          <div class="cost ${cost === 'basic' ? 'auto' : ''}">${cost === 'basic' ? 'auto' : cost}</div>
        </div>`).join('')}
    </div>
  </section>`).join('');

writeFileSync(OUT, `<!doctype html><meta charset="utf-8"><title>Delve — Phase 3 art pass</title>
<style>
 body{margin:0;background:#0b0810;color:#e8e0f5;font:15px/1.5 system-ui,sans-serif;padding:26px}
 h1{font-size:21px;margin:0 0 6px} h2{font-size:16px;color:#b9add6;margin:30px 0 10px}
 h3{font-size:14px;margin:0 0 10px;color:#d0c8e8;font-weight:600}
 h3 em{color:#7d7296;font-style:normal;font-weight:400;font-size:12px}
 p.note{color:#9d8fc0;margin:0 0 16px;max-width:74ch}
 .slots{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px}
 .slot{width:104px;text-align:center;background:#160f22e6;border:3px solid #40355e;border-radius:14px;
       box-shadow:inset 0 0 0 1px #8a7ac080;padding:10px 6px}
 .slot img{width:52px;height:52px;image-rendering:pixelated;display:block;margin:0 auto 6px}
 .nm{font-size:11px;color:#d0c8e8;line-height:1.25;min-height:28px}
 .cost{font-size:11px;color:#4aa3ff;font-weight:700}.cost.auto{color:#9d8fc0}
 .mon{margin-bottom:22px}
 .cells{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-end}
 .cell{text-align:center;background:#150e20;border:1px solid #2e2440;border-radius:10px;padding:8px}
 .cell span{display:block;font-size:11px;color:#9d8fc0;margin-top:4px}
 .sprite{image-rendering:pixelated;background-repeat:no-repeat}
 ${css.join('\n ')}
</style>
<h1>Infinite Delve — Phase 3 art pass</h1>
<p class="note">Everything below is the real asset from <code>src/client/public/</code>. Monsters animate from their
actual strip PNGs at the game's frame rates (idle 6fps loop · attack/signature 14fps), scaled by the live
<code>CharSpec</code> values. Ability icons sit in the same grim-glow slot frame the HUD draws.</p>

<h2>Ability icons — 15 of 15 (D27), replacing the emoji placeholders</h2>
${slots}

<h2>Animated characters — Goblin Camp complete + the Squire</h2>
${cards.join('\n')}
`);
console.log(`wrote ${OUT}`);
