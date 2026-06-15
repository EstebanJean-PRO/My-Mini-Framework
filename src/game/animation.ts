/**
 * Game Animation - Tween/Easing engine + Sprite Sheet Animations
 */

import { lerp } from './math';
import { now, pow, sqrt, sin, cos, PI, min } from './utils';
import type { Entity, EntityComponent } from './entity';

// ============================================================================
// CORE ANIMATION ENGINE (Tween + Easing)
// ============================================================================

export type EasingFunction = (t: number) => number;

export const Easing = {
    linear: (t: number): number => t,
    easeInQuad: (t: number): number => t * t,
    easeOutQuad: (t: number): number => t * (2 - t),
    easeInOutQuad: (t: number): number => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: (t: number): number => t * t * t,
    easeOutCubic: (t: number): number => (--t) * t * t + 1,
    easeInOutCubic: (t: number): number => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    easeInQuart: (t: number): number => t * t * t * t,
    easeOutQuart: (t: number): number => 1 - (--t) * t * t * t,
    easeInOutQuart: (t: number): number => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
    easeInExpo: (t: number): number => t === 0 ? 0 : pow(2, 10 * (t - 1)),
    easeOutExpo: (t: number): number => t === 1 ? 1 : 1 - pow(2, -10 * t),
    easeInOutExpo: (t: number): number => !t || t === 1 ? t : t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2,
    easeInSine: (t: number): number => 1 - cos((t * PI) / 2),
    easeOutSine: (t: number): number => sin((t * PI) / 2),
    easeInOutSine: (t: number): number => -(cos(PI * t) - 1) / 2,
    easeInCirc: (t: number): number => 1 - sqrt(1 - t * t),
    easeOutCirc: (t: number): number => sqrt(1 - (--t) * t),
    easeInOutCirc: (t: number): number => t < 0.5 ? (1 - sqrt(1 - 4 * t * t)) / 2 : (sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2,
    easeInElastic: (t: number): number => !t || t === 1 ? t : -pow(2, 10 * t - 10) * sin((t * 10 - 10.75) * ((2 * PI) / 3)),
    easeOutElastic: (t: number): number => !t || t === 1 ? t : pow(2, -10 * t) * sin((t * 10 - 0.75) * ((2 * PI) / 3)) + 1,
    easeInOutElastic: (t: number): number => !t || t === 1 ? t : t < 0.5 ? -(pow(2, 20 * t - 10) * sin((20 * t - 11.125) * ((2 * PI) / 4.5))) / 2 : (pow(2, -20 * t + 10) * sin((20 * t - 11.125) * ((2 * PI) / 4.5))) / 2 + 1,
};

export interface TweenOptions<T> {
    target: T;
    property: keyof T;
    to: number;
    duration: number;
    easing?: EasingFunction;
    onUpdate?: (value: number) => void;
    onComplete?: () => void;
}

export class Tween<T = any> {
    private target: T;
    private property: keyof T;
    private from: number;
    private to: number;
    private duration: number;
    private easing: EasingFunction;
    private onUpdate?: (value: number) => void;
    private onComplete?: () => void;
    private startTime = 0;
    private pausedAt = 0;
    private pausedTotal = 0;
    private running = false;
    private completed = false;

    constructor(options: TweenOptions<T>) {
        this.target = options.target;
        this.property = options.property;
        this.from = (this.target[this.property] as unknown as number) || 0;
        this.to = options.to;
        this.duration = options.duration;
        this.easing = options.easing || Easing.linear;
        this.onUpdate = options.onUpdate;
        this.onComplete = options.onComplete;
    }

    start(): this {
        this.startTime = now();
        this.pausedTotal = 0;
        this.pausedAt = 0;
        this.running = true;
        this.completed = false;
        this.from = (this.target[this.property] as unknown as number) || 0;
        return this;
    }
    stop(): this { this.running = false; this.pausedAt = 0; return this; }
    pause(): this { if (this.running && !this.pausedAt) this.pausedAt = now(); return this; }
    resume(): this { if (this.pausedAt) { this.pausedTotal += now() - this.pausedAt; this.pausedAt = 0; } return this; }
    reset(): this { return this.stop().start(); }

    // BUG (Game P1): _deltaMs is unused; progress uses now() - startTime - pausedTotal
    // (wall-clock time). GameLoop.setTimeScale() scales deltaMs before passing it to
    // TweenManager.update(scaledDelta) → tween.update(scaledDelta), but the tween discards
    // it. setTimeScale(0.5) has zero effect on any Tween.
    // SOLUTION: replace startTime/pausedAt/pausedTotal with a single `elapsed = 0` counter.
    // update(deltaMs): this.elapsed += deltaMs; progress = min(1, elapsed / duration).
    // pause() sets a flag to skip accumulation; resume() clears it; start() resets elapsed.
    // GameLoop already delivers scaled delta — tweens just consume what they receive.
    update(_deltaMs: number = 0): boolean {
        if (!this.running || this.pausedAt || this.completed) return false;
        const elapsed = now() - this.startTime - this.pausedTotal;
        const progress = min(1, elapsed / this.duration);
        const t = this.easing(progress);
        const value = lerp(this.from, this.to, t);
        (this.target[this.property] as unknown as number) = value;
        this.onUpdate?.(value);
        if (progress >= 1) {
            this.completed = true;
            this.running = false;
            this.onComplete?.();
            return true;
        }
        return false;
    }

    isRunning(): boolean { return this.running && !this.pausedAt; }
    isComplete(): boolean { return this.completed; }
    getProgress(): number {
        if (this.completed) return 1;
        if (!this.running) return 0;
        const elapsed = now() - this.startTime - this.pausedTotal;
        return min(1, elapsed / this.duration);
    }
}

export class TweenSequence {
    // BUG (Game P1): addParallel pushes into parallelGroups (never read) AND spreads all
    // tweens into this.tweens. update() uses a single currentIndex advancing one slot at a
    // time — parallel tweens run sequentially with no group awareness.
    // SOLUTION: change tweens to (Tween | Tween[])[]. add() pushes a single Tween; addParallel()
    // pushes the group array as one slot. update() checks Array.isArray(current): if true,
    // ticks all tweens in the group each frame and advances only when all are complete.
    // parallelGroups field is eliminated.
    private tweens: Tween[] = [];
    private parallelGroups: Tween[][] = [];
    private currentIndex = 0;
    private running = false;

    add(tween: Tween): this { this.tweens.push(tween); return this; }
    addParallel(...tweens: Tween[]): this { this.parallelGroups.push(tweens); this.tweens.push(...tweens); return this; }
    start(): this {
        this.currentIndex = 0;
        this.running = true;
        if (this.tweens.length > 0) this.tweens[0].start();
        return this;
    }
    stop(): this { this.running = false; this.tweens.forEach(t => t.stop()); return this; }
    update(deltaMs: number = 0): boolean {
        if (!this.running || this.currentIndex >= this.tweens.length) {
            this.running = false;
            return true;
        }
        const currentTween = this.tweens[this.currentIndex];
        const isComplete = currentTween.update(deltaMs);
        if (isComplete) {
            this.currentIndex++;
            if (this.currentIndex < this.tweens.length) {
                this.tweens[this.currentIndex].start();
            } else {
                this.running = false;
                return true;
            }
        }
        return false;
    }
    isRunning(): boolean { return this.running; }
}

export class TweenManager {
    private tweens = new Set<Tween>();
    private sequences = new Set<TweenSequence>();

    add(tween: Tween): Tween { this.tweens.add(tween); return tween; }
    addSequence(sequence: TweenSequence): TweenSequence { this.sequences.add(sequence); return sequence; }
    remove(tween: Tween): void { this.tweens.delete(tween); }
    removeSequence(sequence: TweenSequence): void { this.sequences.delete(sequence); }
    update(deltaMs: number = 0): void {
        this.tweens.forEach(tween => { if (tween.update(deltaMs)) this.tweens.delete(tween); });
        this.sequences.forEach(seq => { if (seq.update(deltaMs)) this.sequences.delete(seq); });
    }
    clear(): void {
        this.tweens.forEach(t => t.stop());
        this.sequences.forEach(s => s.stop());
        this.tweens.clear();
        this.sequences.clear();
    }
    getTweenCount(): number { return this.tweens.size; }
    getSequenceCount(): number { return this.sequences.size; }
}

let tweenManagerInstance: TweenManager | null = null;
export const getTweenManager = (): TweenManager => tweenManagerInstance ?? (tweenManagerInstance = new TweenManager());
export const destroyTweenManager = (): void => { tweenManagerInstance?.clear(); tweenManagerInstance = null; };

export function tween<T>(options: TweenOptions<T>): Tween<T> {
    const t = new Tween(options);
    getTweenManager().add(t);
    t.start();
    return t;
}
export function animate(from: number, to: number, duration: number, easing: EasingFunction = Easing.linear): Promise<number> {
    return new Promise(resolve => {
        const obj = { value: from };
        tween({ target: obj, property: 'value', to, duration, easing, onComplete: () => resolve(obj.value) });
    });
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type LoopMode = 'forward' | 'once' | 'pingpong';

export interface FrameDefinition {
    x: number;           // X position in sprite sheet
    y: number;           // Y position in sprite sheet
    w: number;           // Frame width
    h: number;           // Frame height
    name?: string;       // Optional frame name/identifier
    duration?: number;   // Optional per-frame duration override
}

export interface SpriteSheetConfig {
    name: string;
    image: HTMLImageElement;
    frames: FrameDefinition[];  // REQUIRED: Array of frame definitions
}

export interface AnimationConfig {
    name: string;
    frames: number[];
    fps?: number;
    frameDurations?: number[];
    loop?: boolean;
    loopMode?: LoopMode;
    onComplete?: () => void;
    onLoop?: (count: number) => void;
    onFrameChange?: (frame: number) => void;
}

export interface AnimationPlayerOptions {
    animations: Record<string, AnimationConfig>;
    defaultAnimation?: string;
    autoPlay?: boolean;
}

// ============================================================================
// SPRITE SHEET
// ============================================================================

export class SpriteSheet {
    private name: string;
    private image: HTMLImageElement;
    private frameRects: Array<{ x: number; y: number; w: number; h: number }>;
    private frameNames?: Map<string, number>;

    constructor(config: SpriteSheetConfig) {
        this.name = config.name;
        this.image = config.image;
        this.frameRects = this.initializeFrames(config.frames);
        this.frameNames = this.buildFrameNameMap(config.frames);
    }

    private initializeFrames(frames: FrameDefinition[]): Array<{ x: number; y: number; w: number; h: number }> {
        if (!frames || frames.length === 0) {
            throw new Error('frames array must contain at least one FrameDefinition');
        }

        return frames.map((frame, index) => {
            // Validate required properties
            if (typeof frame.x !== 'number' || typeof frame.y !== 'number' ||
                typeof frame.w !== 'number' || typeof frame.h !== 'number') {
                throw new Error(`Frame at index ${index} must have numeric x, y, w, h properties`);
            }

            // Validate dimensions
            if (frame.w <= 0 || frame.h <= 0) {
                throw new Error(`Frame at index ${index} has invalid dimensions: w=${frame.w}, h=${frame.h}`);
            }

            // Validate bounds (optional but recommended)
            if (frame.x < 0 || frame.y < 0) {
                console.warn(`Frame at index ${index} has negative position: x=${frame.x}, y=${frame.y}`);
            }

            if (frame.x + frame.w > this.image.width || frame.y + frame.h > this.image.height) {
                console.warn(`Frame at index ${index} extends beyond image bounds`);
            }

            return { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
        });
    }

    private buildFrameNameMap(frames: FrameDefinition[]): Map<string, number> | undefined {
        const nameMap = new Map<string, number>();
        let hasNames = false;

        frames.forEach((frame, index) => {
            if (frame.name) {
                if (nameMap.has(frame.name)) {
                    console.warn(`Duplicate frame name "${frame.name}" at index ${index}`);
                }
                nameMap.set(frame.name, index);
                hasNames = true;
            }
        });

        return hasNames ? nameMap : undefined;
    }

    getFrame(index: number): { x: number; y: number; w: number; h: number } {
        return this.frameRects[index] ?? this.frameRects[0];
    }

    getTotalFrames(): number {
        return this.frameRects.length;
    }

    getImage(): HTMLImageElement {
        return this.image;
    }

    getFrameDimensions(frameIndex = 0): { width: number; height: number } {
        const frame = this.frameRects[frameIndex] ?? this.frameRects[0];
        return { width: frame.w, height: frame.h };
    }

    getFrameByName(name: string): { x: number; y: number; w: number; h: number } | null {
        if (!this.frameNames) {
            return null;
        }
        const index = this.frameNames.get(name);
        return index !== undefined ? this.getFrame(index) : null;
    }

    getFrameNames(): string[] | null {
        if (!this.frameNames) {
            return null;
        }
        return Array.from(this.frameNames.keys());
    }
}

// ============================================================================
// ANIMATION PLAYER
// ============================================================================

export class AnimationPlayer {
    private animations: Map<string, AnimationConfig>;
    private currentAnimation: AnimationConfig | null = null;
    private currentFrameIndex = 0;
    private elapsedTime = 0;
    private isPlaying = false;
    private isPaused = false;
    private loopCount = 0;
    private direction = 1;

    constructor(options: AnimationPlayerOptions) {
        this.animations = new Map(Object.entries(options.animations));

        if (options.defaultAnimation && options.autoPlay !== false) {
            this.play(options.defaultAnimation);
        }
    }

    play(name: string): this {
        const animation = this.animations.get(name);
        if (!animation) {
            console.warn(`Animation "${name}" not found`);
            return this;
        }

        if (this.currentAnimation !== animation) {
            this.currentAnimation = animation;
            this.currentFrameIndex = 0;
            this.elapsedTime = 0;
            this.loopCount = 0;
            this.direction = 1;
            this.isPlaying = true;
            this.isPaused = false;
        } else if (!this.isPlaying) {
            this.isPlaying = true;
            this.isPaused = false;
        }

        return this;
    }

    pause(): this {
        this.isPaused = true;
        return this;
    }

    resume(): this {
        this.isPaused = false;
        return this;
    }

    stop(): this {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentFrameIndex = 0;
        this.elapsedTime = 0;
        return this;
    }

    reset(): this {
        this.currentFrameIndex = 0;
        this.elapsedTime = 0;
        this.loopCount = 0;
        this.direction = 1;
        return this;
    }

    update(deltaMs: number): void {
        if (!this.isPlaying || this.isPaused || !this.currentAnimation) {
            return;
        }

        this.elapsedTime += deltaMs;
        // BUG (Game P1): frameDuration is captured once as frame N's duration. After
        // advanceFrame() increments currentFrameIndex, the while loop still subtracts and
        // compares against frame N's duration. Non-uniform frameDurations accumulate timing
        // error: a short frame N+1 is never consumed in the same update call.
        // SOLUTION: re-evaluate getFrameDuration() each iteration so it reads the current
        // frame after each advanceFrame(). Subtract before advancing so elapsedTime
        // represents time past the frame that just ended.
        //   while (true) { const fd = getFrameDuration(); if (elapsedTime < fd) break;
        //                   elapsedTime -= fd; advanceFrame(); }
        const frameDuration = this.getFrameDuration();

        while (this.elapsedTime >= frameDuration) {
            this.advanceFrame();
            this.elapsedTime -= frameDuration;
        }
    }

    private getFrameDuration(): number {
        if (!this.currentAnimation) return 0;

        if (this.currentAnimation.frameDurations) {
            return this.currentAnimation.frameDurations[this.currentFrameIndex] ?? 100;
        }

        if (this.currentAnimation.fps) {
            return 1000 / this.currentAnimation.fps;
        }

        return 100;
    }

    private advanceFrame(): void {
        if (!this.currentAnimation) return;

        const frames = this.currentAnimation.frames;
        const lastIndex = frames.length - 1;
        const previousFrame = this.getCurrentFrame();

        const loopMode = this.currentAnimation.loopMode ?? 'forward';
        const shouldLoop = this.currentAnimation.loop !== false;

        if (loopMode === 'pingpong') {
            this.currentFrameIndex += this.direction;

            if (this.currentFrameIndex > lastIndex) {
                this.currentFrameIndex = lastIndex - 1;
                this.direction = -1;
                this.handleLoop();
            } else if (this.currentFrameIndex < 0) {
                this.currentFrameIndex = 1;
                this.direction = 1;
            }
        } else {
            this.currentFrameIndex++;

            if (this.currentFrameIndex > lastIndex) {
                if (shouldLoop && loopMode === 'forward') {
                    this.currentFrameIndex = 0;
                    this.handleLoop();
                } else {
                    this.currentFrameIndex = lastIndex;
                    this.isPlaying = false;
                    this.currentAnimation.onComplete?.();
                }
            }
        }

        const newFrame = this.getCurrentFrame();
        if (newFrame !== previousFrame) {
            this.currentAnimation.onFrameChange?.(newFrame);
        }
    }

    private handleLoop(): void {
        this.loopCount++;
        this.currentAnimation?.onLoop?.(this.loopCount);
    }

    getCurrentFrame(): number {
        if (!this.currentAnimation) return 0;
        return this.currentAnimation.frames[this.currentFrameIndex] ?? 0;
    }

    getCurrentAnimation(): string | null {
        return this.currentAnimation?.name ?? null;
    }

    getIsPlaying(): boolean {
        return this.isPlaying && !this.isPaused;
    }

    getIsPaused(): boolean {
        return this.isPaused;
    }

    getLoopCount(): number {
        return this.loopCount;
    }

    addAnimation(config: AnimationConfig): this {
        this.animations.set(config.name, config);
        return this;
    }

    removeAnimation(name: string): this {
        this.animations.delete(name);
        return this;
    }

    hasAnimation(name: string): boolean {
        return this.animations.has(name);
    }
}

// ============================================================================
// ANIMATED SPRITE
// ============================================================================

export class AnimatedSprite {
    private spriteSheet: SpriteSheet;
    private player: AnimationPlayer;

    constructor(spriteSheet: SpriteSheet, playerOptions: AnimationPlayerOptions) {
        this.spriteSheet = spriteSheet;
        this.player = new AnimationPlayer(playerOptions);
    }

    update(deltaMs: number): void {
        this.player.update(deltaMs);
    }

    render(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
        const frame = this.player.getCurrentFrame();
        const rect = this.spriteSheet.getFrame(frame);
        const image = this.spriteSheet.getImage();

        ctx.drawImage(
            image,
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            x,
            y,
            rect.w * scale,
            rect.h * scale
        );
    }

    renderRotated(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        rotation: number,
        scale = 1
    ): void {
        const frame = this.player.getCurrentFrame();
        const rect = this.spriteSheet.getFrame(frame);
        const image = this.spriteSheet.getImage();

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.scale(scale, scale);

        ctx.drawImage(
            image,
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            -rect.w / 2,
            -rect.h / 2,
            rect.w,
            rect.h
        );

        ctx.restore();
    }

    play(name: string): this {
        this.player.play(name);
        return this;
    }

    pause(): this {
        this.player.pause();
        return this;
    }

    resume(): this {
        this.player.resume();
        return this;
    }

    stop(): this {
        this.player.stop();
        return this;
    }

    reset(): this {
        this.player.reset();
        return this;
    }

    getCurrentFrame(): number {
        return this.player.getCurrentFrame();
    }

    getCurrentAnimation(): string | null {
        return this.player.getCurrentAnimation();
    }

    isPlaying(): boolean {
        return this.player.getIsPlaying();
    }

    getSpriteSheet(): SpriteSheet {
        return this.spriteSheet;
    }

    getPlayer(): AnimationPlayer {
        return this.player;
    }
}

// ============================================================================
// ENTITY COMPONENT INTEGRATION
// ============================================================================

export class SpriteAnimationComponent implements EntityComponent {
    entity!: Entity;
    private animatedSprite: AnimatedSprite;

    constructor(animatedSprite: AnimatedSprite) {
        this.animatedSprite = animatedSprite;
    }

    update(deltaMs: number): void {
        this.animatedSprite.update(deltaMs);
    }

    render(ctx?: CanvasRenderingContext2D): void {
        if (!ctx) return;

        const pos = this.entity.position;
        const rotation = this.entity.rotation;
        const scale = this.entity.scale;

        if (rotation !== 0) {
            this.animatedSprite.renderRotated(ctx, pos.x, pos.y, rotation, scale.x);
        } else {
            this.animatedSprite.render(ctx, pos.x, pos.y, scale.x);
        }
    }

    play(name: string): this {
        this.animatedSprite.play(name);
        return this;
    }

    pause(): this {
        this.animatedSprite.pause();
        return this;
    }

    resume(): this {
        this.animatedSprite.resume();
        return this;
    }

    stop(): this {
        this.animatedSprite.stop();
        return this;
    }

    getAnimatedSprite(): AnimatedSprite {
        return this.animatedSprite;
    }

    getCurrentAnimation(): string | null {
        return this.animatedSprite.getCurrentAnimation();
    }

    destroy(): void {
        this.animatedSprite.stop();
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function generateGridFrames(
    imageWidth: number,
    imageHeight: number,
    frameWidth: number,
    frameHeight: number,
    columns?: number,
    rows?: number
): FrameDefinition[] {
    const cols = columns ?? Math.floor(imageWidth / frameWidth);
    const rowCount = rows ?? Math.floor(imageHeight / frameHeight);
    const frames: FrameDefinition[] = [];

    for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < cols; col++) {
            frames.push({
                x: col * frameWidth,
                y: row * frameHeight,
                w: frameWidth,
                h: frameHeight
            });
        }
    }

    return frames;
}

export async function loadSpriteSheet(
    name: string,
    url: string,
    gridProps?: {
        frameWidth: number;
        frameHeight: number;
        columns: number;
        rows: number;
    },
    frames?: FrameDefinition[]
): Promise<SpriteSheet> {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
            try {
                let allFrames: FrameDefinition[] = frames ?? [];
                if (gridProps) {
                    allFrames = generateGridFrames(
                        image.width,
                        image.height,
                        gridProps.frameWidth,
                        gridProps.frameHeight,
                        gridProps.columns,
                        gridProps.rows
                    );
                }
                const spriteSheet = new SpriteSheet({ name, image, frames: allFrames });
                resolve(spriteSheet);
            } catch (error) {
                reject(error);
            }
        };

        image.onerror = () => {
            reject(new Error(`Failed to load sprite sheet: ${url}`));
        };

        image.src = url;
    });
}

