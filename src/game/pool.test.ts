import { describe, it, expect, vi } from 'vitest';
import { Pool } from './pool';

describe('Pool (Game P1 — object pooling)', () => {
  it('acquire() calls the factory when the pool is empty', () => {
    const factory = vi.fn(() => ({ value: 0 }));
    const pool = new Pool({ factory });

    const item = pool.acquire();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(item).toEqual({ value: 0 });
  });

  it('release() returns the same instance to a subsequent acquire() instead of creating a new one', () => {
    const factory = vi.fn(() => ({ value: 0 }));
    const pool = new Pool({ factory });

    const first = pool.acquire();
    pool.release(first);
    const second = pool.acquire();

    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('release() invokes the reset callback before returning the item to the pool', () => {
    const factory = vi.fn(() => ({ value: 0 }));
    const reset = vi.fn((item: { value: number }) => { item.value = -1; });
    const pool = new Pool({ factory, reset });

    const item = pool.acquire();
    item.value = 42;
    pool.release(item);

    expect(reset).toHaveBeenCalledWith(item);
    expect(item.value).toBe(-1);
  });

  it('prewarm(n) pre-populates n items so subsequent acquire() calls skip the factory', () => {
    const factory = vi.fn(() => ({ value: 0 }));
    const pool = new Pool({ factory });

    pool.prewarm(3);
    expect(factory).toHaveBeenCalledTimes(3);
    expect(pool.getAvailableCount()).toBe(3);

    pool.acquire();
    pool.acquire();
    pool.acquire();

    expect(factory).toHaveBeenCalledTimes(3);
    expect(pool.getAvailableCount()).toBe(0);
  });

  it('maxSize caps the idle list — items released past the cap are discarded', () => {
    const factory = vi.fn(() => ({ value: 0 }));
    const pool = new Pool({ factory, maxSize: 1 });

    const a = pool.acquire();
    const b = pool.acquire();
    expect(factory).toHaveBeenCalledTimes(2);

    pool.release(a);
    pool.release(b); // idle list already at maxSize (1) — this one is discarded

    expect(pool.getAvailableCount()).toBe(1);

    // Two more acquires: one reuses `a` (or `b`, whichever was kept), the other must
    // hit the factory again since the discarded item is gone.
    pool.acquire();
    pool.acquire();
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('getActiveCount() and getTotalCount() track acquired vs. total items', () => {
    const factory = vi.fn(() => ({ value: 0 }));
    const pool = new Pool({ factory });

    const a = pool.acquire();
    pool.acquire();
    expect(pool.getActiveCount()).toBe(2);
    expect(pool.getTotalCount()).toBe(2);

    pool.release(a);
    expect(pool.getActiveCount()).toBe(1);
    expect(pool.getTotalCount()).toBe(2);
  });
});
