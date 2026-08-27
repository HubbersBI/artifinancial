import { describe, expect, it } from "vitest";
import { treemap } from "../treemap";

describe("treemap", () => {
  it("returns nothing for an empty or zero-value set", () => {
    expect(treemap([])).toEqual([]);
    expect(treemap([{ key: "AAPL", value: 0 }])).toEqual([]);
  });

  it("gives a single item the whole area", () => {
    expect(treemap([{ key: "AAPL", value: 5 }])).toEqual([
      { key: "AAPL", x: 0, y: 0, w: 100, h: 100 },
    ]);
  });

  it("sizes rectangles in proportion to value", () => {
    const rects = treemap([
      { key: "BIG", value: 75 },
      { key: "SMALL", value: 25 },
    ]);
    const area = (k: string) => {
      const r = rects.find((x) => x.key === k)!;
      return r.w * r.h;
    };
    expect(area("BIG") / area("SMALL")).toBeCloseTo(3, 5);
  });

  it("tiles the full area without overflowing it", () => {
    const rects = treemap([
      { key: "A", value: 40 },
      { key: "B", value: 30 },
      { key: "C", value: 20 },
      { key: "D", value: 10 },
    ]);
    expect(rects).toHaveLength(4);
    const total = rects.reduce((sum, r) => sum + r.w * r.h, 0);
    expect(total).toBeCloseTo(10000, 3);
    for (const r of rects) {
      expect(r.x + r.w).toBeLessThanOrEqual(100.001);
      expect(r.y + r.h).toBeLessThanOrEqual(100.001);
    }
  });

  it("drops negative values rather than inverting the layout", () => {
    const rects = treemap([
      { key: "A", value: 10 },
      { key: "B", value: -5 },
    ]);
    expect(rects.map((r) => r.key)).toEqual(["A"]);
  });
});
