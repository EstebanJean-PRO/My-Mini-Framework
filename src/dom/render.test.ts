import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement as createVElement } from '../core/element';
import { createDOMElement, renderElement, diffAndPatch, render } from './render';
import { globalStore, setState } from '../state/store';

function container(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  // Reset globalStore to a clean slate between tests
  (globalStore as any).state = {};
  (globalStore as any).listeners = [];
  (globalStore as any).pathListeners = new Map();
  (globalStore as any).pendingUpdate = false;
  (globalStore as any).pendingChanges = new Set();
});

// ─── createElement (DOM materialisation) ──────────────────────────────────────

describe('createElement (DOM materialisation, dom/render)', () => {
  it('creates an element with the correct tag', () => {
    const el = createDOMElement(createVElement('section', {}));
    expect(el.tagName.toLowerCase()).toBe('section');
  });

  it('sets attributes from props', () => {
    const el = createDOMElement(createVElement('input', { id: 'my-id', type: 'checkbox' }));
    expect(el.id).toBe('my-id');
    expect((el as HTMLInputElement).type).toBe('checkbox');
  });

  it('appends text children', () => {
    const el = createDOMElement(createVElement('p', {}, 'hello world'));
    expect(el.textContent).toBe('hello world');
  });

  it('appends nested VirtualElement children', () => {
    const el = createDOMElement(
      createVElement('ul', {}, createVElement('li', {}, 'item'))
    );
    expect(el.children).toHaveLength(1);
    expect(el.children[0].tagName.toLowerCase()).toBe('li');
    expect(el.children[0].textContent).toBe('item');
  });
});

// ─── diffAndPatch ─────────────────────────────────────────────────────────────

describe('diffAndPatch — basic updates', () => {
  it('updates text content in-place', () => {
    const root = container();
    renderElement(createVElement('p', {}, 'before'), root);
    const p = root.firstElementChild as HTMLElement;
    diffAndPatch(p, createVElement('p', {}, 'before'), createVElement('p', {}, 'after'));
    expect(p.textContent).toBe('after');
  });

  it('updates an attribute in-place without replacing the node', () => {
    const root = container();
    renderElement(createVElement('div', { id: 'a' }), root);
    const div = root.firstElementChild as HTMLElement;
    diffAndPatch(div, createVElement('div', { id: 'a' }), createVElement('div', { id: 'b' }));
    expect(root.firstElementChild).toBe(div); // same node
    expect((root.firstElementChild as HTMLElement).id).toBe('b');
  });
});

describe('diffAndPatch — keyed children (Core P1 #2)', () => {
  // Core P1 #2: diffChildrenWithKeys stores domIndex at scan time. After the first
  // insertBefore reorders a node, subsequent iterations look up childNodes[domIndex]
  // on a shifted live NodeList and find the wrong DOM node — patching it with the
  // wrong content and leaving the intended node untouched as a ghost.
  // Repro: reordering forces an insertBefore early in the loop, invalidating a later key's domIndex.
  // Acceptance test: flip to plain `it` once the fix lands.
  it('produces correct content when keys are reordered and one key is removed', () => {
    const root = container();
    // Old: [a, b, c] — New: [c, b] (c moves to front, a is dropped)
    const vOld = createVElement('ul', {},
      createVElement('li', { key: 'a' }, 'A'),
      createVElement('li', { key: 'b' }, 'B'),
      createVElement('li', { key: 'c' }, 'C'),
    );
    const vNew = createVElement('ul', {},
      createVElement('li', { key: 'c' }, 'C'),
      createVElement('li', { key: 'b' }, 'B'),
    );
    renderElement(vOld, root);
    const ul = root.firstElementChild as HTMLElement;
    diffAndPatch(ul, vOld, vNew);
    // Expected: two children, in order C then B.
    // Buggy: processing 'c' moves it to front via insertBefore, shifting 'b' to domIndex 2.
    // When 'b' is looked up at domIndex 1 (stale), childNodes[1] is now 'a' — 'a' is
    // patched as 'b' and the real 'b' node is removed by the trailing while-loop instead.
    expect(ul.children).toHaveLength(2);
    expect(ul.children[0].textContent).toBe('C');
    expect(ul.children[1].textContent).toBe('B');
  });
});

describe('diffAndPatch — index-based children (Core P1 #7)', () => {
  // Core P1 #7: diffChildrenByIndex indexes into a live childNodes NodeList. When
  // removeChild is called at index i, all subsequent indices shift down by one. A second
  // removal in the same loop then reads childNodes[i+1] which now points one node too far,
  // leaving the final node in the DOM as a ghost.
  // Repro: old list has N items, new list drops the last two — the first removal shifts the
  // NodeList so the second removal targets an out-of-bounds index and silently no-ops.
  // Acceptance test: flip to plain `it` once the fix lands.
  it('removes all trailing nodes when multiple index-based removals occur', () => {
    const root = container();
    // Old: [A, B, C] — New: [A] (removes B and C)
    const vOld = createVElement('ul', {},
      createVElement('li', {}, 'A'),
      createVElement('li', {}, 'B'),
      createVElement('li', {}, 'C'),
    );
    const vNew = createVElement('ul', {},
      createVElement('li', {}, 'A'),
    );
    renderElement(vOld, root);
    const ul = root.firstElementChild as HTMLElement;
    diffAndPatch(ul, vOld, vNew);
    // Expected: one child 'A'.
    // Buggy: removing childNodes[1]='B' shifts the list; the next iteration reads
    // childNodes[2] which is now undefined, so 'C' is never removed.
    expect(ul.children).toHaveLength(1);
    expect(ul.children[0].textContent).toBe('A');
  });
});

// ─── render() subscriptions ───────────────────────────────────────────────────

describe('render() — blanket store subscription (Core P1 #1)', () => {
  // Core P1 #1: render() uses globalStore.subscribe() (fires on any key change).
  // Expected: only state keys the component actually reads should trigger re-renders.
  // Acceptance test: flip to plain `it` once the fix lands (granular subscribeTo).
  it('does not re-render when an unrelated state key changes', () => {
    const root = container();
    const fn = vi.fn(() => createVElement('div', {}, 'static'));
    render(fn, root);
    const callsBefore = fn.mock.calls.length;
    setState({ unrelated: true });
    expect(fn.mock.calls.length).toBe(callsBefore); // should not have re-rendered
  });
});

describe('render() — multi-root isolation (Core P1 #5)', () => {
  // Core P1 #5: render() holds a single module-level `unsubscribe` handle. Calling
  // render(fnB, rootB) cancels fnA's store subscription at line 447 (unsubscribe()),
  // permanently orphaning rootA — it never re-renders again even when state it depends
  // on changes.
  // Acceptance test: flip to plain `it` once the Renderer class refactor (Core P1 #4) lands.
  it('rootA continues to re-render after a second root is registered', () => {
    const rootA = container();
    const rootB = container();

    const fnA = () => createVElement('div', {}, String(globalStore.getValueByPath('count') ?? 0));
    render(fnA, rootA);
    expect(rootA.firstElementChild?.textContent).toBe('0');

    setState({ count: 1 });
    expect(rootA.firstElementChild?.textContent).toBe('1');

    // Registering a second root cancels fnA's subscription at render.ts:447
    render(() => createVElement('div', {}, 'B'), rootB);

    setState({ count: 2 });
    // rootA should still re-render; currently it is orphaned and stays at '1'
    expect(rootA.firstElementChild?.textContent).toBe('2');
  });
});