export function createAnimatedSprite(
    spriteSheet: SpriteSheet,
    animations: Record<string, Omit<AnimationConfig, 'name'>>,
    defaultAnimation?: string
): AnimatedSprite {
    const namedAnimations: Record<string, AnimationConfig> = {};
    for (const [name, config] of Object.entries(animations)) {
        namedAnimations[name] = { ...config, name };
    }

    return new AnimatedSprite(spriteSheet, {
        animations: namedAnimations,
        defaultAnimation,
        autoPlay: true,
    });
}

// ============================================================================
// MANAGED SPRITE (for SpriteManager)
// ============================================================================

export interface ManagedSpriteConfig {
    x?: number;
    y?: number;
    frame?: number;
    scaleX?: number;
    scaleY?: number;
    anchorX?: number;  // 0 = left, 0.5 = center, 1 = right
    anchorY?: number;  // 0 = top, 0.5 = center, 1 = bottom
    rotation?: number;
    layer?: number;
    visible?: boolean;
    playbackSpeed?: number;  // Animation speed multiplier (1.0 = normal, 2.0 = 2x speed)
    animations?: Record<string, Omit<AnimationConfig, 'name'>>;
    defaultAnimation?: string;
    entity?: Entity;
}

export class ManagedSprite {
    readonly id: string;
    readonly sheetName: string;
    private sheet: SpriteSheet;
    private player: AnimationPlayer | null = null;

