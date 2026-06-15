/**
 * DOM-Specific Animations (hybrid CSS + JS with smart optimization)
 */

import type { EasingFunction } from '../game/animation';
import { Easing, Tween, getTweenManager } from '../game/animation';

// ============================================================================
// DOM-SPECIFIC ANIMATION (Hybrid CSS + JS with smart optimization)
// ============================================================================

// ============================================================================
// TYPES & ENUMS
// ============================================================================

export enum AnimationStrategy {
    CSS = 'css',
    JS = 'js',
    WAAPI = 'waapi',
}

export interface AnimationProperties {
    opacity?: number;
    x?: number;
    y?: number;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    rotate?: number;
    [key: string]: number | undefined;
}

export interface DOMAnimationOptions {
    duration?: number;
    delay?: number;
    easing?: string | EasingFunction;
    strategy?: AnimationStrategy;
    onUpdate?: (progress: number) => void;
    onComplete?: () => void;
}

export interface PerformanceStats {
    fps: number;
    frameDrops: number;
    activeAnimations: number;
    strategy: string;
    averageFPS: number;
}

type Direction = 'left' | 'right' | 'up' | 'down';

// ============================================================================
// SMART HYBRID OPTIMIZER
// ============================================================================

class AnimationOptimizer {
    private static cachedSupport: {
        waapi?: boolean;
        cssTransitions?: boolean;
        prefersReducedMotion?: boolean;
    } = {};

    // BUG (Core P4 — unused parameter): `element` is never read; strategy selection uses
    // only `properties` and `customStrategy`. SOLUTION: remove the parameter and update
    // all call sites, or prefix with `_element` to signal intentional non-use.
    static detectBestStrategy(
        element: HTMLElement,
        properties: AnimationProperties,
        customStrategy?: AnimationStrategy
    ): AnimationStrategy {
        // User override
        if (customStrategy) return customStrategy;

        // Respect reduced motion preference - use instant CSS
        if (this.prefersReducedMotion()) {
            return AnimationStrategy.CSS;
        }

        // Check if using simple CSS-friendly properties
        const cssProps = ['opacity', 'x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate'];
        const propKeys = Object.keys(properties);
        const allCSSFriendly = propKeys.every(key => cssProps.includes(key));

        if (allCSSFriendly && propKeys.length === 1) {
            // Single CSS property - prefer CSS transitions
            return this.supportsCSSTransitions() ? AnimationStrategy.CSS : AnimationStrategy.JS;
        }

        if (allCSSFriendly && this.supportsWebAnimationsAPI()) {
            // Multiple CSS properties - use WAAPI if available
            return AnimationStrategy.WAAPI;
        }

        // Default to JS for complex animations
        return AnimationStrategy.JS;
    }

    static supportsWebAnimationsAPI(): boolean {
        if (this.cachedSupport.waapi !== undefined) {
            return this.cachedSupport.waapi;
        }
        this.cachedSupport.waapi = 'animate' in Element.prototype;
        return this.cachedSupport.waapi;
    }

    static supportsCSSTransitions(): boolean {
        if (this.cachedSupport.cssTransitions !== undefined) {
            return this.cachedSupport.cssTransitions;
        }
        const testElement = document.createElement('div');
        this.cachedSupport.cssTransitions = 'transition' in testElement.style;
        return this.cachedSupport.cssTransitions;
    }

    static prefersReducedMotion(): boolean {
        // BUG (Core P2): matchMedia().matches is cached once and never re-evaluated.
        // User OS setting changes mid-session are silently ignored.
        // SOLUTION: attach a MediaQueryList `change` listener on first call to keep the
        // cache current. (supportsCSSTransitions caching is correct — browser capability
        // never changes; user preference can change at any time, so different treatment.)
        if (this.cachedSupport.prefersReducedMotion !== undefined) {
            return this.cachedSupport.prefersReducedMotion;
        }
        this.cachedSupport.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        return this.cachedSupport.prefersReducedMotion;
    }
}

