---
tags: [security, performance]
status: living
---

# Security & Performance — threat model + budgets

Consolidates the scattered decisions (audit fixes, D19/D22 verification,
[[DATA_SCHEMA]] concurrency) into one reference. Posture: **server owns
value, client owns feel; determinism is the anti-cheat.**

## Trust boundaries

| Data | Trust level | Enforcement |
|------|------------|-------------|
| Reward VALUES (gold/xp) | never trusted | server computes from depth via EV formulas ([[FORMULAS]]) |
| depthReached | plausibility-clamped | vs hero level/gear + min-duration; hard clamp (`maxPlausibleDepth`, [[FORMULAS]] anti-cheat bullet — exists, Phase 0) |
| Gear haul | sanitized | `sanitizeGearItem` caps per-stat vs depth budget; set/rarity/unique recomputed server-side (exists) |
| Run legitimacy (boards/frontier) | verified by replay | seeded sim re-runs flagged/daily runs; mismatch = shadow-exclude ([[RELEASE_PLAN]] cheat policy) |
| Mastery/promotion claims | server-side only | trials resolve on the server sim; client never posts "I promoted" |
| Purchases (sinks) | server-side only | price tables live server-side; client sends intent |

## Attack surface checklist (standing)

- Rate limits: run/result ≤1 per 30s ⚙, equip/sell/craft ≤5/s, hero read
  cheap, hero/reset ≤1 per 10s ⚙; per-user, in Redis counters
  (`core/rateLimit.ts`, fixed-window — exists, Phase 0). A 429'd honest run
  is NOT lost: the client queues + retries it with the same `runId`
- Self-service factory reset (`/api/hero/reset`): destroys ONLY the caller's
  own `hero:{userId}` blob (no meta keys, no boards) — no trust issue, a
  player can only zero their own value; two-tap confirm client-side
- Run idempotency: `run/result` accepts a client `runId`; replays return the
  stored summary (`run:done:*` key, [[DATA_SCHEMA]]) without touching the
  limiter or re-awarding — this is what makes client retry safe
- One daily attempt: stamped at RUN START (D22), atomic SETNX
- Frontier soft caps (best-3 rule, [[FORMULAS]]) blunt botting value
- JSON body size caps; haul ≤40 items (exists); stash page bounds
- No secrets client-side; Devvit scopes identity — never trust a
  client-supplied userId
- Concurrency: WATCH/MULTI/EXEC compare-and-set on account writes
  ([[DATA_SCHEMA]] — exists, Phase 0)
- Never brick a save: unknown fields preserved, migrations tested, replay
  flags exclude from BOARDS only — gameplay untouched

## Performance budgets (mobile webview is the floor)

| Budget | Target ⚙ |
|--------|---------|
| Bundle (client JS) | ≤ 1.5MB gzip (Phaser dominates; no new heavy deps) |
| Texture memory | ≤ 24MB: gear atlas + active theme + UI only; themes lazy-swapped per band |
| Audio | ≤ 300KB ([[audio]]) |
| Combat tick | 100ms clock; per-frame work O(entities=4); float-text pooled, DoT ticks merged to 1s sums |
| Account blob | ≤ 24KB ([[DATA_SCHEMA]]); essences = 5 ints |
| Server sim | one expedition run ≤ 50ms CPU (it's arithmetic on ~100 floors); batch expeditions per open, not per cron-tick |
| Redis | meta keys carry TTLs (schema table); no unbounded zsets |

## Standing rules

- Every new endpoint ships WITH its rate limit + input caps (playbook step)
- Every new stored field goes through [[DATA_SCHEMA]] versioning
- Determinism is load-bearing: any `Math.random` in shared/combat code is a
  bug (lint rule candidate)
- Perf regressions gate at M-milestones: crash-free ≥99%, load-to-playable
  ≤ 5s on a mid Android ([[METRICS]])

## Related

- [[DATA_SCHEMA]] · [[FORMULAS]] · [[RELEASE_PLAN]] ops · TODO Phase 0
