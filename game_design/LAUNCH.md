---
tags: [launch, marketing, playtesting]
status: living
---

# Launch Playbook — testing with real users & marketing before going live

How Delve meets real players, aligned to the [[RELEASE_PLAN]] milestones and
[[METRICS]] gates. Governing idea: **on Reddit, the game IS the marketing**
— event posts, ledger shares, and the frontier are the acquisition engine
(D48); this doc is about getting the first honest players in front of it
and not burning goodwill on the way.

## Principles

- **Build in public, recruit in private, launch in community.** Dev-logs
  earn trust; playtests stay invite-scoped until the fun gate passes
- **Always disclose you're the dev.** Reddit forgives rough games and
  never forgives astroturfing. No alt accounts, no fake enthusiasm, ever
- **Mods first.** Any post in someone else's sub starts with a modmail
- **Don't market before M1.** Attention you attract before the loop is fun
  is attention you'll never get back

## The testing ladder (maps to milestones)

### Rung 0 — Solo (continuous, every phase)
Vite preview + combat sim + balance sandbox. You are player zero: the
[[METRICS]] self-test ("do I play runs I don't have to?") gates M1 before
anyone else is invited.

### Rung 1 — Trusted alpha (M1, ~5-10 people)
- `devvit playtest` on a **private test subreddit** (e.g. r/DelvePlaytest)
- Recruit: friends/family + 2-3 people from the Devvit community/Discord
  (they understand platform jank and won't confuse it with game jank)
- **Watch at least 3 people play live** (screen share) — the first five
  minutes can't be measured by telemetry alone: where do their eyes go,
  when do they first hesitate, do they understand Extract without being
  told?
- Measure: time-to-first-extract (<5 min target), extract-rate band
  (40-70%), "would you open this tomorrow?" asked verbatim

### Rung 2 — Closed beta (M2, ~30-100 people)
- Same private sub; invite-flow via modmail approval
- **Recruit where genre veterans already gather** (etiquette per sub!):
  - r/incremental_games — Feedback Friday / dev-post threads; this crowd
    gives brutal, expert feedback and is EXACTLY our Codex-loving audience
  - r/idlegames, r/WebGames — lighter-weight second pass
  - r/Devvit + Reddit dev Discord — platform-side testers
- **Structure it**: pinned "how to give feedback" post · weekly changelog
  post (builds the ledger-voice habit early) · a 5-question form after
  session one: (1) most fun moment? (2) most confusing moment? (3) when
  did you stop and why? (4) would you return tomorrow — why/why not?
  (5) what did you WANT to do that the game wouldn't let you?
- **Wipe policy stated up front**: saves may reset before launch;
  compensation = permanent **Founder deed/flair** in the Codex (cheap,
  D2-safe, and beta testers become launch evangelists)
- Gate check: D1 return ≥35% among testers, economy solvency holding,
  "mastery pull" question ([[METRICS]])

### Rung 3 — Open beta / soft launch (M3)
- The real home subreddit goes public (see Launch below) — zero promotion
  beyond one honest r/incremental_games "open beta" post
- Watch: crash-free ≥99%, load-to-playable ≤5s on mid Android, Daily
  participation, funnel drop-offs by event
- This rung exists to break things with strangers BEFORE the attention
  spike; fix, then promote

### Rung 4 — Launch + Season 1
Promotion push only now (below). Season 1's frontier is the launch event
itself: the first Terror sized so the founding population can fell it in
~3-4 days — an early communal win that makes the celebration post real.

## Marketing channels (in order of expected value)

1. **The game's own surfaces (D48)** — live feed preview, boss-felled
   posts, ledger shares, daily reports. Ship these BEFORE promoting;
   every visitor lands on a living community, not a static post
2. **Reddit's developer programs** — hackathons/showcases (Devpost events
   like "Fun & Games with Devvit" / "Hack Reddit") are real discovery +
   prize + Reddit-staff-attention paths; enter with the M2 build.
   r/Devvit showcase posts reach devs who amplify
3. **r/incremental_games launch post** — one, honest, dev-flaired:
   what it is, what's different (extraction stakes + sub-as-guild + no
   pay-for-power), a good GIF, the sub link. This community MADE several
   idle hits; monetization-first framing kills you here — lead with D2
4. **Dev-log content** — "I'm building a Diablo-flavored idle looter that
   lives inside Reddit" is itself a story: occasional posts to
   r/incremental_games (allowed cadence) and r/gamedev; each ends with
   the sub link, never a hard sell
5. **GIF-first assets** — grim-glow was chosen partly because it clips:
   a legendary orb lighting up a dark lane, a boss door opening, the
   Torchrest street darkening as the Terror climbs. 5-10s loops, no text
   walls. These are the shareable atoms for every channel
6. **Partner-sub installs (post-launch, careful)** — modmail mid-size
   gaming subs offering the game AS a community feature; the pitch writes
   itself: "your sub gets its own guild + war; you control every post
   (built-in mod opt-outs, D35); zero cost." One good partner sub is
   worth a hundred drive-by installs
7. **Season beats forever after** — each season opener/finale is a
   marketing moment for free ([[RELEASE_PLAN]] cadence)

## Guardrails

- Respect every sub's self-promo rules (the 9:1 spirit); when unsure,
  modmail first
- Never pay for ads before the fun gates pass — and probably not after;
  this game's economics are community-multiplication, not CPI
- Never promise dates publicly; promise the next season's contents only
  when authored ([[PLAYBOOK]] done-ness)
- Feedback is a gift, but [[DECISIONS]] is the filter: log every request,
  adopt through the vault (new D# or explicit rejection), never patch the
  design live in a comment thread

## Related

- [[RELEASE_PLAN]] — milestones this ladder climbs · [[METRICS]] — the
  gates · [[reddit-native]] — the surfaces · [[WORLD]] — the voice all
  public posts use
