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
// BUG (Game P2): divides by (inMax - inMin); returns NaN or ±Infinity when inMin === inMax,
// silently corrupting any downstream position, scale, or lerp.
// SOLUTION: guard with `if (inMax === inMin) return outMin;` — outMin is the conventional
// result for a degenerate (zero-width) input range.
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

// Smooth interpolation (Hermite), clamped to [0, 1]
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
    if (edge1 === edge0) return x < edge0 ? 0 : 1;
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
};

// Seeded PRNG (mulberry32) — deterministic, repeatable sequence of doubles in [0, 1)
export function mulberry32(seed: number): () => number {
    let a = seed;
    return (): number => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const Bezier = {
    quadratic(t: number, p0: number, p1: number, p2: number): number {
        const u = 1 - t;
        return u * u * p0 + 2 * u * t * p1 + t * t * p2;
    },
    cubic(t: number, p0: number, p1: number, p2: number, p3: number): number {
        const u = 1 - t;
        return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    },
    quadraticPoint(t: number, p0: Vector2, p1: Vector2, p2: Vector2): Vector2 {
        return new Vector2(
            Bezier.quadratic(t, p0.x, p1.x, p2.x),
            Bezier.quadratic(t, p0.y, p1.y, p2.y)
        );
    },
    cubicPoint(t: number, p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2): Vector2 {
        return new Vector2(
            Bezier.cubic(t, p0.x, p1.x, p2.x, p3.x),
            Bezier.cubic(t, p0.y, p1.y, p2.y, p3.y)
        );
    },
};

// 2D affine transform — canvas setTransform(a, b, c, d, e, f) convention
export class Matrix2D {
    constructor(
        public a = 1, public b = 0,
        public c = 0, public d = 1,
        public tx = 0, public ty = 0
    ) {}

    static identity(): Matrix2D { return new Matrix2D(); }
    static translation(x: number, y: number): Matrix2D { return new Matrix2D(1, 0, 0, 1, x, y); }
    static rotation(angle: number): Matrix2D {
        const c = cos(angle), s = sin(angle);
        return new Matrix2D(c, s, -s, c, 0, 0);
    }
    static scaling(sx: number, sy: number = sx): Matrix2D { return new Matrix2D(sx, 0, 0, sy, 0, 0); }

    clone(): Matrix2D { return new Matrix2D(this.a, this.b, this.c, this.d, this.tx, this.ty); }

    multiply(m: Matrix2D): this {
        const a = this.a * m.a + this.c * m.b;
        const b = this.b * m.a + this.d * m.b;
        const c = this.a * m.c + this.c * m.d;
        const d = this.b * m.c + this.d * m.d;
        const tx = this.a * m.tx + this.c * m.ty + this.tx;
        const ty = this.b * m.tx + this.d * m.ty + this.ty;
        this.a = a; this.b = b; this.c = c; this.d = d; this.tx = tx; this.ty = ty;
        return this;
    }

    translate(x: number, y: number): this { return this.multiply(Matrix2D.translation(x, y)); }
    rotate(angle: number): this { return this.multiply(Matrix2D.rotation(angle)); }
    scale(sx: number, sy: number = sx): this { return this.multiply(Matrix2D.scaling(sx, sy)); }

    transformPoint(x: number, y: number): Vector2 {
        return new Vector2(this.a * x + this.c * y + this.tx, this.b * x + this.d * y + this.ty);
    }

    invert(): this {
        const det = this.a * this.d - this.b * this.c;
        if (det === 0) return this;
        const invDet = 1 / det;
        const a = this.d * invDet;
        const b = -this.b * invDet;
        const c = -this.c * invDet;
        const d = this.a * invDet;
        const tx = -(a * this.tx + c * this.ty);
        const ty = -(b * this.tx + d * this.ty);
        this.a = a; this.b = b; this.c = c; this.d = d; this.tx = tx; this.ty = ty;
        return this;
    }

    toArray(): [number, number, number, number, number, number] {
        return [this.a, this.b, this.c, this.d, this.tx, this.ty];
    }
}
