import { describe, it, expect, vi } from 'vitest';

describe('Side effect at module import (Core P2 #3)', () => {
  // router/lazy.ts line 20: globalStore.setState({ router: { loadingState: ... } })
  // runs at module evaluation time — before any initLazyRouter() call. Any file that
  // imports from this module silently mutates global state, even if it never uses the
  // lazy router. Acceptance test: flip to plain `it` once setState is moved into an
  // explicit initLazyRouter() function.
  it('importing router/lazy does not mutate globalStore', async () => {
    vi.resetModules();

    // Dynamic imports after resetModules() share the same fresh module registry,
    // so store and lazy.ts see the same globalStore instance.
    const { globalStore: freshStore } = await import('../state/store');
    const stateBefore = JSON.stringify((freshStore as any).state);

    await import('./lazy');

    // After fix (setState moved into initLazyRouter()):
    // state is unchanged from before the import
    expect(JSON.stringify((freshStore as any).state)).toBe(stateBefore);
  });
});
