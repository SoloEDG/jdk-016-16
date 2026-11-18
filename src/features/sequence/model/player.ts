import { onUnmounted } from "vue";
import type { Document } from "../../../shared/types";
import { interpolate } from "../lib/steps";
import { cloneLinks } from "../../links/lib/graph";
import { poseForStep } from "../../links/model/links";
import { applyStep } from "./timeline";

/**
 * Playback runs transition by transition.
 *
 * Each transition animates from the pose currently on screen to the *solved*
 * pose of the destination step, both expressed under the destination step's
 * relations. Because the relations are homogeneous, linear interpolation
 * between two consistent poses stays consistent and stays inside the angle
 * limits — the ratios are never broken mid-flight.
 *
 * The last frame is produced by `applyStep` itself, so the animation and a
 * single-step restore land on exactly the same numbers.
 */
export function usePlayer(doc: Document) {
  let frame = 0,
    last = 0,
    elapsed = 0,
    target = 0,
    start: Record<string, number> = {},
    end: Record<string, number> = {};

  function begin(now: number) {
    target = (doc.step + 1) % doc.steps.length;
    const step = doc.steps[target]!;
    doc.links = cloneLinks(step.links ?? []);
    // Project the visible pose onto the destination relations before the
    // first frame, so a relation change between steps snaps once at the
    // boundary instead of breaking ratios for the whole transition.
    start = poseForStep(
      doc.links,
      doc.paper.creases.map((c) => c.id),
      doc.angles,
    );
    end = poseForStep(doc.links, doc.paper.creases.map((c) => c.id), step.angles);
    doc.angles = { ...start };
    elapsed = 0;
    last = now;
  }

  function tick(now: number) {
    if (!doc.playing) {
      last = 0;
      return;
    }
    if (!last) begin(now);
    const step = doc.steps[target]!;
    elapsed += (now - last) * doc.speed;
    last = now;
    const t = Math.min(1, elapsed / Math.max(1, step.duration));
    doc.angles = interpolate(start, end, t);
    if (t >= 1) {
      applyStep(doc, target);
      if (target >= doc.steps.length - 1) {
        doc.playing = false;
        last = 0;
        return;
      }
      doc.playing = true;
      last = 0;
      frame = requestAnimationFrame(tick);
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function toggle() {
    doc.playing = !doc.playing;
    cancelAnimationFrame(frame);
    last = 0;
    if (doc.playing) frame = requestAnimationFrame(tick);
  }

  onUnmounted(() => cancelAnimationFrame(frame));
  return { toggle };
}
