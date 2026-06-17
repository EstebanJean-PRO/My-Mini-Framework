import { describe, it, expect, vi } from 'vitest';
import { Tween, TweenSequence, AnimationPlayer } from './animation';

describe('TweenSequence.addParallel (Game P1)', () => {
  // addParallel pushes into a separate parallelGroups array (never read) AND spreads all
  // tweens into the serial `tweens` array. update() advances one slot at a time, so
  // "parallel" tweens actually run one after another.
  // Acceptance test: flip to plain `it` once addParallel tweens advance together.
  it('runs parallel tweens concurrently, advancing the sequence only once all complete', () => {
    const targetA = { value: 0 };
    const targetB = { value: 0 };
    const tweenA = new Tween({ target: targetA, property: 'value', to: 10, duration: 100 });
    const tweenB = new Tween({ target: targetB, property: 'value', to: 20, duration: 100 });

    const seq = new TweenSequence().addParallel(tweenA, tweenB).start();

    // After fix: a single update() tick advances both tweens in the parallel group
    seq.update(50);

    // Currently: addParallel flattens into the serial array, so only tweenA (slot 0)
    // has been started/updated; tweenB never started, value stays 0.
    expect(targetB.value).toBeGreaterThan(0);
  });
});

describe('Tween ignores GameLoop.timeScale (Game P1)', () => {
  // update(deltaMs) discards deltaMs entirely — progress is computed from
  // performance.now() - startTime, so GameLoop.setTimeScale(0.5) has zero effect.
  // Acceptance test: flip to plain `it` once progress is driven by accumulated deltaMs.
  it('advances progress using the deltaMs argument, not wall-clock time', () => {
    const target = { value: 0 };
    const tween = new Tween({ target, property: 'value', to: 100, duration: 100 }).start();

    // Simulate a scaled-down GameLoop tick (e.g. timeScale 0.5 already applied upstream)
    tween.update(50);

    // After fix: 50ms of explicit deltaMs against a 100ms duration → progress 0.5 → value 50
    // Currently: progress is read from real elapsed wall-clock time (~0ms since start()),
    // so value stays ~0 regardless of the deltaMs argument.
    expect(target.value).toBeCloseTo(50, 0);
  });
});

describe('AnimationPlayer per-frame duration drift (Game P1)', () => {
  // getFrameDuration() is captured once before the while loop. After advanceFrame()
  // moves to a new frame, the loop keeps subtracting the OLD frame's duration instead of
  // the new current frame's duration — non-uniform frameDurations drift over time.
  // Acceptance test: flip to plain `it` once frame duration is re-evaluated per iteration.
  it('re-evaluates frame duration after each frame advance within a single update()', () => {
    const onFrameChange = vi.fn();
    const player = new AnimationPlayer({
      animations: {
        run: {
          name: 'run',
          frames: [0, 1, 2],
          frameDurations: [10, 1000, 1000],
          loop: true,
          onFrameChange,
        },
      },
      defaultAnimation: 'run',
    });

    // frame 0's duration (10ms) is captured once before the loop. 25ms of elapsed time:
    // after fix: consumes frame 0 (10ms) -> advance to frame 1; remaining 15ms < frame 1's
    // real duration (1000ms) -> stop. Exactly 1 advance.
    // Currently: the stale 10ms duration is reused for the frame-1 check too (15 >= 10),
    // causing a second incorrect advance straight through frame 1 into frame 2.
    player.update(25);

    expect(onFrameChange).toHaveBeenCalledTimes(1);
  });
});
