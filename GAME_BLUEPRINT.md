> **SUPERSEDED (2026-07-22).** This document is the original "Faction War"
> concept, kept for historical reference only. The project pivoted to the
> Infinite Delve idle looter — the live design source of truth is
> `game_design/`; start at `game_design/DECISIONS.md` (D1–D49).

# Faction War — Blueprint (the WHY above the what)

*Status: v1 brainstorm, 2026-07-08. This document sits ABOVE `GAME_DESIGN.md`:
that doc is the mechanics spec (how the war works); this one is the motivation
spec (why anyone plays, today and over years). Every future feature must trace
to a row in this document or it doesn't get built. The mechanics-planning
session should start here.*

---

## 1. The one-sentence why

**Faction War makes belonging to your subreddit mean something — it gives your
community a shared enemy, a shared map, and a shared story that changes three
times a day.**

Nobody plays for the grid. They play because it's *their* sub on the map. The
grid is just where the belonging becomes visible.

## 2. The fantasy (what is the player BEING?)

r/place worked because its fantasy fit in one breath: *"I placed a pixel
millions can see — I was part of something."* Our equivalent, per persona:

- *"I'm a soldier for r/mysubreddit. Last night I held the bridge."*
- *"I'm the general. My plan took the mainland."*
- *"My community went to war with our rivals — and we won."*

The fantasy is **service to a tribe with witnesses**. Not conquest (too
lonely), not puzzle mastery (too cold). Service + witnesses. Every screen
should reinforce: you acted *for* someone, and someone *saw it*.

## 3. The motivation stack

Five layers. Each has a job (acquisition → retention → meta), a loop it powers,
and a metric that proves it's working. This is the spine of the whole product.

| # | Motivation | The feeling | Job | Powered by (exists ✅ / gap ❌) |
|---|-----------|-------------|-----|-------------------------------|
| 1 | **Identity** | "My sub is at war — and we're LOSING?" | Acquisition: why you tap in the first time | ✅ faction=subreddit, splash post · ❌ rivalry matchmaking, feed-visible war status |
| 2 | **Agency** | "My 12 AP visibly mattered" | Day 1–7 retention | ✅ per-tile caps, coordination>headcount, battle log · ❌ personal service record, "your garrison held" callouts, war-report name-drops |
| 3 | **Drama** | "Something happened overnight — to ME" | The 3×-daily pull (this is the DQE money mechanic) | ✅ hidden commitments + tick resolution (a drama slot machine) · ❌ war report as narrative, personal stakes surfaced on open ("while you were gone…") |
| 4 | **Status** | "I'm becoming someone here" | Week 2+ / season retention | ✅ roles, planned medals/flair · ❌ persistent service record, hall of fame, emergent officer status, faction war history |
| 5 | **Belonging** | "WE did that together" | Recruitment: why players conscript others | ✅ comments-as-war-room, faction AP pool · ❌ shared victory ceremonies, "we need 3 more defenders" recruit hooks, supply-drop generosity credit |