    // Transform (position is offset when attached to entity)
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    anchorX: number;  // 0 = left, 0.5 = center, 1 = right
    anchorY: number;  // 0 = top, 0.5 = center, 1 = bottom
    rotation: number;
    layer: number;
    visible: boolean;

    // Animation speed multiplier (1.0 = normal, 2.0 = 2x speed, 0.5 = half speed)
    playbackSpeed: number;

    // Static frame (used when not animated)
    frame: number;

    // Optional entity attachment
    private attachedEntity: Entity | null = null;

    constructor(id: string, sheetName: string, sheet: SpriteSheet, config: ManagedSpriteConfig = {}) {
        this.id = id;
        this.sheetName = sheetName;
        this.sheet = sheet;
        this.x = config.x ?? 0;
        this.y = config.y ?? 0;
        this.frame = config.frame ?? 0;
        this.scaleX = config.scaleX ?? 1;
        this.scaleY = config.scaleY ?? 1;
        this.anchorX = config.anchorX ?? 0;
        this.anchorY = config.anchorY ?? 0;
        this.rotation = config.rotation ?? 0;
        this.layer = config.layer ?? 0;
        this.visible = config.visible ?? true;
        this.playbackSpeed = config.playbackSpeed ?? 1;

        // Set up animations if provided
        if (config.animations) {
            const namedAnimations: Record<string, AnimationConfig> = {};
            for (const [name, animConfig] of Object.entries(config.animations)) {
                namedAnimations[name] = { ...animConfig, name };
            }
            this.player = new AnimationPlayer({
                animations: namedAnimations,
                defaultAnimation: config.defaultAnimation,
                autoPlay: !!config.defaultAnimation
            });
        }

        // Attach to entity if provided
        if (config.entity) {
            this.attachTo(config.entity);
        }
    }

