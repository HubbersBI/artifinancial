import { describe, expect, it } from "vitest";
import { clockTime, money, percent, quantity, signedMoney, toneClass } from "../format";

describe("format", () => {
  it("groups money and always shows two decimals", () => {
    expect(money(10000)).toBe("10,000.00");
    expect(money(190.5)).toBe("190.50");
  });

  it("renders missing numbers as a dash", () => {
    expect(money(null)).toBe("--");
    expect(percent(undefined)).toBe("--");
    expect(signedMoney(null)).toBe("--");
  });

  it("signs money and percentages", () => {
    expect(signedMoney(7)).toBe("+7.00");
    expect(signedMoney(-7)).toBe("-7.00");
    expect(percent(0.042)).toBe("+0.04%");
    expect(percent(-1.5)).toBe("-1.50%");
  });

  it("keeps whole quantities whole and trims fractional ones", () => {
    expect(quantity(10)).toBe("10");
    expect(quantity(0.5)).toBe("0.5");
  });

  it("tones green above zero and red below", () => {
    expect(toneClass(1)).toBe("text-up");
    expect(toneClass(-1)).toBe("text-down");
    expect(toneClass(0)).toBe("text-ink-dim");
  });

  it("formats unix seconds and ISO strings alike", () => {
    expect(clockTime("not-a-date")).toBe("--:--:--");
    expect(clockTime(undefined)).toBe("--:--:--");
    expect(clockTime(1756000000)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
