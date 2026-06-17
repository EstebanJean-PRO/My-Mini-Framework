import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LazyComponent, LoadingState, configureLazy } from './lazy';

beforeEach(() => {
  // No retries by default — tests that need retries pass explicit params to loadWithRetry
  configureLazy({ retryAttempts: 0, retryDelay: 0, timeout: 30000 });
});

afterEach(() => {
  configureLazy({});
  vi.restoreAllMocks();
});

describe('loadWithRetry (Core P3 — Template Method)', () => {
  // lazy.ts contains two verbatim copies of the retry loop: LazyComponent.load() (line 103)
  // and dynamicImport() (line 395). Both have a local `attempts` counter, a recursive inner
  // function, and a retry-or-reject branch. Only post-success bookkeeping differs.
  // SOLUTION: extract `loadWithRetry<T>(loader, maxRetries, retryDelay): Promise<T>` as a
  // shared exported function; each caller chains .then() for its own post-load work.
  // Acceptance tests: flip to plain `it` once loadWithRetry is exported from core/lazy.

  it('loadWithRetry is exported and retries the loader before resolving', async () => {
    const mod = await import('./lazy') as any;
    if (typeof mod.loadWithRetry !== 'function') {
      throw new Error('loadWithRetry not yet exported from core/lazy');
    }

    let calls = 0;
    const loader = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'ok';
    });

    // maxRetries=2 → 3 total attempts (1 initial + 2 retries)
    const result = await mod.loadWithRetry(loader, 2, 0);
    expect(result).toBe('ok');
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('loadWithRetry rejects after exhausting all retry attempts', async () => {
    const mod = await import('./lazy') as any;
    if (typeof mod.loadWithRetry !== 'function') {
      throw new Error('loadWithRetry not yet exported from core/lazy');
    }

    const alwaysFails = vi.fn(async () => { throw new Error('permanent failure'); });

    // maxRetries=2 → 3 total attempts before rejection
    await expect(mod.loadWithRetry(alwaysFails, 2, 0)).rejects.toThrow('permanent failure');
    expect(alwaysFails).toHaveBeenCalledTimes(3);
  });
});

describe('LoadingState transition guard (Core P3 — State pattern)', () => {
  // lazy.ts contains 13+ direct `this.state = X` assignments with no transition validation.
  // Any state can silently transition to any other state.
  // SOLUTION: replace direct assignments with a guarded `transition(to: LoadingState)` method
  // backed by a VALID_TRANSITIONS table; invalid transitions throw in development.
  //   VALID_TRANSITIONS:
  //     IDLE    → LOADING
  //     LOADING → LOADED | ERROR | TIMEOUT
  //     LOADED  → []   (terminal; reset() returns to IDLE)
  //     ERROR   → IDLE (via reset() only)
  //     TIMEOUT → IDLE (via reset() only)
  // Acceptance test: flip to plain `it` once the transition guard is in place.

  it('LazyComponent rejects a second load() call from ERROR state without reset', async () => {
    const alwaysFails = vi.fn().mockRejectedValue(new Error('always fails'));
    const comp = new LazyComponent(alwaysFails);

    // First load: IDLE → LOADING → ERROR
    await comp.load().catch(() => {});
    expect(comp.getState()).toBe(LoadingState.ERROR);

    // After fix: ERROR → LOADING is an invalid transition; load() rejects with a transition
    // error. Currently: load() silently retries (state back to LOADING, then ERROR again),
    // rejecting with the loader error — not a transition error.
    await expect(comp.load()).rejects.toThrow(/transition|invalid/i);
  });
});
