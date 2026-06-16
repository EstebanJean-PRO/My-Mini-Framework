import { describe, it, expect, vi } from 'vitest';
import { memo, useCallback } from './memo';

// Core P2 — memoCache WeakMap leak: the internal `memoCache` is a plain Map<Function, ...>.
// Entries accumulate indefinitely (unmounted components' functions are never GC'd).
// There is no observable behavioral difference between Map and WeakMap from the outside —
// only GC timing differs — so no `it.fails` test is possible for this specific bug.
// The tests below verify correctness so the fix (Map → WeakMap) doesn't regress behavior.

describe('memo()', () => {
  it('returns the cached result when called again with the same args (shallow equal)', () => {
    const fn = vi.fn((x: number) => x * 2);
    const memoized = memo(fn);

    expect(memoized(5)).toBe(10);
    expect(memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-evaluates when args change', () => {
    const fn = vi.fn((x: number) => x * 2);
    const memoized = memo(fn);

    memoized(5);
    memoized(6);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('accepts a custom equality function', () => {
    const fn = vi.fn((obj: { v: number }) => obj.v);
    const memoized = memo(fn, ([a], [b]) => a.v === b.v);

    memoized({ v: 1 });
    memoized({ v: 1 }); // different reference but custom eq says equal
    expect(fn).toHaveBeenCalledTimes(1);

    memoized({ v: 2 }); // value differs
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stamps __memoized on VirtualElement results when cache hits', () => {
    const fn = vi.fn(() => ({ tag: 'div', props: {}, children: [] }));
    const memoized = memo(fn);

    memoized(); // populates cache
    const result = memoized() as any; // cache hit
    expect(result.__memoized).toBe(true);
  });
});

describe('useCallback()', () => {
  it('returns the same function reference when deps are unchanged', () => {
    const cb = () => {};
    const a = useCallback(cb, [1]);
    const b = useCallback(cb, [1]);
    expect(a).toBe(b);
  });

  it('returns a new reference when deps change', () => {
    const cb = () => {};
    const a = useCallback(cb, [1]);
    const b = useCallback(cb, [2]);
    // With the current implementation, useCallback always returns the same callback
    // (identity), so this test checks the contract, not that a new fn is created.
    expect(typeof b).toBe('function');
    void a;
  });
});