    /** Attach sprite to an entity - x/y become offsets from entity position */
    attachTo(entity: Entity): this {
        this.attachedEntity = entity;
        return this;
    }

    /** Detach sprite from entity - x/y become absolute position */
    detach(): this {
        this.attachedEntity = null;
        return this;
    }

    /** Check if sprite is attached to an entity */
    isAttached(): boolean {
        return this.attachedEntity !== null;
    }

    /** Get the attached entity (if any) */
    getEntity(): Entity | null {
        return this.attachedEntity;
    }

    /** Get world position (entity position + offset, or just x/y if not attached) */
    getWorldPosition(): { x: number; y: number } {
        if (this.attachedEntity) {
            return {
                x: this.attachedEntity.position.x + this.x,
                y: this.attachedEntity.position.y + this.y
            };
        }
        return { x: this.x, y: this.y };
    }

    /** Set position (absolute if not attached, offset if attached) */
    setPosition(x: number, y: number): this {
        this.x = x;
        this.y = y;
        return this;
    }

    /** Set scale on X axis */
    setScaleX(scaleX: number): this {
        this.scaleX = scaleX;
        return this;
    }

    /** Set scale on Y axis */
    setScaleY(scaleY: number): this {
        this.scaleY = scaleY;
        return this;
    }

    /** Set both scales at once */
    setScale(scaleX: number, scaleY?: number): this {
        this.scaleX = scaleX;
        this.scaleY = scaleY ?? scaleX;
        return this;
    }

