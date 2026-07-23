// In-memory Redis fake for tsx tests. One fake serves every server module that
// takes a Redis-like client structurally: frontier's RedisLike (zsets + hashes),
// the rate limiter (incrBy/expire), the run dedupe (get/set with NX), and the
// hero store's WATCH/MULTI/EXEC optimistic locking. The one thing you must not
// break: exec() must FAIL if a watched key was written after watch() — that
// conflict semantic is what the lost-update tests exercise.

interface ZMember {
  member: string;
  score: number;
}

interface QueuedSet {
  key: string;
  value: string;
}

export interface FakeTx {
  multi(): Promise<void>;
  set(key: string, value: string): Promise<void>;
  exec(): Promise<unknown[] | null>;
  discard(): Promise<void>;
  unwatch(): Promise<void>;
}

export class FakeRedis {
  private strings = new Map<string, string>();
  private hashes = new Map<string, Map<string, number>>();
  private zsets = new Map<string, Map<string, number>>();
  /** Bumped on every string write; watch() snapshots it, exec() compares. */
  private writeGeneration = new Map<string, number>();

  /** Every expire() call, recorded for assertions. */
  expireCalls: { key: string; seconds: number }[] = [];
  /** Test hook: runs at the START of every exec(), before the conflict check —
   *  inject a competing write here to force a CAS retry deterministically. */
  beforeExec: (() => Promise<void> | void) | null = null;

  private bump(key: string): void {
    this.writeGeneration.set(key, (this.writeGeneration.get(key) ?? 0) + 1);
  }

  // ---- Strings ----

  async get(key: string): Promise<string | undefined> {
    return this.strings.get(key);
  }

  // Matches the real Devvit client: Promise<string> even with nx (an NX miss is
  // NOT detectable from the return — server code must use incrBy for first-wins).
  async set(
    key: string,
    value: string,
    options?: { nx?: boolean; expiration?: Date }
  ): Promise<string> {
    if (options?.nx && this.strings.has(key)) return 'OK';
    this.strings.set(key, value);
    this.bump(key);
    return 'OK';
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.strings.delete(key);
      this.hashes.delete(key);
      this.zsets.delete(key);
      this.bump(key);
    }
  }

  async incrBy(key: string, value: number): Promise<number> {
    const next = (Number(this.strings.get(key)) || 0) + value;
    this.strings.set(key, String(next));
    this.bump(key);
    return next;
  }

  async expire(key: string, seconds: number): Promise<void> {
    this.expireCalls.push({ key, seconds });
  }

  // ---- Hashes ----

  async hIncrBy(key: string, field: string, value: number): Promise<number> {
    const hash = this.hashes.get(key) ?? new Map<string, number>();
    this.hashes.set(key, hash);
    const next = (hash.get(field) ?? 0) + value;
    hash.set(field, next);
    return next;
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    const hash = this.hashes.get(key);
    if (!hash) return {};
    return Object.fromEntries([...hash.entries()].map(([field, v]) => [field, String(v)]));
  }

  // ---- Sorted sets ----

  async zAdd(key: string, ...members: ZMember[]): Promise<number> {
    const zset = this.zsets.get(key) ?? new Map<string, number>();
    this.zsets.set(key, zset);
    let added = 0;
    for (const m of members) {
      if (!zset.has(m.member)) added++;
      zset.set(m.member, m.score);
    }
    return added;
  }

  async zScore(key: string, member: string): Promise<number | undefined> {
    return this.zsets.get(key)?.get(member);
  }

  private sortedAsc(key: string): ZMember[] {
    const zset = this.zsets.get(key);
    if (!zset) return [];
    return [...zset.entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : 1));
  }

  async zRange(
    key: string,
    start: number,
    stop: number,
    options?: { reverse?: boolean; by: 'score' | 'lex' | 'rank' }
  ): Promise<ZMember[]> {
    let entries = this.sortedAsc(key);
    if (options?.reverse) entries = entries.reverse();
    const end = stop < 0 ? entries.length + stop : stop;
    return entries.slice(start, end + 1);
  }

  async zCard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  async zRank(key: string, member: string): Promise<number | undefined> {
    const index = this.sortedAsc(key).findIndex((e) => e.member === member);
    return index < 0 ? undefined : index;
  }

  // ---- WATCH / MULTI / EXEC (optimistic locking) ----

  async watch(...keys: string[]): Promise<FakeTx> {
    const snapshot = new Map(keys.map((key) => [key, this.writeGeneration.get(key) ?? 0]));
    const queued: QueuedSet[] = [];
    let active = true;

    const conflicted = (): boolean =>
      [...snapshot.entries()].some(([key, gen]) => (this.writeGeneration.get(key) ?? 0) !== gen);

    return {
      multi: async () => {
        // Queue phase begins; queued commands apply atomically on exec.
      },
      set: async (key: string, value: string) => {
        queued.push({ key, value });
      },
      exec: async (): Promise<unknown[] | null> => {
        if (this.beforeExec) await this.beforeExec();
        if (!active) return null;
        active = false;
        if (conflicted()) return null; // a watched key changed → transaction aborts
        for (const q of queued) {
          this.strings.set(q.key, q.value);
          this.bump(q.key);
        }
        return queued.map(() => 'OK');
      },
      discard: async () => {
        active = false;
      },
      unwatch: async () => {
        active = false;
      },
    };
  }
}
