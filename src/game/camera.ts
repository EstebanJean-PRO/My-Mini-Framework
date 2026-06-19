import { Vector2, Matrix2D, clamp, type AABB } from './math';
import { random as defaultRandom } from './utils';

export interface DeadzoneConfig {
    width: number;
    height: number;
}

export interface ShakeConfig {
    maxOffset?: number;
    maxRotation?: number;
    decay?: number;
    exponent?: number;
    random?: () => number;
    noise?: (t: number) => number;
    noiseFrequency?: number;
}

export interface CameraOptions {
    viewportWidth: number;
    viewportHeight: number;
    position?: Vector2;
    zoom?: number;
    worldBounds?: AABB;
    deadzone?: DeadzoneConfig;
    shake?: ShakeConfig;
}

export class Camera {
    position: Vector2;
    zoom: number;
    viewportWidth: number;
    viewportHeight: number;

    private worldBounds?: AABB;
    private deadzone: DeadzoneConfig;
    private trauma = 0;
    private shakeTime = 0;
    private shakeOffset = new Vector2();
    private shakeRotation = 0;
    private readonly shakeDecay: number;
    private readonly shakeMaxOffset: number;
    private readonly shakeMaxRotation: number;
    private readonly shakeExponent: number;
    private readonly shakeRandom: () => number;
    private readonly shakeNoise?: (t: number) => number;
    private readonly shakeNoiseFrequency: number;

    constructor(options: CameraOptions) {
        this.viewportWidth = options.viewportWidth;
        this.viewportHeight = options.viewportHeight;
        this.position = options.position?.clone() ?? new Vector2();
        this.zoom = options.zoom ?? 1;
        this.worldBounds = options.worldBounds;
        this.deadzone = options.deadzone ?? { width: 0, height: 0 };

        const shake = options.shake ?? {};
        this.shakeDecay = shake.decay ?? 1;
        this.shakeMaxOffset = shake.maxOffset ?? 16;
        this.shakeMaxRotation = shake.maxRotation ?? 0;
        this.shakeExponent = shake.exponent ?? 2;
        this.shakeRandom = shake.random ?? defaultRandom;
        this.shakeNoise = shake.noise;
        this.shakeNoiseFrequency = shake.noiseFrequency ?? 1;

        this.clampToBounds();
    }

    // ---- Projection ----
    getViewMatrix(): Matrix2D {
        return Matrix2D.identity()
            .translate(this.viewportWidth / 2 + this.shakeOffset.x, this.viewportHeight / 2 + this.shakeOffset.y)
            .rotate(this.shakeRotation)
            .scale(this.zoom, this.zoom)
            .translate(-this.position.x, -this.position.y);
    }
    worldToScreen(point: Vector2): Vector2 {
        return this.getViewMatrix().transformPoint(point.x, point.y);
    }
    screenToWorld(point: Vector2): Vector2 {
        return this.getViewMatrix().invert().transformPoint(point.x, point.y);
    }

    // ---- Follow ----
    setDeadzone(width: number, height: number): void { this.deadzone = { width, height }; }
    follow(target: Vector2, lerpFactor = 0.1): void {
        const dx = target.x - this.position.x;
        const dy = target.y - this.position.y;
        const halfW = this.deadzone.width / 2;
        const halfH = this.deadzone.height / 2;

        let desiredX = this.position.x;
        let desiredY = this.position.y;
        if (Math.abs(dx) > halfW) desiredX = target.x - Math.sign(dx) * halfW;
        if (Math.abs(dy) > halfH) desiredY = target.y - Math.sign(dy) * halfH;

        this.position.x += (desiredX - this.position.x) * lerpFactor;
        this.position.y += (desiredY - this.position.y) * lerpFactor;
        this.clampToBounds();
    }

    // ---- Bounds ----
    setWorldBounds(bounds: AABB): void {
        this.worldBounds = bounds;
        this.clampToBounds();
    }
    private clampToBounds(): void {
        if (!this.worldBounds) return;
        const halfVW = (this.viewportWidth / 2) / this.zoom;
        const halfVH = (this.viewportHeight / 2) / this.zoom;
        const minX = this.worldBounds.x + halfVW;
        const maxX = this.worldBounds.x + this.worldBounds.width - halfVW;
        const minY = this.worldBounds.y + halfVH;
        const maxY = this.worldBounds.y + this.worldBounds.height - halfVH;
        this.position.x = clamp(this.position.x, Math.min(minX, maxX), Math.max(minX, maxX));
        this.position.y = clamp(this.position.y, Math.min(minY, maxY), Math.max(minY, maxY));
    }

    // ---- Shake ----
    addTrauma(amount: number): void { this.trauma = clamp(this.trauma + amount, 0, 1); }
    setTrauma(value: number): void { this.trauma = clamp(value, 0, 1); }
    getTrauma(): number { return this.trauma; }
    getShakeOffset(): Vector2 { return this.shakeOffset.clone(); }
    getShakeRotation(): number { return this.shakeRotation; }
    update(deltaMs: number): void {
        if (this.trauma > 0) {
            this.trauma = clamp(this.trauma - this.shakeDecay * (deltaMs / 1000), 0, 1);
        }
        this.shakeTime += deltaMs / 1000;

        const intensity = this.trauma ** this.shakeExponent;
        const [sampleX, sampleY, sampleRot] = this.shakeNoise
            ? [
                this.shakeNoise(this.shakeTime * this.shakeNoiseFrequency),
                this.shakeNoise(this.shakeTime * this.shakeNoiseFrequency + 1000),
                this.shakeNoise(this.shakeTime * this.shakeNoiseFrequency + 2000),
            ]
            : [this.shakeRandom() * 2 - 1, this.shakeRandom() * 2 - 1, this.shakeRandom() * 2 - 1];

        this.shakeOffset.x = this.shakeMaxOffset * intensity * sampleX;
        this.shakeOffset.y = this.shakeMaxOffset * intensity * sampleY;
        this.shakeRotation = this.shakeMaxRotation * intensity * sampleRot;
    }

    // ---- Zoom ----
    setZoom(zoom: number): void { this.zoom = Math.max(0.0001, zoom); this.clampToBounds(); }
    getZoom(): number { return this.zoom; }
    zoomAt(screenPoint: Vector2, newZoom: number): void {
        const worldBefore = this.screenToWorld(screenPoint);
        this.zoom = Math.max(0.0001, newZoom);
        const worldAfter = this.screenToWorld(screenPoint);
        this.position.x += worldBefore.x - worldAfter.x;
        this.position.y += worldBefore.y - worldAfter.y;
        this.clampToBounds();
    }
}