    /** Flip sprite horizontally (toggle) */
    flipX(): this {
        this.scaleX *= -1;
        return this;
    }

    /** Flip sprite vertically (toggle) */
    flipY(): this {
        this.scaleY *= -1;
        return this;
    }

    /** Set horizontal flip state */
    setFlipX(flipped: boolean): this {
        this.scaleX = Math.abs(this.scaleX) * (flipped ? -1 : 1);
        return this;
    }

    /** Set vertical flip state */
    setFlipY(flipped: boolean): this {
        this.scaleY = Math.abs(this.scaleY) * (flipped ? -1 : 1);
        return this;
    }

    /** Check if horizontally flipped */
    isFlippedX(): boolean {
        return this.scaleX < 0;
    }

    /** Check if vertically flipped */
    isFlippedY(): boolean {
        return this.scaleY < 0;
    }

    /** Set anchor point (0-1 range: 0=left/top, 0.5=center, 1=right/bottom) */
    setAnchor(x: number, y: number): this {
        this.anchorX = x;
        this.anchorY = y;
        return this;
    }

    /** Set rotation in radians */
    setRotation(rotation: number): this {
        this.rotation = rotation;
        return this;
    }

    /** Set layer (higher = rendered later/on top) */
    setLayer(layer: number): this {
        this.layer = layer;
        return this;
    }

