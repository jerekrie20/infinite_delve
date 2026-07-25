// Build a self-contained HTML preview of the animated lane slice: embeds the
// real strip PNGs as data URIs and drives them with CSS steps() using the EXACT
// CharSpec numbers the game uses (origin, nativeH, displayH, GROUND_Y). If the
// feet sit on the floor line here, the Phaser origin math is right too.
//   node scratchpad/preview.mjs <out.html>
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'lane-preview.html';
const PUB = 'src/client/public';
const GROUND_Y = 640, DESIGN_W = 800, HERO_X = 240, MONSTER_X = 620;

const b64 = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;

/** One animated actor placed exactly as LaneScene places it. */
function actor(id, file, spec, x, anims) {
  const scale = spec.displayH / spec.nativeH;
  const fd = spec.sheet.frameSize * scale;            // displayed frame size
  const total = Object.values(spec.sheet.counts).reduce((a, b) => a + b, 0);
  const left = x - spec.originX * fd;
  const top = GROUND_Y - spec.originY * fd;
  let start = 0;
  const blocks = [];
  for (const [name, n] of Object.entries(spec.sheet.counts)) {
    const from = -start * fd, to = -(start + n) * fd;
    blocks.push({ name, n, from, to, dur: name === 'idle' ? n / 6 : n / 14 });
    start += n;
  }
  const css = blocks.map((b) => `
    @keyframes ${id}-${b.name} { from { background-position-x: ${b.from}px } to { background-position-x: ${b.to}px } }
    .${id}.${b.name} { animation: ${id}-${b.name} ${b.dur.toFixed(3)}s steps(${b.n}) infinite; }`).join('');
  const html = anims.map((a) => `<div class="sprite ${id} ${a}" style="left:${left}px;top:${top}px;width:${fd}px;height:${fd}px"></div>`).join('');
  return {
    css: `.${id} { background-image:url('${b64(`${PUB}/${file}`)}'); background-size:${fd * total}px ${fd}px; }${css}`,
    html,
    left, top, fd, scale,
  };
}

const squire = {
  originX: 0.5404, originY: 0.875, nativeH: 103, displayH: 150,
  sheet: { frameSize: 136, counts: { idle: 5, attack: 5 } },
};
const goblin = {
  originX: 0.5184, originY: 0.8824, nativeH: 100, displayH: 128,
  sheet: { frameSize: 136, counts: { idle: 5, attack: 5 } },
};

const heroIdle = actor('heroIdle', 'heroes/squire.png', squire, HERO_X, ['idle']);
const heroAtk = actor('heroAtk', 'heroes/squire.png', squire, HERO_X, ['attack']);
const gobIdle = actor('gobIdle', 'monsters/goblin_scout.png', goblin, MONSTER_X, ['idle']);
const gobAtk = actor('gobAtk', 'monsters/goblin_scout.png', goblin, MONSTER_X, ['attack']);
const backdrop = b64(`${PUB}/backdrops/goblin_camp.png`);

const strip = (file, label) =>
  `<figure><figcaption>${label}</figcaption><img src="${b64(`${PUB}/${file}`)}" alt="${label}"></figure>`;

writeFileSync(OUT, `<!doctype html><meta charset="utf-8"><title>Delve — animated lane slice</title>
<style>
  body { margin:0; background:#0b0810; color:#e8e0f5; font:15px/1.5 system-ui,sans-serif; padding:24px; }
  h1 { font-size:20px; margin:0 0 4px; } h2 { font-size:15px; color:#b9add6; margin:28px 0 8px; font-weight:600; }
  p.note { color:#9d8fc0; margin:0 0 18px; max-width:70ch; }
  .lane { position:relative; width:${DESIGN_W}px; height:${GROUND_Y + 40}px; overflow:hidden;
          border:1px solid #2e2440; border-radius:8px; background:#120c08;
          background-image:url('${backdrop}'); background-size:${DESIGN_W}px ${GROUND_Y}px; background-repeat:no-repeat; }
  .lane.wrap { transform-origin: top left; }
  .sprite { position:absolute; image-rendering:pixelated; background-repeat:no-repeat; }
  .ground { position:absolute; left:0; top:${GROUND_Y}px; width:100%; height:2px; background:#ff8a3d; opacity:.55; }
  .shadow { position:absolute; height:22px; border-radius:50%; background:rgba(0,0,0,.34); top:${GROUND_Y - 13}px; }
  figure { margin:0 0 14px; } figcaption { color:#9d8fc0; font-size:13px; margin-bottom:4px; }
  figure img { image-rendering:pixelated; max-width:100%; background:#1a1424; border:1px solid #2e2440; border-radius:6px; }
  .row { display:flex; gap:28px; flex-wrap:wrap; }
  code { color:#ffd77a; }
  ${heroIdle.css}${heroAtk.css}${gobIdle.css}${gobAtk.css}
</style>
<h1>Infinite Delve — Phase 3 art slice: animated characters in the lane</h1>
<p class="note">Real strip PNGs from <code>public/</code>, driven by CSS <code>steps()</code> at the same frame
rates Phaser uses (idle 6fps loop · attack 14fps). Placement uses the exact
<code>CharSpec</code> numbers — origin, nativeH, displayH, GROUND_Y=${GROUND_Y} — so the amber line is the
floor the engine stands them on. Hero faces east, monster faces west; no runtime flipping.</p>

<h2>Idle loops — both fighters, as the lane draws them</h2>
<div class="lane">
  <div class="shadow" style="left:${HERO_X - 52}px;width:104px"></div>
  <div class="shadow" style="left:${MONSTER_X - 30}px;width:60px"></div>
  ${heroIdle.html}${gobIdle.html}
  <div class="ground"></div>
</div>

<h2>Attack beats — what plays on each engine hit event</h2>
<div class="lane">
  <div class="shadow" style="left:${HERO_X - 52}px;width:104px"></div>
  <div class="shadow" style="left:${MONSTER_X - 30}px;width:60px"></div>
  ${heroAtk.html}${gobAtk.html}
  <div class="ground"></div>
</div>

<h2>Source strips (idle frames 0-4, attack frames 5-9)</h2>
<div class="row">
  ${strip('heroes/squire.png', 'hero_squire — 136px frames × 10')}
  ${strip('monsters/goblin_scout.png', 'goblin_scout — 136px frames × 10')}
</div>
`);
console.log(JSON.stringify({ out: OUT, heroTop: heroIdle.top, heroLeft: heroIdle.left, gobTop: gobIdle.top }));
