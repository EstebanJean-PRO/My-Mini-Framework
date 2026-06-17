import { describe, it, expect } from 'vitest';
import { InputManager } from './input';

describe('InputManager unconditional preventDefault scope (Game P1)', () => {
  // All listeners attach to `document` globally regardless of any target, blocking text
  // selection, context menus, and native scrolling page-wide for as long as the manager
  // is active.
  // Acceptance test: flip to plain `it` once the constructor accepts an optional
  // `target: HTMLElement` and attaches listeners there instead of `document`.
  it('scopes input listeners to a provided target element instead of document', () => {
    const target = document.createElement('div');
    const outside = document.createElement('button');
    document.body.appendChild(target);
    document.body.appendChild(outside);

    const input = new (InputManager as any)(target);

    // Dispatched on a sibling of `target`, not a descendant — bubbles to document but
    // never through `target`.
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));

    // After fix: listener is on `target`, so this event never reaches it — state untouched.
    // Currently: listener is on `document` regardless of the target argument, so the
    // bubbled event is captured and mouse-button state changes.
    expect(input.isMouseButtonDown(0)).toBe(false);

    input.destroy();
    document.body.innerHTML = '';
  });
});