// ============================================================================
// CSS TRANSITION HELPER (Internal)
// ============================================================================

class CSSTransitionHelper {
    private static easingMap: Record<string, string> = {
        linear: 'linear',
        easeInQuad: 'cubic-bezier(0.55, 0.085, 0.68, 0.53)',
        easeOutQuad: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        easeInOutQuad: 'cubic-bezier(0.455, 0.03, 0.515, 0.955)',
        easeInCubic: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
        easeOutCubic: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
        easeInOutCubic: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
    };

    static applyTransition(
        element: HTMLElement,
        properties: AnimationProperties,
        duration: number,
        easing: string | EasingFunction,
        delay: number
    ): void {
        const cssEasing = typeof easing === 'string'
            ? (this.easingMap[easing] || 'ease')
            : 'ease';

        const durationSec = duration / 1000;
        const delaySec = delay / 1000;

        // Apply transition
        element.style.transition = `all ${durationSec}s ${cssEasing} ${delaySec}s`;

        // Apply properties
        requestAnimationFrame(() => {
            this.applyProperties(element, properties);
        });
    }

    static applyProperties(element: HTMLElement, properties: AnimationProperties): void {
        const transforms: string[] = [];

        for (const [key, value] of Object.entries(properties)) {
            if (value === undefined) continue;

            switch (key) {
                case 'opacity':
                    element.style.opacity = value.toString();
                    break;
                case 'x':
                    transforms.push(`translateX(${value}px)`);
                    break;
                case 'y':
                    transforms.push(`translateY(${value}px)`);
                    break;
                case 'scale':
                    transforms.push(`scale(${value})`);
                    break;
                case 'scaleX':
                    transforms.push(`scaleX(${value})`);
                    break;
                case 'scaleY':
                    transforms.push(`scaleY(${value})`);
                    break;
                case 'rotate':
                    transforms.push(`rotate(${value}deg)`);
                    break;
                default:
                    // Direct property access for other CSS properties
                    (element.style as any)[key] = value;
            }
        }

        if (transforms.length > 0) {
            element.style.transform = transforms.join(' ');
        }
    }

    static cleanup(element: HTMLElement): void {
        element.style.transition = '';
    }
}

// ============================================================================
// PERFORMANCE MONITOR
// ============================================================================

export class AnimationPerformanceMonitor {
    private static instance: AnimationPerformanceMonitor | null = null;
    private frameCount = 0;
    private lastTime = performance.now();
    private fps = 60;
    private frameDrops = 0;
    private fpsHistory: number[] = [];
    private isMonitoring = false;
    private rafId: number | null = null;

    static getInstance(): AnimationPerformanceMonitor {
        if (!this.instance) {
            this.instance = new AnimationPerformanceMonitor();
        }
        return this.instance;
    }

    start(): void {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fpsHistory = [];
        this.measure();
    }

