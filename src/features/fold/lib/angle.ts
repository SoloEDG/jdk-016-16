import type { Document } from "../../../shared/types";
import { ANGLE_LIMIT, zeroSafe } from "../../../shared/constants";

/**
 * Keep a tenth of a degree so hinge dragging stays smooth. The hard limit is
 * applied here as well, so no code path can leave the valid range.
 */
export const normalizeAngle = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(-ANGLE_LIMIT, Math.min(ANGLE_LIMIT, value));
  return zeroSafe(Math.round(clamped * 10) / 10);
};

export const angleHint = (angle: number) =>
  Math.abs(angle) < 1
    ? "纸面平展"
    : Math.abs(angle) < 90
      ? "轻折 · 空间打开"
      : Math.abs(angle) < 150
        ? "深折 · 纸面靠拢"
        : "接近平折";

/**
 * The fold sense is derived from the signed angle in the crease's own local
 * hinge frame, never from screen space: orbiting the camera behind the paper
 * must not swap valley and mountain.
 */
export function foldSense(doc: Document, id: string): "valley" | "mountain" {
  const angle = doc.angles[id] ?? 0;
  if (Math.abs(angle) > 0.5) return angle > 0 ? "valley" : "mountain";
  return (doc.directions[id] ?? 1) > 0 ? "valley" : "mountain";
}

export function foldSenseLabel(doc: Document, id: string): string {
  return foldSense(doc, id) === "valley" ? "谷折" : "山折";
}
