import { describe, it, expect, vi, beforeEach } from 'vitest';
import { globalStore, setState, setBatchedState } from './store';

beforeEach(() => {
  (globalStore as any).state = {};
  (globalStore as any).listeners = [];
  (globalStore as any).pathListeners = new Map();
  (globalStore as any).pendingUpdate = false;
  (globalStore as any).pendingChanges = new Set();
  (globalStore as any).batchOldState = null;
  (globalStore as any).batchNewState = null;
  if ((globalStore as any).rafId) {
    cancelAnimationFrame((globalStore as any).rafId);
    (globalStore as any).rafId = null;
  }
});

describe('Store.setState — shallow oldState copy (Core P2 #11)', () => {
  // store.ts line 224: `const oldState = { ...this.state }` is a one-level spread.
  // A functional updater that mutates a nested object in-place returns the same
  // reference, making oldState === newState; notifyPathListeners then always sees
  // oldValue === newValue and silently skips all subscribers.
  // The fix adds a dev-mode identity check: if the updater returns the same reference
  // as the previous state, a console.warn is issued immediately.
  // Acceptance test: flip to plain `it` once the identity check + warn is in place.
  it.fails('warns when a functional updater returns the same state reference (in-place mutation)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setState({ user: { name: 'Alice' } });

    setState((prev: any) => {
      prev.user.name = 'Bob'; // in-place mutation — returns the same object
      return prev;
    });

    // After fix: console.warn fires to signal the immutability violation
    // Currently: setState accepts the same reference silently
    expect(warn).toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

describe('Store.setBatchedState — missing sub-path notifications (Core P2 #12)', () => {
  // store.ts line 156 (flushUpdates): detectChangedPaths adds a removed top-level key
  // (e.g. 'user') to pendingChanges but does not recurse into it, so sub-path
  // subscribers ('user.name') are never added to pendingChanges.
  // flushUpdates then calls pathListeners.get('user') — which has no listeners — and
  // skips 'user.name' entirely. Non-batched setState correctly handles this via
  // notifyPathListeners, which value-compares every registered path directly.
  // Acceptance test: flip to plain `it` once flushUpdates delegates to notifyPathListeners.
  it.fails('notifies sub-path subscribers when a parent key is removed via setBatchedState', () => {
    setState({ user: { name: 'Alice' } }); // set initial nested state

    const listener = vi.fn();
    globalStore.subscribeTo('user.name', listener);

    setBatchedState((prev: any) => {
      const { user: _removed, ...rest } = prev; // delete top-level 'user'
      return rest;
    });

    globalStore.flushSync(); // cancel RAF and flush synchronously

    // After fix: listener called with (undefined, 'Alice')
    // Currently: 'user.name' not in pendingChanges → listener never called
    expect(listener).toHaveBeenCalledWith(undefined, 'Alice');
  });
});
