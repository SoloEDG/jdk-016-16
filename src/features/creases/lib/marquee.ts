export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Liang–Barsky clip: does the screen-space segment touch the marquee? */
export function segmentIntersectsRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  rect: Rect,
): boolean {
  const left = Math.min(rect.x1, rect.x2),
    right = Math.max(rect.x1, rect.x2),
    top = Math.min(rect.y1, rect.y2),
    bottom = Math.max(rect.y1, rect.y2),
    dx = b.x - a.x,
    dy = b.y - a.y;
  let t0 = 0,
    t1 = 1;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, a.x - left) &&
    clip(dx, right - a.x) &&
    clip(-dy, a.y - top) &&
    clip(dy, bottom - a.y) &&
    t0 <= t1
  );
}

export function normalizedRect(rect: Rect): Rect {
  return {
    x1: Math.min(rect.x1, rect.x2),
    y1: Math.min(rect.y1, rect.y2),
    x2: Math.max(rect.x1, rect.x2),
    y2: Math.max(rect.y1, rect.y2),
  };
}

export const rectFromPoints = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Rect => normalizedRect({ x1, y1, x2, y2 });
