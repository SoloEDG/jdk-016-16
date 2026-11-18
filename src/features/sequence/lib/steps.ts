import type { LinkGroup, Paper, Step } from "../../../shared/types";
import { cloneLinks } from "../../links/lib/graph";

export function makeSteps(paper: Paper): Step[] {
  const angles: Record<string, number> = {};
  return [
    {
      id: "flat",
      title: "准备纸张",
      note: "将纸张正面朝上，观察预设折痕。",
      angles: {},
      // An empty snapshot is explicit: built-in steps carry no relations, so
      // restoring them does not depend on what was on the desk before.
      links: [],
      duration: 1000,
    },
    ...paper.creases.map((c, i) => {
      angles[c.id] = c.target;
      return {
        id: "step-" + i,
        title: c.name,
        note: c.description,
        angles: { ...angles },
        links: [],
        duration: 1600,
      };
    }),
  ];
}

export function interpolate(
  a: Record<string, number>,
  b: Record<string, number>,
  t: number,
) {
  const ease = t * t * (3 - 2 * t);
  return Object.fromEntries(
    [...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [
      k,
      (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * ease,
    ]),
  );
}

/**
 * Blend the relations of two steps. Within a step the link set is constant;
 * during a transition we keep the step being entered, which is how the
 * timeline stays reproducible.
 */
export function enterStepLinks(step: Step | undefined): LinkGroup[] {
  return cloneLinks(step?.links ?? []);
}
