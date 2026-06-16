import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DOMAnimation, AnimationStrategy, AnimationOptimizer } from './animation';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

beforeEach(() => {
  document.body.innerHTML = '';
  AnimationOptimizer.resetCache();
  stubMatchMedia(false);
});

afterEach(() => {
  AnimationOptimizer.resetCache();
});

describe('DOMAnimation.playCSS() double onComplete (Core P2 #8)', () => {
  // animation.ts line 416: both the transitionend listener and the fallback setTimeout
  // call onComplete and resolve independently. When transitionend fires (common case),
  // onComplete is invoked twice — once synchronously from the listener and once when
  // the fallback timeout fires ~150ms later.
  // Acceptance test: flip to plain `it` once a shared `finish()` guard is added.
  it('onComplete fires exactly once when transitionend fires before the fallback timeout', async () => {
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
  it('onComplete fires when no external GameLoop is running', () => {
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

describe('AnimationOptimizer.prefersReducedMotion() stale cache (Core P2 #10)', () => {
  // prefersReducedMotion() caches matchMedia().matches on first call and never re-evaluates.
  // If the user toggles their OS reduced-motion setting mid-session, all subsequent
  // animations ignore the change — they use the stale cached value indefinitely.
  // SOLUTION: on first call, attach a MediaQueryList `change` listener that updates
  // cachedSupport.prefersReducedMotion when the preference changes.
  // Acceptance test: flip to plain `it` once the change listener is in place.
  it('reflects a mid-session change to the reduced-motion preference', () => {
    // First call: matches=false → caches false
    stubMatchMedia(false);
    expect(AnimationOptimizer.prefersReducedMotion()).toBe(false);

    // User enables reduced motion; update the stub
    stubMatchMedia(true);
    // After fix: the change listener fires, cache updates → returns true
    // Currently: cached false is returned regardless of the new mock
    expect(AnimationOptimizer.prefersReducedMotion()).toBe(true);
  });
});
