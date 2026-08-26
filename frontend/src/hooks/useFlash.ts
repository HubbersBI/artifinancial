"use client";

import { useEffect, useRef, useState } from "react";

export interface Flash {
  /** "flash-up" | "flash-down" | "" — apply to the cell that shows the price. */
  className: string;
  /** Changes on every flash; use as a React key so the animation restarts. */
  nonce: number;
}

const FLASH_MS = 500;

/** Flashes green on an uptick and red on a downtick, clearing after ~500ms. */
export function useFlash(price: number | null | undefined): Flash {
  const previous = useRef(price);
  const [flash, setFlash] = useState<Flash>({ className: "", nonce: 0 });

  useEffect(() => {
    const before = previous.current;
    previous.current = price;
    if (price === null || price === undefined || before === null || before === undefined) return;
    if (price === before) return;

    setFlash((current) => ({
      className: price > before ? "flash-up" : "flash-down",
      nonce: current.nonce + 1,
    }));
    const timer = setTimeout(() => setFlash((c) => ({ ...c, className: "" })), FLASH_MS);
    return () => clearTimeout(timer);
  }, [price]);

  return flash;
}
