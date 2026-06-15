import { VirtualElement, ElementProps, ElementChild, ElementFactory } from './types';

// Fonction générique pour créer un élément virtuel
export function createElement(
  tag: string,
  props: ElementProps = {},
  ...children: ElementChild[]
): VirtualElement {
  return { tag, props, children };
}

// Fonction helper générique
function createElementFactory(tag: string): ElementFactory {
  return (propsOrChildren?: ElementProps | ElementChild, ...children: ElementChild[]) => {
    if (propsOrChildren === null || propsOrChildren === undefined) {
      return createElement(tag, {}, ...children);
    }
    // BUG (Core P2): `'tag' in propsOrChildren` matches any plain object with a `tag`
    // property, not just VirtualElements — silently treats it as a child and drops all
    // props. SOLUTION: check the full VirtualElement shape:
    // `typeof v.tag === 'string' && Array.isArray(v.children)` — children array is unique
    // to VirtualElement; ElementProps never has one. Zero interface changes required.
    if (typeof propsOrChildren === 'string' || typeof propsOrChildren === 'number' || (propsOrChildren instanceof Object && 'tag' in propsOrChildren)) {
      return createElement(tag, {}, ...(Array.isArray(propsOrChildren) ? propsOrChildren : [propsOrChildren]), ...children);
    }

    return createElement(tag, propsOrChildren as ElementProps, ...children);
  };
}

// Export des fonctions helpers pour les tags HTML courants
export const div = createElementFactory('div');
export const h1 = createElementFactory('h1');
export const h2 = createElementFactory('h2');
export const h3 = createElementFactory('h3');
export const h4 = createElementFactory('h4');
export const h5 = createElementFactory('h5');
export const h6 = createElementFactory('h6');
export const p = createElementFactory('p');
export const button = createElementFactory('button');
export const input = createElementFactory('input');
export const ul = createElementFactory('ul');
export const li = createElementFactory('li');
export const span = createElementFactory('span');
export const label = createElementFactory('label');
export const form = createElementFactory('form');
export const header = createElementFactory('header');
export const footer = createElementFactory('footer');
export const section = createElementFactory('section');
export const nav = createElementFactory('nav');
export const a = createElementFactory('a');
export const img = createElementFactory('img');
export const strong = createElementFactory('strong');
export const table = createElementFactory('table');
export const thead = createElementFactory('thead');
export const tbody = createElementFactory('tbody');
export const tr = createElementFactory('tr');
export const th = createElementFactory('th');
export const td = createElementFactory('td');
export const select = createElementFactory('select');
export const option = createElementFactory('option');
export const textarea = createElementFactory('textarea');
export const br = createElementFactory('br');
export const hr = createElementFactory('hr');