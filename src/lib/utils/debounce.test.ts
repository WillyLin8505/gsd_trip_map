import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("invokes only once after rapid calls, with the latest args", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d("a");
    d("b");
    d("c");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });

  it("fires again for a call after the wait window", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d("x");
    vi.advanceTimersByTime(300);
    d("y");
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("cancel() drops a pending invocation", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d("z");
    d.cancel();
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
  });
});
