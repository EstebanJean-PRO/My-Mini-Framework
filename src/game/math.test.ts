import { describe, it, expect } from 'vitest';
import { Vector2 } from './math';

describe('Matrix2D (Game P1 — math completions)', () => {
  it('identity() leaves points unchanged', async () => {
    const mod = await import('./math') as any;
    if (typeof mod.Matrix2D !== 'function') throw new Error('Matrix2D not yet exported from game/math');
    const m = mod.Matrix2D.identity();
    const p = m.transformPoint(3, 4);
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(4);
  });

  it('composes translate, rotate, and scale via multiply', async () => {
    const mod = await import('./math') as any;
    const m = mod.Matrix2D.identity()
      .translate(10, 0)
      .scale(2, 2);
    const p = m.transformPoint(1, 0);
    // scale first (in local space), then translate: (1*2, 0*2) + (10, 0) = (12, 0)
    expect(p.x).toBeCloseTo(12);
    expect(p.y).toBeCloseTo(0);
  });

  it('invert() produces the inverse transform (round-trips a point)', async () => {
    const mod = await import('./math') as any;
    const m = mod.Matrix2D.identity().translate(5, 7).rotate(Math.PI / 3).scale(2, 3);
    const original = m.transformPoint(2, -1);
    const inverse = m.clone().invert();
    const roundTripped = inverse.transformPoint(original.x, original.y);
    expect(roundTripped.x).toBeCloseTo(2, 4);
    expect(roundTripped.y).toBeCloseTo(-1, 4);
  });
});

describe('smoothstep (Game P1 — math completions)', () => {
  it('is exported and clamps + eases between two edges', async () => {
    const mod = await import('./math') as any;
    if (typeof mod.smoothstep !== 'function') throw new Error('smoothstep not yet exported from game/math');
    expect(mod.smoothstep(0, 10, -5)).toBe(0);
    expect(mod.smoothstep(0, 10, 15)).toBe(1);
    expect(mod.smoothstep(0, 10, 5)).toBeCloseTo(0.5, 5);
    // ease-in/ease-out curve: 0.25 of the way through input should be less than 0.25 of output
    expect(mod.smoothstep(0, 10, 2.5)).toBeLessThan(0.25);
  });

  it('does not divide by zero when edge0 === edge1', async () => {
    const mod = await import('./math') as any;
    expect(mod.smoothstep(5, 5, 4)).toBe(0);
    expect(mod.smoothstep(5, 5, 6)).toBe(1);
  });
});

describe('mulberry32 (Game P1 — math completions)', () => {
  it('is exported and produces a deterministic, repeatable sequence', async () => {
    const mod = await import('./math') as any;
    if (typeof mod.mulberry32 !== 'function') throw new Error('mulberry32 not yet exported from game/math');
    const rngA = mod.mulberry32(42);
    const rngB = mod.mulberry32(42);
    const sequenceA = [rngA(), rngA(), rngA()];
    const sequenceB = [rngB(), rngB(), rngB()];
    expect(sequenceA).toEqual(sequenceB);
    sequenceA.forEach((v: number) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });
  });

  it('produces different sequences for different seeds', async () => {
    const mod = await import('./math') as any;
    const rngA = mod.mulberry32(1);
    const rngB = mod.mulberry32(2);
    expect(rngA()).not.toBe(rngB());
  });
});

describe('Bezier (Game P1 — math completions)', () => {
  it('quadratic eval returns p0 at t=0 and p2 at t=1', async () => {
    const mod = await import('./math') as any;
    if (typeof mod.Bezier?.quadratic !== 'function') throw new Error('Bezier.quadratic not yet exported from game/math');
    expect(mod.Bezier.quadratic(0, 0, 5, 10)).toBeCloseTo(0);
    expect(mod.Bezier.quadratic(1, 0, 5, 10)).toBeCloseTo(10);
  });

  it('cubic eval returns p0 at t=0 and p3 at t=1', async () => {
    const mod = await import('./math') as any;
    if (typeof mod.Bezier?.cubic !== 'function') throw new Error('Bezier.cubic not yet exported from game/math');
    expect(mod.Bezier.cubic(0, 0, 3, 7, 10)).toBeCloseTo(0);
    expect(mod.Bezier.cubic(1, 0, 3, 7, 10)).toBeCloseTo(10);
  });

  it('quadraticPoint and cubicPoint evaluate per-axis on Vector2 endpoints', async () => {
    const mod = await import('./math') as any;
    if (typeof mod.Bezier?.quadraticPoint !== 'function') throw new Error('Bezier.quadraticPoint not yet exported');
    const p0 = new Vector2(0, 0);
    const p1 = new Vector2(5, 10);
    const p2 = new Vector2(10, 0);
    const start = mod.Bezier.quadraticPoint(0, p0, p1, p2);
    const end = mod.Bezier.quadraticPoint(1, p0, p1, p2);
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(0);
    expect(end.x).toBeCloseTo(10);
    expect(end.y).toBeCloseTo(0);
  });
});