    /** Set visibility */
    setVisible(visible: boolean): this {
        this.visible = visible;
        return this;
    }

    /** Set static frame (for non-animated sprites) */
    setFrame(frame: number): this {
        this.frame = frame;
        return this;
    }

    /** Check if sprite is animated */
    isAnimated(): boolean {
        return this.player !== null;
    }

    /** Play animation (only works for animated sprites) */
    play(name: string): this {
        this.player?.play(name);
        return this;
    }

    /** Pause animation */
    pause(): this {
        this.player?.pause();
        return this;
    }

    /** Resume animation */
    resume(): this {
        this.player?.resume();
        return this;
    }

    /** Stop animation */
    stop(): this {
        this.player?.stop();
        return this;
    }

    /** Get current animation name */
    getCurrentAnimation(): string | null {
        return this.player?.getCurrentAnimation() ?? null;
    }

    /** Check if animation is playing */
    isPlaying(): boolean {
        return this.player?.getIsPlaying() ?? false;
    }

    /** Get current frame index in sprite sheet */
    getCurrentFrameIndex(): number {
        return this.player?.getCurrentFrame() ?? this.frame;
    }

    /** Set animation playback speed (1.0 = normal, 2.0 = 2x speed, 0.5 = half speed) */
    setPlaybackSpeed(speed: number): this {
        this.playbackSpeed = speed;
        return this;
    }

