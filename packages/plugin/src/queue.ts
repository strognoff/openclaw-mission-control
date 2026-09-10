/**
 * Bounded FIFO event queue.
 *
 * Mission Control's promise is: monitoring is secondary to the actual OpenClaw
 * work. The queue caps memory; on overflow we drop OLDEST items first so the
 * most recent activity is still represented.
 *
 * Never throws.
 */

export interface BoundedQueue<T> {
  push(item: T): { dropped: number };
  drain(max?: number): T[];
  size(): number;
  capacity(): number;
  clear(): void;
}

export function createBoundedQueue<T>(capacity: number): BoundedQueue<T> {
  if (!Number.isFinite(capacity) || capacity < 1) capacity = 1;
  let buffer: T[] = [];

  function push(item: T): { dropped: number } {
    let dropped = 0;
    if (buffer.length >= capacity) {
      dropped = buffer.length - capacity + 1;
      // drop-oldest: remove `dropped` items from the head.
      buffer = buffer.slice(dropped);
    }
    buffer.push(item);
    return { dropped };
  }

  function drain(max = Infinity): T[] {
    if (buffer.length === 0) return [];
    const take = Math.min(buffer.length, max);
    const out = buffer.slice(0, take);
    buffer = buffer.slice(take);
    return out;
  }

  function size(): number {
    return buffer.length;
  }

  function cap(): number {
    return capacity;
  }

  function clear(): void {
    buffer = [];
  }

  return { push, drain, size, capacity: cap, clear };
}