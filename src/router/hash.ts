import { VirtualElement } from '../core/types';
import { renderElement } from '../dom/render';

interface Route {
    path: string;
    component: () => VirtualElement;
}

const routes: Route[] = [];
let currentPath = '';
let observer: MutationObserver | null = null;

export function destroyRouter(): void {
    window.removeEventListener('hashchange', handleRouteChange);
    observer?.disconnect();
    observer = null;
}

export function registerRoute(path: string, component: () => VirtualElement): void {
    const existingRouteIndex = routes.findIndex(r => r.path === path);
    
    if (existingRouteIndex !== -1) {
        routes[existingRouteIndex].component = component;
    } else {
        routes.push({ path, component });
    }
}

// REFACTOR (Core P3 — Facade pattern): hash.ts and router/lazy.ts maintain separate route
// stores (routes[] vs lazyRoutes Map) and separate preload caches, with lazy routes
// secretly back-channeling into this file via baseRegisterRoute(). navigation logic is
// duplicated across navigateTo / navigateToLazy. A third cache exists in core/lazy.ts
// LazyRouterExtension, invisible to the one here.
// SOLUTION: introduce src/router/index.ts as a Router Facade — one registry, one navigate(),
// one destroy(). hash.ts and lazy.ts become private implementation modules. Old exports
// become shims. Resolves Core P3 #5 (duplicate preload caches) for free.
//
export function initRouter(): void {
    destroyRouter();
    window.addEventListener('hashchange', handleRouteChange);
    
    // Observer pour détecter quand router-outlet est recréé
    observer = new MutationObserver(() => {
        const outlet = document.getElementById('router-outlet');
        if (outlet && !outlet.hasChildNodes()) {
            // Le router-outlet vient d'être recréé et est vide
            handleRouteChange();
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    
    handleRouteChange();
}

export function navigateTo(path: string): void {
    window.location.hash = path;
}

function handleRouteChange(): void {
    currentPath = getCurrentPath();
    
    const container = document.getElementById('router-outlet');
    if (!container) {
        return;
    }
    
    const route = routes.find(r => r.path === currentPath);

    if (route) {
        const element = route.component();
        renderElement(element, container);
    } else {
        container.innerHTML = '<p>404 - Not Found</p>';
    }
}

function getCurrentPath(): string {
    return window.location.hash.slice(1);
}