import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lazyRouterExtension } from '../core/lazy';
import { navigateTo, registerRoute } from './hash';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('MutationObserver', vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn(() => []),
  })));
});

describe('Router Facade (Core P3)', () => {
  // hash.ts and router/lazy.ts maintain separate route stores (routes[] vs lazyRoutes Map)
  // and separate navigation functions (navigateTo / navigateToLazy). LazyRouterExtension
  // in core/lazy.ts adds a third isolated registry. The Facade unifies these into a single
  // src/router/index.ts with one registry, one navigateTo, and one destroy().
  // Acceptance tests: flip to plain `it` once src/router/index.ts is created.

  it('src/router/index.ts exports a unified Router API', async () => {
    // After fix: router/index.ts is created with a unified API
    // Currently: the module does not exist; import throws
    let facade: any;
    try {
      facade = await import('./index');
    } catch {
      // Convert the import error into an assertion failure so it.fails catches it cleanly
      expect(false, 'router/index.ts not yet created — Facade refactor pending').toBe(true);
      return;
    }
    expect(typeof facade.navigateTo).toBe('function');
    expect(typeof facade.registerRoute).toBe('function');
    expect(typeof facade.registerLazyRoute).toBe('function');
  });

  it('a route registered via LazyRouterExtension is reachable from the unified registry', async () => {
    // LazyRouterExtension (core/lazy.ts:472) stores routes in its own private lazyRoutes[]
    // separate from hash.ts routes[]. After the Facade, one registry serves all three APIs.
    let facade: any;
    try {
      facade = await import('./index');
    } catch {
      expect(false, 'router/index.ts not yet created — Facade refactor pending').toBe(true);
      return;
    }

    const loader = vi.fn(async () => vi.fn(() => ({ tag: 'div', props: {}, children: ['ok'] } as any)));
    lazyRouterExtension.registerLazyRoute('/facade-unified', loader);

    // After fix: facade.hasRoute ('/facade-unified') returns true (unified registry)
    // Currently: only lazyRouterExtension's private lazyRoutes[] knows about this route
    expect(facade.hasRoute?.('/facade-unified')).toBe(true);
  });
});