**Business alignment (why this stack IS the money model):** Developer Funds
pays on Daily Qualified Engagers and installs. Drama (#3) + Agency (#2)
manufacture the daily check-in = DQE. Identity (#1) + Belonging (#5) make
players drag their subreddit and rival subreddits in = installs. Status (#4)
stretches lifetime so acquisition compounds. There is no tension between "fun"
and "revenue" in this design — the same five rows drive both.

## 4. Personas (who is actually in the room)

A subreddit is not a player; it's an audience pyramid. Design for all five or
the pyramid collapses to zero.

1. **The General** (1–2 per faction). Wants command and credit. Lives in the
   comments making plans. Needs: intel tools (scout role ✅), a planning
   surface, and public credit when the plan works. If the General churns, the
   faction dies — they are the single highest-value retention target.
2. **The Soldier** (10–50). Wants to contribute meaningfully in three minutes.
   Needs: to know *where they're needed* the moment they open the post
   (orders/pings from the General, threatened-tile prompts), and proof their
   contribution landed (#2 Agency).
3. **The Conscript** (100s — lurkers who might tap once). Will not read a
   tutorial, will not strategize. Needs: ONE obvious button — "defend the
   homeland" / "join the push" — that spends AP usefully with zero decisions.
   If the casual path requires choosing a tile from a 53×53 map, we lose them.
4. **The Spectator** (1,000s — never plays). Watches, comments, votes. Needs:
   the post itself to be watchable content — a live map billboard, war reports
   worth reading, drama worth commenting on. Spectators rank the post in the
   feed (growth), and every spectator is a future conscript.
5. **The Rival** (external). Sees their sub is being mocked/beaten on someone
   else's map → installs the app in their sub. This is the viral loop; rivalry
   is the payload (#1 Identity).

## 5. The loops (what happens at each timescale)

- **Session loop (3 min):** open → *"while you were gone"* recap (what resolved,
  what happened to YOUR tiles, are we winning) → spend AP where needed → one
  cliffhanger planted (your hidden commitment) → close. The open must deliver
  story before asking for input.
- **Daily loop:** morning war report (narrative, names named) → AP refreshed →
  the day's plan argued in comments → evening check before the overnight tick.
- **Season loop (2 weeks):** week 1 land-grab → mid-season standings pressure →
  week 2 escalation (NPC + scoring make the end hot) → finale, ceremony,
  archived map, trophies → fresh map, new war. Reset is the *feature*: every
  two weeks is a new jumping-on point for latecomers.
- **Lifetime loop (seasons → years):** division ladder climbs, subreddit war
  history ("we've beaten r/x three seasons running"), player service records
  (campaign medals accumulate), hall of fame. **What persists is the story.**
  Maps reset; reputations don't.

## 6. The drama engine (moments we deliberately manufacture)

Games spread on anecdotes. Each of these must be *namable* by a player
retelling it — that's the test:

- **The Overnight Cliffhanger** — hidden commitments + tick = every check-in
  opens a result you were anxious about. (Mechanic exists; the *reveal* needs
  staging — don't just update numbers, tell me what happened.)
- **The Last Stand** — capital threatened → faction-wide rally prompt → held or
  fell, either way it's a story and a war-report headline.
- **The Bite-Back** — overextension decay means empires sag; surface it as
  news ("The r/x empire is crumbling at the edges") so underdogs smell blood.
- **The Feint** — scouts, bluff commitments, misdirection argued in comments.
- **The Generous Stranger** — supply drop credited publicly (monetization AS
  drama, not beside it).
- **The Finale** — world championship, immortalized map, flair for everyone
  who served.

## 7. The loser experience (the silent killer)

Half of all factions are below average every season, and territory games die
when losing = weeks of misery. Losing must be *dramatic*, never *hopeless*:

- No elimination + respawn (✅ designed) and capital relocation (✅) keep you on
  the map.
- Underdog teeth: overextension (✅) mathematically favors bites against
  sprawling leaders; front-width caps (✅) stop steamrolls. Surface both as
  visible hope, not hidden math.
- **Personal progression must be faction-independent** (❌ gap): medals for
  defense streaks, scouting accuracy, most-valuable-soldier — earnable in a
  losing war. A soldier on a losing side who had a great war should *feel* it.
- Spite goals (❌ gap): "we can't win the season, but we can take THEIR
  capital / deny r/x the championship." Late-season narrative for the bottom
  half.
- Relegation must sting the *subreddit's pride*, not the player's daily fun.

## 8. Growth loop (how play creates players)

Play → drama → content (war reports, event posts, archived maps, comment
arguments) → feed visibility inside the sub (spectators → conscripts) →
cross-sub taunting + rivalry ("r/coffee just took r/tea's capital") → rival sub
installs → more theaters → better matchmaking → better drama. Every arrow above
is a design surface, and rivalry matchmaking (natural enemies fight: city vs
city, console vs console, dogs vs cats) is the strongest unbuilt multiplier in
the whole plan — it turns marketing into a game mechanic.

## 9. The feature kill-test

Before building ANY mechanic, it must answer all four (add to PR/plan
description):

1. **Which motivation row** (#1–5) does it serve?
2. **Which persona** feels it — and can the Conscript ignore it safely?
3. **Which loop** does it live in (session / daily / season / lifetime)?
4. **What anecdote** does it generate? ("Players will tell each other that…")

If a feature has no row, no persona, no loop, and no story — it's complexity,
not content. (This test retroactively justifies freeform rounds, hidden
commitments, and the AP pool; it would have killed several deferred ideas.)

## 10. Honest gaps — ordered backlog for the mechanics pass

What the current design/build does NOT yet answer, most critical first. This
list (not the mechanics themselves) is the input to the future mechanics
planning session:

1. **First 30 seconds** — a new player must feel identity + take one useful
   action immediately (Conscript path, splash → one-tap "enlist & defend").
   Tutorial pass is planned; this is sharper than a tutorial — it's the
   default action.
2. **"While you were gone"** — session-open recap delivering personal drama
   before asking for input (#3). Currently the board just… updates.
3. **Personal service record** — persistent per-player stats/medals across
   seasons, faction-independent (#2, #4, §7).
4. **War report as narrative** — Phase 2 lists it; upgrade its role: it's not
   a changelog, it's the daily episode + name-drop engine + spectator content.
5. **The Conscript button** — one-tap useful AP spend with zero map literacy.
6. **Rivalry matchmaking** — natural-enemy seeding in theater assembly
   (Phase 2 matchmaking exists as skill-based only) (§8).
7. **Loser-experience surface** — underdog news, spite goals, personal medals
   in losing wars (§7).
8. **General's toolkit** — a planning surface beyond raw comments (pinned
   plan? rally point marker on the map?) — the General retains everyone else.
9. **Ceremony** — season finale/trophy moments designed as *events*, not
   database updates.
10. **Notification reality check** — Devvit has no arbitrary push; the
    "pull" must live in feed surfaces (event posts, war-report comments,
    post-preview drama) — design within that constraint, verify current
    platform capabilities before building #2/#4.

## 11. What this means for the roadmap

ROADMAP.md (map/tools base) is unchanged — a strong base serves every row
above. When the mechanics pass begins, it starts from §10 in order, runs each
candidate through §9, and updates GAME_DESIGN.md with the mechanics that
survive. Monetization (Phase 3) already fits the stack (§6 Generous Stranger;
cosmetics = #4 Status) — no pay-for-power, generosity-as-status stays the rule.
