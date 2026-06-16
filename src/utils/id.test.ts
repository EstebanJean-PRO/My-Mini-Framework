import { describe, it, expect } from 'vitest';
import { generateId } from './id';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateId()).toBe('string');
    expect(generateId().length).toBeGreaterThan(0);
  });

  // Core P2: current implementation uses Math.random() — no collision guarantee.
  // After fix: monotonic counter with 'mf-' prefix. Both tests below fail on the
  // random implementation and pass on the counter-based one.

  // Both tests below fail on the current random implementation and pass on the
  // counter-based fix ('mf-' prefix + monotonically increasing decimal suffix).

  it.fails('returns an ID matching the "mf-<n>" monotonic counter format', () => {
    expect(generateId()).toMatch(/^mf-\d+$/);
  });

  it.fails('the numeric suffix of two successive IDs differs by exactly 1', () => {
    // Produce two IDs. With the current random impl, stripping a non-existent 'mf-'
    // prefix leaves a base-36 string; parseInt(base36, 10) returns NaN for letter-
    // containing strings, and Object.is(NaN, NaN) is true — so this assertion would
    // accidentally pass. Guard: if either parse returns NaN, force a deterministic
    // failure so the test stays in it.fails correctly.
    const a = generateId();
    const b = generateId();
    const aNum = parseInt(a.replace(/^mf-/, ''), 10);
    const bNum = parseInt(b.replace(/^mf-/, ''), 10);
    if (Number.isNaN(aNum) || Number.isNaN(bNum)) {
      // IDs are not in the expected 'mf-<n>' format — counter not implemented yet
      expect(false).toBe(true);
      return;
    }
    expect(bNum).toBe(aNum + 1);
  });
});
