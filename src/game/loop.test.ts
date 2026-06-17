import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLoop } from './loop';

describe('GameLoop.resume() accumulator reset (Game P1)', () => {
  let rafCallback: (() => void) | null = null;
  let currentTime = 0;

  beforeEach(() => {
    currentTime = 0;
    rafCallback = null;
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { rafCallback = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => { rafCallback = null; });
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function tick(deltaMs: number): void {
    currentTime += deltaMs;
    const cb = rafCallback;
    rafCallback = null;
    cb?.();
  }

  // lastFrameTime and deltaTime are reset on resume() but accumulator is not. The
  // pre-pause residual accumulator combines with the first resumed frame's deltaMs,
  // potentially triggering an extra unwanted fixedUpdate immediately.
  // Acceptance test: flip to plain `it` once resume() also zeroes the accumulator.
  it('does not trigger an extra fixedUpdate immediately after resuming', () => {
    const fixedUpdate = vi.fn();
    const loop = new GameLoop({ fixedUpdate }, { fixedTimestep: 100, autoUpdateInput: false, autoUpdateTweens: false });

    loop.start();
    tick(60); // accumulator = 60ms, below the 100ms fixedTimestep — no fixedUpdate yet

    loop.pause();
    fixedUpdate.mockClear();

    loop.resume();
    // After fix: accumulator reset to 0 on resume; +60ms new delta = 60ms, still < 100ms.
    // Currently: stale 60ms residual + 60ms new delta = 120ms >= 100ms — fires unexpectedly.
    tick(60);

    expect(fixedUpdate).not.toHaveBeenCalled();

    loop.stop();
  });
});