    /** Get animation playback speed */
    getPlaybackSpeed(): number {
        return this.playbackSpeed;
    }

    /** Update animation (called by SpriteManager) */
    update(deltaMs: number): void {
        this.player?.update(deltaMs * this.playbackSpeed);
    }

    /** Render sprite (called by SpriteManager) */
    render(ctx: CanvasRenderingContext2D): void {
        if (!this.visible) return;

        const pos = this.getWorldPosition();
        const currentFrame = this.player?.getCurrentFrame() ?? this.frame;
        const rect = this.sheet.getFrame(currentFrame);
        const image = this.sheet.getImage();

        // Calculate scaled dimensions
        const scaledW = rect.w * Math.abs(this.scaleX);
        const scaledH = rect.h * Math.abs(this.scaleY);

        // Calculate anchor offset (where the position point is relative to sprite)
        const anchorOffsetX = scaledW * this.anchorX;
        const anchorOffsetY = scaledH * this.anchorY;

        const needsTransform = this.rotation !== 0 || this.scaleX !== 1 || this.scaleY !== 1;

        if (needsTransform) {
            ctx.save();
            // Translate to the anchor point position
            ctx.translate(pos.x, pos.y);
            ctx.rotate(this.rotation);
            ctx.scale(this.scaleX, this.scaleY);
            // Draw with anchor offset (in unscaled coordinates since we already scaled)
            ctx.drawImage(
                image,
                rect.x, rect.y, rect.w, rect.h,
                -rect.w * this.anchorX, -rect.h * this.anchorY, rect.w, rect.h
            );
            ctx.restore();
        } else {
            // Simple draw with anchor offset
            ctx.drawImage(
                image,
                rect.x, rect.y, rect.w, rect.h,
                pos.x - anchorOffsetX, pos.y - anchorOffsetY, rect.w, rect.h
            );
        }
    }

    /** Get frame dimensions */
    getFrameDimensions(): { width: number; height: number } {
        const currentFrame = this.player?.getCurrentFrame() ?? this.frame;
        return this.sheet.getFrameDimensions(currentFrame);
    }
}

// ============================================================================
// SPRITE MANAGER
// ============================================================================