    stop(): void {
        this.isMonitoring = false;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    private measure(): void {
        if (!this.isMonitoring) return;

        const currentTime = performance.now();
        const delta = currentTime - this.lastTime;

        this.frameCount++;

        // Calculate FPS every ~1 second (60 frames)
        if (this.frameCount >= 60) {
            const currentFPS = Math.round((1000 / delta) * this.frameCount) / this.frameCount;
            this.fps = currentFPS;
            this.fpsHistory.push(currentFPS);

            // Keep last 10 samples
            if (this.fpsHistory.length > 10) {
                this.fpsHistory.shift();
            }

            // Detect frame drops (FPS < 55)
            if (currentFPS < 55) {
                this.frameDrops++;
            }

            this.frameCount = 0;
            this.lastTime = currentTime;
        }

        this.rafId = requestAnimationFrame(() => this.measure());
    }

    getStats(): PerformanceStats {
        const tweenManager = getTweenManager();
        const activeAnimations = tweenManager.getTweenCount() + tweenManager.getSequenceCount();
        const averageFPS = this.fpsHistory.length > 0
            ? Math.round(this.fpsHistory.reduce((sum, fps) => sum + fps, 0) / this.fpsHistory.length)
            : this.fps;

        return {
            fps: Math.round(this.fps),
            frameDrops: this.frameDrops,
            activeAnimations,
            strategy: 'hybrid',
            averageFPS,
        };
    }

    reset(): void {
        this.frameCount = 0;
        this.frameDrops = 0;
        this.fpsHistory = [];
        this.lastTime = performance.now();
    }
}

// Singleton accessor
export const getPerformanceMonitor = (): AnimationPerformanceMonitor =>
    AnimationPerformanceMonitor.getInstance();

// ============================================================================
// FLUENT DOM ANIMATION BUILDER
// ============================================================================

export class DOMAnimation {
    private element: HTMLElement;
    private properties: AnimationProperties = {};
    private fromProperties: AnimationProperties = {};
    private options: DOMAnimationOptions = {
        duration: 300,
        delay: 0,
        easing: 'easeOutQuad',
    };
    private strategy?: AnimationStrategy;
    private useFrom = false;

    constructor(element: HTMLElement) {
        this.element = element;
    }

    to(properties: AnimationProperties): this {
        this.properties = { ...properties };
        this.useFrom = false;
        return this;
    }

    from(properties: AnimationProperties): this {
        this.fromProperties = { ...properties };
        this.useFrom = true;
        return this;
    }

    fromTo(from: AnimationProperties, to: AnimationProperties): this {
        this.fromProperties = { ...from };
        this.properties = { ...to };
        this.useFrom = true;
        return this;
    }

    duration(ms: number): this {
        this.options.duration = ms;
        return this;
    }

    delay(ms: number): this {
        this.options.delay = ms;
        return this;
    }

    easing(easingName: string | EasingFunction): this {
        this.options.easing = easingName;
        return this;
    }

    onUpdate(callback: (progress: number) => void): this {
        this.options.onUpdate = callback;
        return this;
    }

    onComplete(callback: () => void): this {
        this.options.onComplete = callback;
        return this;
    }

    useStrategy(strategy: AnimationStrategy): this {
        this.strategy = strategy;
        return this;
    }

    async play(): Promise<void> {
        // Apply 'from' values immediately if using from/fromTo
        if (this.useFrom) {
            CSSTransitionHelper.applyProperties(this.element, this.fromProperties);
            await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
        }

        // Detect strategy
        const strategy = AnimationOptimizer.detectBestStrategy(
            this.element,
            this.properties,
            this.strategy
        );

        // Handle reduced motion - instant transition
        if (AnimationOptimizer.prefersReducedMotion()) {
            CSSTransitionHelper.applyProperties(this.element, this.properties);
            this.options.onComplete?.();
            return Promise.resolve();
        }

        // Execute animation based on strategy
        switch (strategy) {
            case AnimationStrategy.CSS:
                return this.playCSS();
            case AnimationStrategy.WAAPI:
                return this.playWAAPI();
            case AnimationStrategy.JS:
            default:
                return this.playJS();
        }
    }

