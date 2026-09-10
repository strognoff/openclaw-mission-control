import { describe, it, expect } from "vitest";
import { createBoundedQueue } from "./queue.js";

describe("createBoundedQueue", () => {
  it("starts empty", () => {
    const q = createBoundedQueue<number>(3);
    expect(q.size()).toBe(0);
    expect(q.capacity()).toBe(3);
  });

  it("pushes items under the cap", () => {
    const q = createBoundedQueue<number>(3);
    expect(q.push(1)).toEqual({ dropped: 0 });
    expect(q.push(2)).toEqual({ dropped: 0 });
    expect(q.size()).toBe(2);
  });

  it("drops oldest on overflow", () => {
    const q = createBoundedQueue<number>(3);
    q.push(1);
    q.push(2);
    q.push(3);
    expect(q.push(4)).toEqual({ dropped: 1 });
    expect(q.size()).toBe(3);
    expect(q.drain()).toEqual([2, 3, 4]);
  });

  it("drops multiple when batch overflows", () => {
    const q = createBoundedQueue<number>(3);
    for (let i = 1; i <= 5; i++) q.push(i);
    expect(q.size()).toBe(3);
    expect(q.drain()).toEqual([3, 4, 5]);
  });

  it("drains all by default", () => {
    const q = createBoundedQueue<number>(10);
    q.push(1);
    q.push(2);
    expect(q.drain()).toEqual([1, 2]);
    expect(q.size()).toBe(0);
  });

  it("drains at most `max` items", () => {
    const q = createBoundedQueue<number>(10);
    q.push(1);
    q.push(2);
    q.push(3);
    expect(q.drain(2)).toEqual([1, 2]);
    expect(q.size()).toBe(1);
    expect(q.drain()).toEqual([3]);
  });

  it("handles capacity=1", () => {
    const q = createBoundedQueue<number>(1);
    q.push(1);
    expect(q.push(2)).toEqual({ dropped: 1 });
    expect(q.drain()).toEqual([2]);
  });

  it("coerces bad capacity to 1", () => {
    const q = createBoundedQueue<number>(0);
    expect(q.capacity()).toBe(1);
    q.push(1);
    expect(q.size()).toBe(1);
  });

  it("clear empties the queue", () => {
    const q = createBoundedQueue<number>(5);
    q.push(1);
    q.push(2);
    q.clear();
    expect(q.size()).toBe(0);
    expect(q.drain()).toEqual([]);
  });
});