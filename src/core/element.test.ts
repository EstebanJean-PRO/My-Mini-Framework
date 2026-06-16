import { describe, it, expect } from 'vitest';
import { createElement as createVElement, div, span, button } from './element';
// Import via public entry to surface the name-collision bug (Core P1 #6)
import { createElement as publicCreateElement } from '../../src/index';

describe('createElement (VDOM factory, core/element)', () => {
  it('returns a VirtualElement with the correct tag', () => {
    const vnode = createVElement('div', {}, 'hello');
    expect(vnode.tag).toBe('div');
  });

  it('attaches props to the VirtualElement', () => {
    const vnode = createVElement('input', { id: 'x', type: 'text' });
    expect(vnode.props.id).toBe('x');
    expect(vnode.props.type).toBe('text');
  });

  it('attaches children to the VirtualElement', () => {
    const child = createVElement('span', {}, 'inner');
    const vnode = createVElement('div', {}, child, 'text');
    expect(vnode.children).toHaveLength(2);
    expect(vnode.children[0]).toEqual(child);
    expect(vnode.children[1]).toBe('text');
  });

  it('returns empty children array when none provided', () => {
    const vnode = createVElement('br', {});
    expect(vnode.children).toEqual([]);
  });
});

describe('tag convenience factories', () => {
  it('div() produces a VirtualElement with tag "div"', () => {
    expect(div({}, 'content').tag).toBe('div');
  });

  it('span() produces a VirtualElement with tag "span"', () => {
    expect(span({}).tag).toBe('span');
  });

  it('button() accepts props', () => {
    const vnode = button({ disabled: true });
    expect(vnode.tag).toBe('button');
    expect(vnode.props.disabled).toBe(true);
  });

  // Core P2 #13: `createElementFactory` checks `'tag' in propsOrChildren` to detect
  // VirtualElement children, but this matches any plain object with a `tag` key.
  // { tag: 'x', id: 'y' } is treated as a child element, silently dropping the props.
  // Acceptance test: flip to plain `it` once the check distinguishes user props from
  // VirtualElements (e.g. by checking for a VirtualElement marker or constructor).
  it('treats a plain object with a "tag" key as props when it contains non-VNode keys', () => {
    const result = div({ tag: 'x', id: 'y' } as any);
    // After fix: id prop is preserved; currently it ends up in children instead
    expect(result.props.id).toBe('y');
  });
});

describe('createElement name collision (Core P1 #6)', () => {
  it('createElement from src/index.ts behaves as the VDOM factory', () => {
    const result = publicCreateElement('div' as any, { id: 'x' } as any, 'hello' as any);
    expect((result as any).tag).toBe('div');
  });
});
