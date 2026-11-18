import type { Document } from "../../../shared/types";
import { clamp } from "../../../shared/document";
import { cloneLinks } from "../../links/lib/graph";
import { poseForStep, setFeedback } from "../../links/model/links";

/**
 * A single entry point for restoring a saved pose. Playback, the "next/prev"
 * buttons and clicking a step all go through here, so the animation and the
 * static restore can never disagree.
 */
export function applyStep(doc: Document, index: number) {
  const target = clamp(index, 0, Math.max(0, doc.steps.length - 1)),
    step = doc.steps[target];
  if (!step) return;
  doc.playing = false;
  doc.step = target;
  // Restore the step's relations exactly. Every step carries a snapshot (built-in
  // steps carry an empty one), so a restore is a pure function of the step and
  // never depends on what happened before.
  doc.links = cloneLinks(step.links ?? []);
  // poseForStep is shared with the player's final frame, so playback and
  // single-step restore cannot diverge.
  doc.angles = poseForStep(
    doc.links,
    doc.paper.creases.map((c) => c.id),
    step.angles,
  );
  doc.selection = doc.selection.filter((id) =>
    doc.paper.creases.some((c) => c.id === id),
  );
  if (!doc.selection.length && doc.selected)
    doc.selection = [doc.selected];
  setFeedback(doc, null);
}

export function seek(doc: Document, index: number) {
  applyStep(doc, index);
}

export function captureStep(doc: Document) {
  const step = doc.steps[doc.step];
  if (!step) return;
  step.angles = { ...doc.angles };
  step.links = cloneLinks(doc.links);
  step.note = "已保存当前折叠形态与联动关系，可随时还原。";
}

/**
 * Editing a relation is a structural change to the pose the user is standing
 * on. Writing pose and relations into that step keeps it self-consistent, so
 * stepping away and back restores exactly what was on screen. This does not
 * overwrite other steps and does not touch their notes.
 */
export function syncCurrentStep(doc: Document) {
  const step = doc.steps[doc.step];
  if (!step) return;
  step.angles = { ...doc.angles };
  step.links = cloneLinks(doc.links);
}