    private playCSS(): Promise<void> {
        return new Promise((resolve) => {
            const duration = this.options.duration || 300;
            const delay = this.options.delay || 0;
            const easing = this.options.easing || 'easeOutQuad';

            // BUG (Core P2): both the transitionend listener and the fallback setTimeout
            // call onComplete and resolve independently — onComplete fires twice when
            // transitionend succeeds (the common case). The removeEventListener inside the
            // setTimeout is also a no-op since the listener was already removed by then.
            // SOLUTION: extract a shared finish() with a `resolved` guard; both paths call
            // finish(), which short-circuits after the first invocation.
            const handleTransitionEnd = () => {
                this.element.removeEventListener('transitionend', handleTransitionEnd);
                CSSTransitionHelper.cleanup(this.element);
                this.options.onComplete?.();
                resolve();
            };

            this.element.addEventListener('transitionend', handleTransitionEnd);

            CSSTransitionHelper.applyTransition(
                this.element,
                this.properties,
                duration,
                easing,
                delay
            );

            // Fallback timeout in case transitionend doesn't fire
            setTimeout(() => {
                this.element.removeEventListener('transitionend', handleTransitionEnd);
                CSSTransitionHelper.cleanup(this.element);
                this.options.onComplete?.();
                resolve();
            }, duration + delay + 50);
        });
    }

    private playWAAPI(): Promise<void> {
        return new Promise((resolve) => {
            const duration = this.options.duration || 300;
            const delay = this.options.delay || 0;

            // Convert properties to WAAPI format
            const keyframes: any = {};
            for (const [key, value] of Object.entries(this.properties)) {
                if (value === undefined) continue;

                switch (key) {
                    case 'x':
                    case 'y':
                    case 'scale':
                    case 'scaleX':
                    case 'scaleY':
                    case 'rotate':
                        // Will handle transform separately
                        break;
                    default:
                        keyframes[key] = value;
                }
            }

            // Handle transforms
            const transforms: string[] = [];
            if (this.properties.x !== undefined) transforms.push(`translateX(${this.properties.x}px)`);
            if (this.properties.y !== undefined) transforms.push(`translateY(${this.properties.y}px)`);
            if (this.properties.scale !== undefined) transforms.push(`scale(${this.properties.scale})`);
            if (this.properties.scaleX !== undefined) transforms.push(`scaleX(${this.properties.scaleX})`);
            if (this.properties.scaleY !== undefined) transforms.push(`scaleY(${this.properties.scaleY})`);
            if (this.properties.rotate !== undefined) transforms.push(`rotate(${this.properties.rotate}deg)`);

            if (transforms.length > 0) {
                keyframes.transform = transforms.join(' ');
            }

            const animation = this.element.animate([keyframes], {
                duration,
                delay,
                easing: 'ease-out',
                fill: 'forwards',
            });

            animation.onfinish = () => {
                this.options.onComplete?.();
                resolve();
            };
        });
    }

