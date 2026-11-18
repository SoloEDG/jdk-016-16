import type { Document } from "../../../shared/types";
import { normalizeAngle } from "../lib/angle";
import { setCreaseAngle, reverseCrease } from "../../links/model/links";

/**
 * Low-level angle setter. It stays link-aware: the links model owns the
 * proportional clamping, so a slider groomed by this function can never
 * break a relation.
 */
export function changeAngle(doc: Document, value: number) {
  setCreaseAngle(doc, doc.selected, value);
}

export function flatten(doc: Document) {
  doc.playing = false;
  doc.angles = {};
  doc.step = 0;
}

export function applyTarget(doc: Document) {
  const crease = doc.paper.creases.find((c) => c.id === doc.selected);
  if (!crease) return;
  // The preset already carries the intended valley / mountain sign.
  setCreaseAngle(doc, crease.id, normalizeAngle(crease.target));
}

export { reverseCrease };
