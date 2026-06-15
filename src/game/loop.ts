/**
 * Game Loop - Fixed/variable timestep game loop with FPS management
 * Dependencies: time.ts (DeltaTime), input.ts (InputManager), animation.ts (TweenManager)
 */

import { DeltaTime } from './time';
import { getInput, destroyInput } from './input';
import { getTweenManager, destroyTweenManager } from './animation';
import { destroySpriteManager } from './animation';
import { now, min, max, round } from './utils';

// Types
export interface GameLoopCallbacks {
    update?: (deltaMs: number) => void;
    fixedUpdate?: (fixedDelta: number) => void;
    render?: () => void;
    lateUpdate?: () => void;
}
export interface GameLoopOptions {
    targetFPS?: number;
    maxDeltaMs?: number;
    fixedTimestep?: number;
    autoUpdateInput?: boolean;
    autoUpdateTweens?: boolean;
}
export interface GameLoopStats {
    fps: number;
    frameTime: number;
    updateTime: number;
    renderTime: number;
    frameCount: number;
}

export class GameLoop {
    private callbacks: GameLoopCallbacks = {};
    private options: Required<GameLoopOptions>;

    // Loop state
    private running = false;
    private paused = false;
    private animationFrameId: number | null = null;

    // Timing
    private deltaTime: DeltaTime;
    private lastFrameTime = 0;
    private accumulator = 0;
    private timeScale = 1;

    // FPS tracking
    private frameCount = 0;
    private fpsFrames: number[] = [];
    private frameTimes: number[] = [];
    private updateTimeMs = 0;
    private renderTimeMs = 0;

    constructor(callbacks: GameLoopCallbacks = {}, options: GameLoopOptions = {}) {
        this.callbacks = callbacks;
        this.options = {
            targetFPS: options.targetFPS ?? 60,
            maxDeltaMs: options.maxDeltaMs ?? 100,
            fixedTimestep: options.fixedTimestep ?? 1000 / 60,
            autoUpdateInput: options.autoUpdateInput ?? true,
            autoUpdateTweens: options.autoUpdateTweens ?? true
        };
        this.deltaTime = new DeltaTime();
    }

    start(): this {
        if (this.running) return this;
        this.running = true;
        this.paused = false;
        this.lastFrameTime = now();
        this.deltaTime.reset();
        this.accumulator = 0;
        this.loop();
        return this;
    }
    stop(): this {
        this.running = false;
        this.paused = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        return this;
    }
    pause(): this { this.paused = true; return this; }
    resume(): this {
        if (this.paused) {
            this.paused = false;
            this.lastFrameTime = now();
            this.deltaTime.reset();
            // BUG (Game P1): accumulator is not reset here. Its pre-pause residual
            // (always < fixedTimestep by definition) combines with the first resumed
            // frame's deltaMs, potentially triggering one extra fixedUpdate call
            // immediately — enough to cause a visible physics step discontinuity.
            // SOLUTION: add `this.accumulator = 0` here, mirroring start().
        }
        return this;
    }

    // Configuration
    setCallbacks(callbacks: GameLoopCallbacks): this { this.callbacks = { ...this.callbacks, ...callbacks }; return this; }
    setTargetFPS(fps: number): this { this.options.targetFPS = max(1, fps); return this; }
    setFixedTimestep(ms: number): this { this.options.fixedTimestep = max(1, ms); return this; }
    setTimeScale(scale: number): this { this.timeScale = max(0, scale); this.deltaTime.setTimeScale(this.timeScale); return this; }

    // Status
    isRunning(): boolean { return this.running && !this.paused; }
    isPaused(): boolean { return this.paused; }
    getTimeScale(): number { return this.timeScale; }
    getFrameCount(): number { return this.frameCount; }

    getFPS(): number {
        if (this.fpsFrames.length === 0) return 0;
        const avgFrameTime = this.fpsFrames.reduce((a, b) => a + b, 0) / this.fpsFrames.length;
        return avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
    }
    getStats(): GameLoopStats {
        return {
            fps: round(this.getFPS()),
            frameTime: this.frameTimes.length > 0 ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length : 0,
            updateTime: this.updateTimeMs,
            renderTime: this.renderTimeMs,
            frameCount: this.frameCount
        };
    }

    // Main loop
    private loop = (): void => {
        if (!this.running) return;

        // Early exit if paused - keep loop alive but do no work
        if (this.paused) {
            this.animationFrameId = requestAnimationFrame(this.loop);
            return;
        }

        const currentTime = now();
        const frameStart = currentTime;

        // Calculate delta time with limit
        let deltaMs = min(currentTime - this.lastFrameTime, this.options.maxDeltaMs);
        this.lastFrameTime = currentTime;

        // Apply time scale
        deltaMs *= this.timeScale;

        // Track FPS
        this.fpsFrames.push(deltaMs);
        if (this.fpsFrames.length > 60) this.fpsFrames.shift();

        // Update delta time
        this.deltaTime.update();

        // Variable timestep update
        const updateStart = now();
        this.callbacks.update?.(deltaMs);
        this.updateTimeMs = now() - updateStart;

        // Fixed timestep update (for physics)
        if (this.callbacks.fixedUpdate) {
            this.accumulator += deltaMs;
            const fixedDelta = this.options.fixedTimestep;

            while (this.accumulator >= fixedDelta) {
                this.callbacks.fixedUpdate(fixedDelta);
                this.accumulator -= fixedDelta;
            }
        }

        // Late update (camera, UI, etc.)
        this.callbacks.lateUpdate?.();

        // Render
        const renderStart = now();
        this.callbacks.render?.();
        this.renderTimeMs = now() - renderStart;

        this.frameCount++;

        // Track total frame time
        const totalFrameTime = now() - frameStart;
        this.frameTimes.push(totalFrameTime);
        if (this.frameTimes.length > 60) this.frameTimes.shift();

        // Schedule next frame
        this.animationFrameId = requestAnimationFrame(this.loop);

        // Auto-update game managers (AT THE END OF THE LOOP especially for input)
        if (this.options.autoUpdateInput) {
            getInput().update();
        }
        if (this.options.autoUpdateTweens) {
            getTweenManager().update(deltaMs);
        }
    };
}

// Singleton
let gameLoop: GameLoop | null = null;

export const createGameLoop = (callbacks: GameLoopCallbacks = {}, options: GameLoopOptions = {}): GameLoop => {
    if (gameLoop) console.warn('GameLoop already exists. Use getGameLoop() or call destroyGameLoop() first.');
    gameLoop = new GameLoop(callbacks, options);
    return gameLoop;
};
export const getGameLoop = (): GameLoop | null => gameLoop;
export const destroyGameLoop = (): void => { if (gameLoop) { gameLoop.stop(); gameLoop = null; } };

// Utilities
export function startGameLoop(callbacks: GameLoopCallbacks, options: GameLoopOptions = {}): GameLoop {
    destroyGameLoop();
    const loop = createGameLoop(callbacks, options);
    loop.start();
    return loop;
}
export function cleanupGameSystems(): void {
    destroyGameLoop();
    destroyInput();
    destroyTweenManager();
    destroySpriteManager();
}
