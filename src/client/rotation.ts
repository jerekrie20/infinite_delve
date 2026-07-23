// Rotation-order persistence (D30) — CLIENT-LOCAL for Phase 1 (localStorage,
// like runQueue): survives reloads on this device; promotes into
// StoredClass.rotation when the v3 StoredAccount migration lands (Phase 2+,
// DATA_SCHEMA "Client-local" table). Validation lives in the shared layer
// (normalizeRotationOrder) so a stale save can never hide a new ability.

import { normalizeRotationOrder } from '../shared/combat/rotation';

const ROTATION_KEY = 'delve:rotation:v1';

/** The subset of Storage this module uses (localStorage satisfies it). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Load the saved priority order, normalized against currently unlocked
 *  abilities (unknown/basic ids dropped, new unlocks appended in slot order). */
export function loadRotationOrder(storage: StorageLike, unlocked: string[]): string[] {
  let saved: string[] = [];
  try {
    const raw = JSON.parse(storage.getItem(ROTATION_KEY) ?? '[]');
    if (Array.isArray(raw)) saved = raw.filter((x): x is string => typeof x === 'string');
  } catch {
    // Corrupt entry — fall through to the slot-order default.
  }
  return normalizeRotationOrder(saved, unlocked);
}

export function saveRotationOrder(storage: StorageLike, order: string[]): void {
  try {
    storage.setItem(ROTATION_KEY, JSON.stringify(order));
  } catch {
    // Quota/read-only storage — the order still applies for this session.
  }
}

/** Drop the saved order (hero factory reset — back to slot-order default). */
export function clearRotationOrder(storage: StorageLike): void {
  try {
    storage.removeItem(ROTATION_KEY);
  } catch {
    // Read-only storage — nothing to clear.
  }
}