    private playJS(): Promise<void> {
        // BUG (Core P2): tweens are added to TweenManager but update() is only called by
        // GameLoop. In DOM-only usage the Promise never resolves and onComplete never fires.
        // SOLUTION: give TweenManager a self-driven rAF loop that starts when the first
        // tween is added (startIfIdle) and stops when the last one completes. GameLoop
        // becomes an external driver that replaces the internal loop — single-driver swap,
        // no double-tick. Add isExternallyDriven flag to TweenManager to coordinate.
        return new Promise((resolve) => {
            const duration = this.options.duration || 300;
            const delay = this.options.delay || 0;
            let easing: EasingFunction = Easing.easeOutQuad;

            if (typeof this.options.easing === 'string') {
                easing = (Easing as any)[this.options.easing] || Easing.easeOutQuad;
            } else if (typeof this.options.easing === 'function') {
                easing = this.options.easing;
            }

            // Create tweens for each property
            const tweens: Tween[] = [];
            const manager = getTweenManager();

            for (const [key, toValue] of Object.entries(this.properties)) {
                if (toValue === undefined) continue;

                // Create a proxy object to store animated values
                const proxy: any = { value: 0 };

                // Get current value based on property type
                let fromValue = 0;
                const computedStyle = getComputedStyle(this.element);

                switch (key) {
                    case 'opacity':
                        fromValue = parseFloat(computedStyle.opacity);
                        break;
                    case 'x':
                    case 'y':
                    case 'scale':
                    case 'scaleX':
                    case 'scaleY':
                    case 'rotate':
                        fromValue = 0; // Assume starting from neutral transform
                        break;
                    default:
                        fromValue = parseFloat((this.element.style as any)[key]) || 0;
                }

                proxy.value = fromValue;

                const tween = new Tween({
                    target: proxy,
                    property: 'value',
                    to: toValue,
                    duration,
                    easing,
                    onUpdate: (value) => {
                        const props: AnimationProperties = { [key]: value };
                        CSSTransitionHelper.applyProperties(this.element, props);
                        this.options.onUpdate?.(value);
                    },
                    onComplete: () => {
                        // Remove this tween from the list
                        const index = tweens.indexOf(tween);
                        if (index > -1) tweens.splice(index, 1);

                        // If all tweens complete, resolve promise
                        if (tweens.length === 0) {
                            this.options.onComplete?.();
                            resolve();
                        }
                    },
                });

                tweens.push(tween);
                manager.add(tween);
            }

            // Start all tweens after delay
            if (delay > 0) {
                setTimeout(() => {
                    tweens.forEach(t => t.start());
                }, delay);
            } else {
                tweens.forEach(t => t.start());
            }
        });
    }
}

// ============================================================================
// SIMPLE TRANSITION HELPERS (Declarative API)
// ============================================================================

export function fadeIn(element: HTMLElement, duration: number = 300): Promise<void> {
    return new DOMAnimation(element)
        .fromTo({ opacity: 0 }, { opacity: 1 })
        .duration(duration)
        .play();
}

export function fadeOut(element: HTMLElement, duration: number = 300): Promise<void> {
    return new DOMAnimation(element)
        .to({ opacity: 0 })
        .duration(duration)
        .play();
}

export function slideIn(
    element: HTMLElement,
    direction: Direction = 'left',
    duration: number = 300
): Promise<void> {
    const distance = 100;
    const from: AnimationProperties = {};
    const to: AnimationProperties = { x: 0, y: 0 };

    switch (direction) {
        case 'left':
            from.x = -distance;
            break;
        case 'right':
            from.x = distance;
            break;
        case 'up':
            from.y = -distance;
            break;
        case 'down':
            from.y = distance;
            break;
    }

    return new DOMAnimation(element)
        .fromTo(from, to)
        .duration(duration)
        .easing('easeOutCubic')
        .play();
}

export function slideOut(
    element: HTMLElement,
    direction: Direction = 'left',
    duration: number = 300
): Promise<void> {
    const distance = 100;
    const to: AnimationProperties = {};

    switch (direction) {
        case 'left':
            to.x = -distance;
            break;
        case 'right':
            to.x = distance;
            break;
        case 'up':
            to.y = -distance;
            break;
        case 'down':
            to.y = distance;
            break;
    }

    return new DOMAnimation(element)
        .to(to)
        .duration(duration)
        .easing('easeInCubic')
        .play();
}

export function scaleIn(element: HTMLElement, duration: number = 300): Promise<void> {
    return new DOMAnimation(element)
        .fromTo({ scale: 0 }, { scale: 1 })
        .duration(duration)
        .easing('easeOutBack')
        .play();
}

export function scaleOut(element: HTMLElement, duration: number = 300): Promise<void> {
    return new DOMAnimation(element)
        .to({ scale: 0 })
        .duration(duration)
        .easing('easeInBack')
        .play();
}

export function rotate(
    element: HTMLElement,
    degrees: number,
    duration: number = 300
): Promise<void> {
    return new DOMAnimation(element)
        .to({ rotate: degrees })
        .duration(duration)
        .easing('easeInOutQuad')
        .play();
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Creates a fluent animation builder for a DOM element
 *
 * @example
 * animateElement(myDiv)
 *   .to({ opacity: 1, x: 100 })
 *   .duration(500)
 *   .easing('easeOutQuad')
 *   .play();
 */
export function animateElement(element: HTMLElement): DOMAnimation {
    return new DOMAnimation(element);
}
