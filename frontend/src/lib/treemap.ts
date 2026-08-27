/** Squarified treemap layout. Pure geometry, no DOM. */

export interface TreemapItem {
  key: string;
  value: number;
}

export interface TreemapRect {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Cell {
  key: string;
  area: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Lays items out in `width` x `height`, largest first, favouring square
 * rectangles. Pass 100 x 100 to get percentage coordinates.
 */
export function treemap(items: TreemapItem[], width = 100, height = 100): TreemapRect[] {
  const usable = items.filter((i) => i.value > 0);
  const total = usable.reduce((sum, i) => sum + i.value, 0);
  if (total <= 0 || width <= 0 || height <= 0) return [];

  const scale = (width * height) / total;
  const cells = usable
    .map((i) => ({ key: i.key, area: i.value * scale }))
    .sort((a, b) => b.area - a.area);

  const out: TreemapRect[] = [];
  let rect: Rect = { x: 0, y: 0, w: width, h: height };
  let row: Cell[] = [];

  for (const cell of cells) {
    const side = Math.min(rect.w, rect.h);
    if (row.length === 0 || worst([...row, cell], side) <= worst(row, side)) {
      row.push(cell);
    } else {
      rect = placeRow(row, rect, out);
      row = [cell];
    }
  }
  if (row.length) placeRow(row, rect, out);
  return out;
}

/** Worst aspect ratio in a candidate row laid along `side`. */
function worst(row: Cell[], side: number): number {
  const sum = row.reduce((s, c) => s + c.area, 0);
  const max = Math.max(...row.map((c) => c.area));
  const min = Math.min(...row.map((c) => c.area));
  if (sum <= 0 || min <= 0) return Infinity;
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/** Emits the row into `out` and returns the remaining rectangle. */
function placeRow(row: Cell[], rect: Rect, out: TreemapRect[]): Rect {
  const sum = row.reduce((s, c) => s + c.area, 0);

  if (rect.w >= rect.h) {
    const w = sum / rect.h;
    let y = rect.y;
    for (const cell of row) {
      const h = cell.area / w;
      out.push({ key: cell.key, x: rect.x, y, w, h });
      y += h;
    }
    return { x: rect.x + w, y: rect.y, w: rect.w - w, h: rect.h };
  }

  const h = sum / rect.w;
  let x = rect.x;
  for (const cell of row) {
    const w = cell.area / h;
    out.push({ key: cell.key, x, y: rect.y, w, h });
    x += w;
  }
  return { x: rect.x, y: rect.y + h, w: rect.w, h: rect.h - h };
}
