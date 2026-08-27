"use client";

import { useEffect, useRef, useState } from "react";
import { isStatic } from "@/lib/api";
import { getEngine } from "@/lib/engine";
import type { ConnectionState, PriceMap, SeriesPoint } from "@/lib/types";

/** Points kept per ticker. At ~500ms a tick this is roughly five minutes. */
const MAX_POINTS = 600;

/**
 * Retries tolerated before the dot goes red. EventSource retries every second
 * per the stream's `retry: 1000`, so this is about three seconds of silence.
 */
const RETRIES_BEFORE_RED = 3;

export interface PriceStream {
  prices: PriceMap;
  /** Accumulated since page load; empty until the first tick arrives. */
  series: Record<string, SeriesPoint[]>;
  status: ConnectionState;
}

/**
 * Subscribes to /api/stream/prices. Each event is one JSON object keyed by
 * symbol carrying every tracked ticker, so a single message updates all rows.
 * EventSource handles retries itself.
 */
export function usePriceStream(url = "/api/stream/prices"): PriceStream {
  const [prices, setPrices] = useState<PriceMap>({});
  const [series, setSeries] = useState<Record<string, SeriesPoint[]>>({});
  const [status, setStatus] = useState<ConnectionState>("reconnecting");
  const seriesRef = useRef<Record<string, SeriesPoint[]>>({});
  const failures = useRef(0);

  useEffect(() => {
    // With no backend the engine ticks in this tab. There is no connection to
    // lose, so the status dot is green from the first frame and stays there -
    // reporting "reconnecting" would be theatre about a network that is absent.
    if (isStatic) {
      const off = getEngine().subscribe((payload) => {
        setStatus("connected");
        setPrices(payload);
        appendPoints(seriesRef.current, payload);
        setSeries({ ...seriesRef.current });
      });
      return off;
    }

    const source = new EventSource(url);

    source.onopen = () => {
      failures.current = 0;
      setStatus("connected");
    };

    source.onmessage = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as PriceMap;
      failures.current = 0;
      setStatus("connected");
      setPrices(payload);
      appendPoints(seriesRef.current, payload);
      setSeries({ ...seriesRef.current });
    };

    source.onerror = () => {
      failures.current += 1;
      const givenUp =
        source.readyState === EventSource.CLOSED || failures.current >= RETRIES_BEFORE_RED;
      setStatus(givenUp ? "disconnected" : "reconnecting");
    };

    return () => source.close();
  }, [url]);

  return { prices, series, status };
}

/** Appends one point per ticker, skipping repeats of the same timestamp. */
function appendPoints(store: Record<string, SeriesPoint[]>, payload: PriceMap): void {
  for (const [ticker, update] of Object.entries(payload)) {
    if (typeof update?.price !== "number") continue;
    const existing = store[ticker] ?? [];
    const last = existing[existing.length - 1];
    if (last && last.t === update.timestamp) continue;
    const next = [...existing, { t: update.timestamp, price: update.price }];
    store[ticker] = next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
  }
}