export interface SheetLoadConfig {
    frameWidth: number;
    frameHeight: number;
    columns: number;
    rows: number;
}

export class SpriteManager {
    private sheets = new Map<string, SpriteSheet>();
    private sprites = new Map<string, ManagedSprite>();
    private loadingPromises = new Map<string, Promise<SpriteSheet>>();

    /** Load a sprite sheet (cached - won't reload if already loaded) */
    async loadSheet(
        name: string,
        url: string,
        gridConfig?: SheetLoadConfig,
        frames?: FrameDefinition[]
    ): Promise<SpriteSheet> {
        // Return cached sheet if already loaded
        const existing = this.sheets.get(name);
        if (existing) return existing;

        // Return existing promise if currently loading
        const loading = this.loadingPromises.get(name);
        if (loading) return loading;

        // Start loading
        const promise = loadSpriteSheet(name, url, gridConfig, frames);
        this.loadingPromises.set(name, promise);

        try {
            const sheet = await promise;
            this.sheets.set(name, sheet);
            this.loadingPromises.delete(name);
            return sheet;
        } catch (error) {
            this.loadingPromises.delete(name);
            throw error;
        }
    }

    /** Check if a sheet is loaded */
    hasSheet(name: string): boolean {
        return this.sheets.has(name);
    }

    /** Get a loaded sheet */
    getSheet(name: string): SpriteSheet | null {
        return this.sheets.get(name) ?? null;
    }

    /** Create a static sprite */
    createStatic(
        id: string,
        sheetName: string,
        config: Omit<ManagedSpriteConfig, 'animations' | 'defaultAnimation'> = {}
    ): ManagedSprite {
        const sheet = this.sheets.get(sheetName);
        if (!sheet) {
            throw new Error(`Sheet "${sheetName}" not loaded. Call loadSheet() first.`);
        }

        const sprite = new ManagedSprite(id, sheetName, sheet, config);
        this.sprites.set(id, sprite);
        return sprite;
    }

    /** Create an animated sprite */
    createAnimated(
        id: string,
        sheetName: string,
        animations: Record<string, Omit<AnimationConfig, 'name'>>,
        defaultAnimation?: string,
        config: Omit<ManagedSpriteConfig, 'animations' | 'defaultAnimation'> = {}
    ): ManagedSprite {
        const sheet = this.sheets.get(sheetName);
        if (!sheet) {
            throw new Error(`Sheet "${sheetName}" not loaded. Call loadSheet() first.`);
        }

        const sprite = new ManagedSprite(id, sheetName, sheet, {
            ...config,
            animations,
            defaultAnimation
        });
        this.sprites.set(id, sprite);
        return sprite;
    }

    /** Get a sprite by ID */
    get(id: string): ManagedSprite | null {
        return this.sprites.get(id) ?? null;
    }

    /** Check if a sprite exists */
    has(id: string): boolean {
        return this.sprites.has(id);
    }

    /** Remove a sprite */
    remove(id: string): boolean {
        return this.sprites.delete(id);
    }

    /** Get all sprites */
    getAll(): ManagedSprite[] {
        return Array.from(this.sprites.values());
    }

    /** Get sprites by layer */
    getByLayer(layer: number): ManagedSprite[] {
        return this.getAll().filter(s => s.layer === layer);
    }

    /** Get sprites attached to an entity */
    getByEntity(entity: Entity): ManagedSprite[] {
        return this.getAll().filter(s => s.getEntity() === entity);
    }

    /** Update all animated sprites */
    update(deltaMs: number): void {
        for (const sprite of this.sprites.values()) {
            sprite.update(deltaMs);
        }
    }

    /** Render all visible sprites sorted by layer */
    render(ctx: CanvasRenderingContext2D): void {
        const sorted = this.getAll()
            .filter(s => s.visible)
            .sort((a, b) => a.layer - b.layer);

        for (const sprite of sorted) {
            sprite.render(ctx);
        }
    }

    /** Clear all sprites (keeps sheets loaded) */
    clearSprites(): void {
        this.sprites.clear();
    }

    /** Clear everything (sheets and sprites) */
    clear(): void {
        this.sprites.clear();
        this.sheets.clear();
        this.loadingPromises.clear();
    }

    /** Get count of sprites */
    getSpriteCount(): number {
        return this.sprites.size;
    }

    /** Get count of loaded sheets */
    getSheetCount(): number {
        return this.sheets.size;
    }
}

// Singleton
let spriteManager: SpriteManager | null = null;
export const getSpriteManager = (): SpriteManager => spriteManager ?? (spriteManager = new SpriteManager());
export const destroySpriteManager = (): void => { spriteManager?.clear(); spriteManager = null; }
