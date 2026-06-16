import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerEventHandler,
  clearEventPools,
  getEventPoolStats,
  type SyntheticEvent,
} from './handler';

beforeEach(() => {
  document.body.innerHTML = '';
  clearEventPools();
});

describe('SyntheticEvent double-release (Core P2 #6)', () => {
  // handler.ts line 113: `release` is not cleared when an event is returned to the pool.
  // A second call to event.release() — e.g. by user code inside the handler AND the
  // system's auto-release setTimeout — pushes the same object into the pool twice.
  // Two subsequent dispatches then receive the same object simultaneously, corrupting
  // both handlers' event data.
  // Acceptance test: flip to plain `it` once release is set to `() => {}` on pool return.
  it.fails('calling release() twice does not push the same event into the pool twice', () => {
    vi.useFakeTimers();

    let captured: SyntheticEvent | null = null;

    const handlerId = registerEventHandler('click', (e) => {
      captured = e as SyntheticEvent;
      // Manual release inside the handler; the dispatch system also auto-releases
      // via setTimeout after dispatchEvent returns — that's the second call.
      captured.release?.();
    });

    const el = document.createElement('button');
    // The global dispatch function reads dataset.eventClickId to find the handler
    el.dataset.eventClickId = handlerId;
    document.body.appendChild(el);

    clearEventPools(); // reset stats to zero before the test dispatch

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.runAllTimers(); // flush the system's auto-release setTimeout

    const stats = getEventPoolStats();
    // After fix: release cleared on pool return → second call is a no-op → released = 1
    // Currently: release still points to releaseSyntheticEvent → released = 2, pool has
    // the same object twice
    expect(stats['click'].released).toBe(1);

    vi.useRealTimers();
  });
});
