/**
 * Game Math Utilities - 2D Vector operations and collision detection
 */

import { atan2, cos, sin, abs, min, max, random, floor, hypot } from './utils';

export class Vector2 {
    constructor(public x: number = 0, public y: number = 0) {}

    clone(): Vector2 { return new Vector2(this.x, this.y); }
    set(x: number, y: number): this { this.x = x; this.y = y; return this; }
    copy(v: Vector2): this { return this.set(v.x, v.y); }

    add(v: Vector2): this { this.x += v.x; this.y += v.y; return this; }
    subtract(v: Vector2): this { this.x -= v.x; this.y -= v.y; return this; }
    multiply(n: number): this { this.x *= n; this.y *= n; return this; }
    divide(n: number): this { if (n !== 0) { this.x /= n; this.y /= n; } return this; }

    magnitude(): number { return hypot(this.x, this.y); }
    magnitudeSquared(): number { return this.x * this.x + this.y * this.y; }

    normalize(): this {
        const mag = this.magnitude();
        return mag > 0 ? this.divide(mag) : this;
    }

    dot(v: Vector2): number { return this.x * v.x + this.y * v.y; }

    distanceTo(v: Vector2): number { return hypot(this.x - v.x, this.y - v.y); }

    angle(): number { return atan2(this.y, this.x); }
    angleTo(v: Vector2): number { return atan2(v.y - this.y, v.x - this.x); }

    rotate(angle: number): this {
        const c = cos(angle), s = sin(angle);
        const x = this.x * c - this.y * s;
        const y = this.x * s + this.y * c;
        return this.set(x, y);
    }

    limit(maxMag: number): this {
        const magSq = this.magnitudeSquared();
        if (magSq > maxMag * maxMag) this.normalize().multiply(maxMag);
        return this;
    }

    lerp(v: Vector2, t: number): this {
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        return this;
    }

    equals(v: Vector2, epsilon = 0.0001): boolean {
        return abs(this.x - v.x) < epsilon && abs(this.y - v.y) < epsilon;
    }

    toString(): string { return `Vector2(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`; }

    static fromAngle(angle: number, length = 1): Vector2 {
        return new Vector2(cos(angle) * length, sin(angle) * length);
    }

    static zero(): Vector2 { return new Vector2(0, 0); }
    static one(): Vector2 { return new Vector2(1, 1); }

    static add(v1: Vector2, v2: Vector2): Vector2 { return new Vector2(v1.x + v2.x, v1.y + v2.y); }
    static subtract(v1: Vector2, v2: Vector2): Vector2 { return new Vector2(v1.x - v2.x, v1.y - v2.y); }
    static distance(v1: Vector2, v2: Vector2): number { return v1.distanceTo(v2); }
    static lerp(v1: Vector2, v2: Vector2, t: number): Vector2 {
        return new Vector2(v1.x + (v2.x - v1.x) * t, v1.y + (v2.y - v1.y) * t);
    }
}

// Math utilities
export const clamp = (val: number, mn: number, mx: number): number => min(max(val, mn), mx);
export const lerp = (start: number, end: number, t: number): number => start + (end - start) * t;
export const map = (val: number, inMin: number, inMax: number, outMin: number, outMax: number): number =>
    ((val - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
export const degToRad = (deg: number): number => deg * (Math.PI / 180);
export const radToDeg = (rad: number): number => rad * (180 / Math.PI);
export const randomRange = (mn: number, mx: number): number => random() * (mx - mn) + mn;
export const randomInt = (mn: number, mx: number): number => floor(random() * (mx - mn + 1)) + mn;

// Collision detection
export interface AABB { x: number; y: number; width: number; height: number; }
export interface Circle { x: number; y: number; radius: number; }

export const aabbCollision = (a: AABB, b: AABB): boolean =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export const circleCollision = (a: Circle, b: Circle): boolean => {
    const dx = a.x - b.x, dy = a.y - b.y;
    const radiusSum = a.radius + b.radius;
    return dx * dx + dy * dy <= radiusSum * radiusSum;
};

export const circleAABBCollision = (circle: Circle, box: AABB): boolean => {
    const closestX = clamp(circle.x, box.x, box.x + box.width);
    const closestY = clamp(circle.y, box.y, box.y + box.height);
    const dx = circle.x - closestX, dy = circle.y - closestY;
    return dx * dx + dy * dy <= circle.radius * circle.radius;
};

export const pointInAABB = (x: number, y: number, box: AABB): boolean =>
    x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;

export const pointInCircle = (x: number, y: number, circle: Circle): boolean => {
    const dx = x - circle.x, dy = y - circle.y;
    return dx * dx + dy * dy <= circle.radius * circle.radius;
};
