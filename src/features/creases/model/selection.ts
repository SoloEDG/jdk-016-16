import type { Document } from "../../../shared/types";

/**
 * Single click focuses a crease and resets the multi-selection.
 * Shift-click toggles it in the multi-selection.
 */
export function selectCrease(doc: Document, id: string, additive = false) {
  if (!doc.paper.creases.some((c) => c.id === id)) return;
  doc.playing = false;
  if (additive) {
    const has = doc.selection.includes(id);
    if (has && doc.selection.length > 1) {
      doc.selection = doc.selection.filter((s) => s !== id);
      if (doc.selected === id) doc.selected = doc.selection[0]!;
    } else if (!has) {
      doc.selection = [...doc.selection, id];
      doc.selected = id;
    } else {
      doc.selected = id;
    }
    return;
  }
  doc.selected = id;
  doc.selection = [id];
}

/** Marquee result: replaces the selection, keeps a sane anchor. */
export function selectRange(doc: Document, ids: string[]) {
  const unique = [...new Set(ids)].filter((id) =>
    doc.paper.creases.some((c) => c.id === id),
  );
  doc.playing = false;
  if (!unique.length) return;
  doc.selection = unique;
  if (!unique.includes(doc.selected)) doc.selected = unique[0]!;
}

export function selectAll(doc: Document) {
  doc.playing = false;
  doc.selection = doc.paper.creases.map((c) => c.id);
  doc.selected = doc.selection[0]!;
}

export function focusCrease(doc: Document, id: string) {
  if (doc.paper.creases.some((c) => c.id === id)) doc.selected = id;
}

/**
 * Make a crease the anchor without losing the multi-selection. Used by the
 * link panel's chips: the clicked crease leads the relation, the others stay
 * as members.
 */
export function promoteCrease(doc: Document, id: string) {
  if (!doc.paper.creases.some((c) => c.id === id)) return;
  doc.playing = false;
  doc.selected = id;
  if (!doc.selection.includes(id)) doc.selection = [id, ...doc.selection];
}

/** Drop ids that no longer exist on the current paper. */
export function reconcileSelection(doc: Document) {
  const ids = new Set(doc.paper.creases.map((c) => c.id));
  doc.selection = doc.selection.filter((id) => ids.has(id));
  if (!ids.has(doc.selected)) doc.selected = doc.paper.creases[0]?.id ?? "";
  if (!doc.selection.length && doc.selected) doc.selection = [doc.selected];
}
