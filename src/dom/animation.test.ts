import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DOMAnimation, AnimationStrategy } from './animation';

// AnimationOptimizer is not exported — its prefersReducedMotion() stale-cache bug
// (Core P2 #10) cannot be directly tested without exposing the class or its static
// cachedSupport field. The behavioral consequence (play() taking the wrong path) is
// only observable after two separate play() calls with a matchMedia mock change in
// between, which requires internal access to reset the cache. This bug is documented
// in PLAN.md and its BUG comment in animation.ts; a targeted unit test can be added
// once AnimationOptimizer is exported or cachedSupport is exposed for testing.

beforeEach(() => {
  document.body.innerHTML = '';
  // jsdom does not implement window.matchMedia; stub it so AnimationOptimizer's
  // prefersReducedMotion() check does not throw during play().
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

describe('DOMAnimation.playCSS() double onComplete (Core P2 #8)', () => {
  // animation.ts line 416: both the transitionend listener and the fallback setTimeout
  // call onComplete and resolve independently. When transitionend fires (common case),
  // onComplete is invoked twice — once synchronously from the listener and once when
  // the fallback timeout fires ~150ms later.
  // Acceptance test: flip to plain `it` once a shared `finish()` guard is added.
  it.fails('onComplete fires exactly once when transitionend fires before the fallback timeout', async () => {
    vi.useFakeTimers();

    const el = document.createElement('div');
    document.body.appendChild(el);

    const onComplete = vi.fn();

    const playPromise = new DOMAnimation(el)
      .to({ opacity: 1 })
      .duration(100)
      .onComplete(onComplete)
      .useStrategy(AnimationStrategy.CSS)
      .play();

    // jsdom does not auto-fire transitionend — dispatch it manually
    el.dispatchEvent(new Event('transitionend'));
    await playPromise; // resolves immediately after transitionend

    // Advance past fallback: duration(100) + delay(0) + 50ms guard = 150ms
    vi.advanceTimersByTime(200);

    // After fix: called once; currently called twice (transitionend + fallback timeout)
    expect(onComplete).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

describe('DOMAnimation.playJS() hangs without GameLoop (Core P2 #9)', () => {
  // animation.ts line 500: playJS() adds tweens to TweenManager but TweenManager.update()
  // is only called by GameLoop. In DOM-only usage (no GameLoop instantiated), the
  // returned Promise never resolves and onComplete never fires.
  // Acceptance test: flip to plain `it` once TweenManager gains a self-driven rAF loop
  // that starts on the first tween and stops when the last one completes.
  it.fails('onComplete fires when no external GameLoop is running', () => {
    vi.useFakeTimers();

    const el = document.createElement('div');
    document.body.appendChild(el);

    const onComplete = vi.fn();

    new DOMAnimation(el)
      .to({ opacity: 0 })
      .duration(100)
      .onComplete(onComplete)
      .useStrategy(AnimationStrategy.JS)
      .play();

    // After fix: TweenManager registers a rAF; fake-timer tick drives update() →
    // tweens advance → onComplete fires within 100ms of simulated time.
    // Currently: no rAF is registered, update() is never called, onComplete never fires.
    vi.advanceTimersByTime(500);

    expect(onComplete).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
