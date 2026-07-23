// ROTATION — D30 ability selection. Slot 1 is the basic attack (no mana, fires
// on the attack timer); slots 2-5 fire by player-ordered priority:
// each attack beat, the highest-priority ability that's off cooldown AND
// affordable casts; otherwise the basic attack fires. A manual tap queues its
// ability to the next beat and always wins over the rotation (D33: casts
// resolve on the attack beat — one deterministic code path for live play,
// rotation, and the server sim). Pure selection logic; the engine owns state.

import { ACTIVES } from '../content/actives';

export interface RotationState {
  /** Ability ids for slots 2-5 in priority order (player-reordered). */
  order: string[];
  /** Manually tapped ability queued for the next beat (wins over the order). */
  queued: string | null;
}

/** What the hero does on this attack beat. */
export type BeatAction =
  | { kind: 'basic' }
  | { kind: 'ability'; abilityId: string };

const castable = (
  abilityId: string,
  mana: number,
  cooldowns: Record<string, number>,
): boolean => {
  const def = ACTIVES[abilityId];
  if (!def || def.basic) return false;
  if ((cooldowns[abilityId] ?? 0) > 0) return false;
  return mana >= def.manaCost;
};

/** Pick this beat's action. Consumes the manual queue if its ability is
 *  castable (an unaffordable tap is dropped, not held — the player sees the
 *  greyed button; holding it would fire surprisingly later). */
export function chooseBeatAction(
  rotation: RotationState,
  mana: number,
  cooldowns: Record<string, number>,
): BeatAction {
  const queued = rotation.queued;
  rotation.queued = null;
  if (queued && castable(queued, mana, cooldowns)) {
    return { kind: 'ability', abilityId: queued };
  }
  for (const abilityId of rotation.order) {
    if (castable(abilityId, mana, cooldowns)) return { kind: 'ability', abilityId };
  }
  return { kind: 'basic' };
}

/** Sanitize a stored/edited priority order against what's actually unlocked:
 *  drops unknown or basic (slot-1) ids, dedupes, appends missing unlocked
 *  abilities in slot order — so a stale save never hides a new ability. */
export function normalizeRotationOrder(order: string[], unlocked: string[]): string[] {
  const rotatable = unlocked.filter((id) => ACTIVES[id] && !ACTIVES[id]!.basic);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of order) {
    if (rotatable.includes(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of rotatable) if (!seen.has(id)) out.push(id);
  return out;
}
