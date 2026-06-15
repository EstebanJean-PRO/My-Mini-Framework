// Framework entry point
export * from './core/component';
export * from './core/element';
export * from './core/lazy';
export * from './core/memo';
export * from './core/types';
// BUG (Core P1 #6): `createElement` here shadows core/element.ts's `createElement`.
// SOLUTION: rename dom/render.ts's function to `createDOMElement` and update this line.
export { createElement, render, renderElement } from './dom/render';
export * from './dom/animation';
export * from './events/handler';
export * from './router/hash';
export * from './router/lazy';
export * from './state/store';
export * from './utils/equality';
export * from './utils/id';
export * from './utils/pathBuilder';

