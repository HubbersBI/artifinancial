import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Recharts measures its container; jsdom reports zero, so charts render nothing
// without an explicit size. Give every element a deterministic box.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 640 });
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 320 });

// jsdom does not implement scrollIntoView; the chat panel calls it on new messages.
Element.prototype.scrollIntoView = () => {};
