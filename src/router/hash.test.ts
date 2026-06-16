import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerRoute, initRouter } from './hash';
import { globalStore, setState } from '../state/store';
import { createElement } from '../core/element';

function outlet(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'router-outlet';
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  (globalStore as any).state = {};
  (globalStore as any).listeners = [];
  (globalStore as any).pathListeners = new Map();
  (globalStore as any).pendingUpdate = false;
  (globalStore as any).pendingChanges = new Set();
  // initRouter() creates a MutationObserver whose callback accesses document.getElementById.
  // Without stubbing, the observer fires during jsdom teardown when document is no longer
  // available, producing an unhandled ReferenceError. Our tests exercise the store
  // subscription path (not the MutationObserver path), so stubbing is safe here.
  vi.stubGlobal('MutationObserver', vi.fn(function() {
    return { observe: vi.fn(), disconnect: vi.fn(), takeRecords: vi.fn(() => []) };
  }));
});

describe('Router blanket store subscription (Core P2 #2)', () => {
  // hash.ts line 63: globalStore.subscribe(() => setTimeout(handleRouteChange, 0))
  // fires on every state mutation — including unrelated game-loop writes at 60fps —
  // scheduling a full renderElement() (no diffing) each time.
  // Acceptance test: flip to plain `it` once the fix (subscribeTo per-route path) lands.
  it('does not re-render the route component when an unrelated state key changes', () => {
    vi.useFakeTimers();
    outlet();

    const comp = vi.fn(() => createElement('div', {}, 'route'));
    registerRoute('', comp);
    initRouter(); // one legitimate render + attaches blanket subscribe

    const callsBefore = comp.mock.calls.length;

    setState({ unrelated: true }); // should not trigger a re-render
    vi.runAllTimers(); // flush the subscribe's setTimeout

    // After fix: callsBefore unchanged; currently +1 (blanket subscribe fired)
    expect(comp.mock.calls.length).toBe(callsBefore);

    vi.useRealTimers();
  });
});

describe('Router no destroy path (Core P2 #7)', () => {
  // initRouter() attaches a hashchange listener, a MutationObserver, and a store
  // subscription with no teardown. Calling initRouter() twice stacks all three in
  // parallel — each subsequent setState triggers two (or more) route re-renders.
  // Acceptance test: flip to plain `it` once destroyRouter() is exported and called
  // at the top of initRouter().
  it('calling initRouter() twice does not multiply renders per state change', () => {
    vi.useFakeTimers();
    outlet();

    const comp = vi.fn(() => createElement('div', {}, 'dup'));
    registerRoute('', comp);

    initRouter(); // adds 1 subscriber
    initRouter(); // stacks a 2nd subscriber (bug)

    const callsBefore = comp.mock.calls.length;

    setState({ x: 1 }); // router no longer subscribes to state — no render expected
    vi.runAllTimers();

    // After fix: blanket subscribe removed; setState has no effect on route renders
    expect(comp.mock.calls.length).toBe(callsBefore);

    vi.useRealTimers();
  });
});
