// Run every test file in sequence and print one summary. Entry point for
// `npm run test` / `npx tsx tests/all.ts`. Add new test files to the list —
// they self-register their checks on import.

import { summary } from './helpers';

await import('./gear-derive.test');
await import('./items.test');
await import('./frontier.test');
await import('./waves.test');
await import('./combat-clock.test');
await import('./statuses.test');
await import('./rotation.test');
await import('./combat-engine.test');
await import('./hero-schema.test');
await import('./hero-store.test');
await import('./rate-limit.test');
await import('./run-dedupe.test');
await import('./run-queue.test');

summary();
