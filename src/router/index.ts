export { navigateTo, registerRoute, initRouter, destroyRouter } from './hash';
export { registerLazyRoute, navigateToLazy, initLazyRouter } from './lazy';
export { lazyRouterExtension } from '../core/lazy';

import { lazyRouterExtension } from '../core/lazy';

export function hasRoute(path: string): boolean {
    return lazyRouterExtension.hasRoute(path);
}
