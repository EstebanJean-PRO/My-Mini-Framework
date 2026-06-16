import { describe, it, expect } from 'vitest';
import { shallowEqual, deepEqual } from './equality';

describe('shallowEqual', () => {
  it('returns true for identical primitives', () => {
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual('a', 'a')).toBe(true);
    expect(shallowEqual(true, true)).toBe(true);
    expect(shallowEqual(null, null)).toBe(true);
  });

  it('returns false for different primitives', () => {
    expect(shallowEqual(1, 2)).toBe(false);
    expect(shallowEqual('a', 'b')).toBe(false);
  });

  it('returns true for objects with the same own-key values', () => {
    expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it('returns false for objects with different values on the same keys', () => {
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('returns false for objects with different key sets', () => {
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('does not recurse into nested objects (reference comparison)', () => {
    const nested = { x: 1 };
    expect(shallowEqual({ n: nested }, { n: nested })).toBe(true);
    expect(shallowEqual({ n: nested }, { n: { x: 1 } })).toBe(false);
  });

  it('returns true for two empty objects', () => {
    expect(shallowEqual({}, {})).toBe(true);
  });
});

describe('deepEqual', () => {
  it('returns true for identical primitives', () => {
    expect(deepEqual(42, 42)).toBe(true);
    expect(deepEqual('hello', 'hello')).toBe(true);
  });

  it('returns false for different primitives', () => {
    expect(deepEqual(1, 2)).toBe(false);
  });

  it('returns true for deeply equal nested objects', () => {
    expect(deepEqual({ a: { b: { c: 3 } } }, { a: { b: { c: 3 } } })).toBe(true);
  });

  it('returns false for deeply unequal nested objects', () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it('returns true for equal arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('returns false for arrays with different lengths', () => {
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('returns false for arrays with different values', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('returns true for two empty objects', () => {
    expect(deepEqual({}, {})).toBe(true);
  });

  it('returns false for objects with different key counts', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  // Core P2: deepEqual has no type guards for circular references or special types
  // (Date, Map, Set). These three it.fails tests capture the unguarded cases.
  // Acceptance test: flip each to plain `it` once the respective guard is added.

  it('does not throw (stack overflow) on circular references', () => {
    const a: any = { x: 1 };
    a.self = a;
    const b: any = { x: 1 };
    b.self = b;
    // Currently recurses infinitely and throws a RangeError (call stack exceeded)
    expect(() => deepEqual(a, b)).not.toThrow();
  });

  it('treats two Dates with different timestamps as not equal', () => {
    const d1 = new Date('2024-01-01');
    const d2 = new Date('2024-01-02');
    // Object.keys(Date) === [] — deepEqual sees zero enumerable keys on both sides
    // and returns true. After fix: compare via .getTime().
    expect(deepEqual(d1, d2)).toBe(false);
  });

  it('treats two Maps with different entries as not equal', () => {
    const m1 = new Map([['a', 1]]);
    const m2 = new Map([['a', 2]]);
    // Object.keys(Map) === [] — deepEqual returns true for any two Maps.
    // After fix: iterate entries or compare via JSON/spread.
    expect(deepEqual(m1, m2)).toBe(false);
  });
});
