import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePriceStream } from "../usePriceStream";

/** Minimal EventSource stand-in; jsdom has none. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CLOSED = 2;

  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }
}

function quote(ticker: string, price: number, timestamp: number) {
  return {
    ticker,
    price,
    previous_price: price,
    timestamp,
    change: 0,
    change_percent: 0,
    direction: "flat" as const,
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

describe("usePriceStream", () => {
  it("starts as reconnecting and connects on open", () => {
    const { result } = renderHook(() => usePriceStream());
    expect(result.current.status).toBe("reconnecting");
    act(() => FakeEventSource.instances[0].onopen?.());
    expect(result.current.status).toBe("connected");
  });

  it("reads every ticker out of one keyed event", () => {
    const { result } = renderHook(() => usePriceStream());
    act(() =>
      FakeEventSource.instances[0].emit({
        AAPL: quote("AAPL", 190.5, 1),
        GOOGL: quote("GOOGL", 175.2, 1),
      }),
    );
    expect(Object.keys(result.current.prices)).toEqual(["AAPL", "GOOGL"]);
    expect(result.current.prices.GOOGL.price).toBe(175.2);
  });

  it("accumulates a series per ticker across events", () => {
    const { result } = renderHook(() => usePriceStream());
    const source = FakeEventSource.instances[0];
    act(() => source.emit({ AAPL: quote("AAPL", 190, 1) }));
    act(() => source.emit({ AAPL: quote("AAPL", 191, 2) }));
    expect(result.current.series.AAPL).toEqual([
      { t: 1, price: 190 },
      { t: 2, price: 191 },
    ]);
  });

  it("ignores a repeated timestamp", () => {
    const { result } = renderHook(() => usePriceStream());
    const source = FakeEventSource.instances[0];
    act(() => source.emit({ AAPL: quote("AAPL", 190, 1) }));
    act(() => source.emit({ AAPL: quote("AAPL", 190, 1) }));
    expect(result.current.series.AAPL).toHaveLength(1);
  });

  it("reports reconnecting on a first failure and red once retries keep failing", () => {
    const { result } = renderHook(() => usePriceStream());
    const source = FakeEventSource.instances[0];
    act(() => source.onerror?.());
    expect(result.current.status).toBe("reconnecting");
    act(() => source.onerror?.());
    expect(result.current.status).toBe("reconnecting");
    act(() => source.onerror?.());
    expect(result.current.status).toBe("disconnected");
  });

  it("goes red immediately when the browser closes the stream for good", () => {
    const { result } = renderHook(() => usePriceStream());
    const source = FakeEventSource.instances[0];
    source.readyState = FakeEventSource.CLOSED;
    act(() => source.onerror?.());
    expect(result.current.status).toBe("disconnected");
  });

  it("clears the failure count once a message arrives again", () => {
    const { result } = renderHook(() => usePriceStream());
    const source = FakeEventSource.instances[0];
    act(() => source.onerror?.());
    act(() => source.onerror?.());
    act(() => source.emit({ AAPL: quote("AAPL", 190, 1) }));
    expect(result.current.status).toBe("connected");
    act(() => source.onerror?.());
    expect(result.current.status).toBe("reconnecting");
  });

  it("closes the stream on unmount", () => {
    const { unmount } = renderHook(() => usePriceStream());
    unmount();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});
