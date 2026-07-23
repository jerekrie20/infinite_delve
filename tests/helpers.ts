// Tiny test harness for the tsx-run test files (no framework, per the bible §4).
// Each test file imports { check, summary } and calls `summary()` last; all.ts
// imports every test file in sequence. The one thing you must not break: a
// failing check MUST set a non-zero exit code, or CI-by-hand lies.

import assert from 'node:assert/strict';

let passedCount = 0;
let failedCount = 0;
let summaryPrinted = false;

// Safety net: a test file run standalone (`npx tsx tests/x.test.ts`) still gets
// a summary + failure exit code even though only all.ts calls summary() itself.
process.once('beforeExit', () => {
  if (!summaryPrinted) summary();
});

/** Run one named check (sync or async). Catches assertion errors, prints ✓/✗,
 *  and keeps counting so one failure doesn't hide the rest. */
export async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passedCount++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failedCount++;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ ${name}\n      ${message.split('\n').join('\n      ')}`);
  }
}

/** Print a section header so all.ts output reads as a report. */
export function describe(title: string): void {
  console.log(`\n${title}`);
}

/** Assert two numbers are within epsilon (for fractional EV math). */
export function assertNear(actual: number, expected: number, epsilon = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

/** Print totals and set the process exit code. Call once, last, per entrypoint. */
export function summary(): void {
  summaryPrinted = true;
  const total = passedCount + failedCount;
  console.log(`\n${passedCount}/${total} checks passed${failedCount ? ` — ${failedCount} FAILED` : ''}`);
  if (failedCount > 0) process.exitCode = 1;
}

export { assert };
