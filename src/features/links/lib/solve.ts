import { ANGLE_LIMIT, zeroSafe } from "../../../shared/constants";
import type { Component } from "./graph";

/**
 * Exact, closed-form solution of one linked component.
 *
 * All angles in a component stay proportional to the driver's angle, so the
 * ratios are never broken. If any member would cross ±ANGLE_LIMIT the whole
 * component is scaled back together: the driver simply stops at the value
 * where its most constrained sibling reaches the boundary, and the remaining
 * faces do not keep moving on their own.
 */

export interface ComponentSolution {
  /** Final angles for every crease in the component. */
  angles: Record<string, number>;
  /** Achieved driver angle (after proportional clamping). */
  value: number;
  /** Requested driver angle after normalisation. */
  requested: number;
  clamped: boolean;
  /** Crease that stopped the component, when clamped. */
  boundary: string | null;
  /** Largest absolute driver value this component can reach. */
  maxAbs: number;
}

/** Snap to the exact boundary, so a value resting there cannot jitter. */
export const BOUNDARY_SNAP = 0.02;

const round = (n: number) => zeroSafe(Math.round(n * 1e4) / 1e4);

export function componentBounds(
  component: Component,
  driver: string,
  limit = ANGLE_LIMIT,
): { maxAbs: number; boundary: string | null } {
  const driverWeight = component.weight[driver];
  // A zero weight cannot happen for a real crease, but be defensive: a
  // degenerate factor must never produce an infinite bound.
  if (!driverWeight) return { maxAbs: 0, boundary: driver };
  let maxAbs = limit,
    boundary: string | null = null;
  for (const crease of component.creases) {
    const factor = component.weight[crease]! / driverWeight;
    if (Math.abs(factor) < 1e-12) continue;
    const allowed = limit / Math.abs(factor);
    if (allowed < maxAbs - 1e-9) {
      maxAbs = allowed;
      boundary = crease;
    }
  }
  return { maxAbs, boundary };
}

export function solveComponent(
  component: Component,
  driver: string,
  request: number,
  limit = ANGLE_LIMIT,
): ComponentSolution {
  const driverWeight = component.weight[driver] ?? 1,
    maxAbs = componentBounds(component, driver, limit).maxAbs,
    requested = Number.isFinite(request) ? request : 0,
    bounded = Math.max(-maxAbs, Math.min(maxAbs, requested)),
    value =
      Math.abs(bounded) >= maxAbs - BOUNDARY_SNAP
        ? Math.sign(bounded) * maxAbs
        : bounded,
    clamped = Math.abs(requested) > maxAbs + 1e-9;
  const angles: Record<string, number> = {};
  for (const crease of component.creases) {
    const factor = component.weight[crease]! / driverWeight;
    angles[crease] = round(factor * value);
  }
  return {
    angles,
    value: round(value),
    requested,
    clamped,
    boundary: clamped ? componentBounds(component, driver, limit).boundary : null,
    maxAbs,
  };
}

/**
 * Project any angle record onto the constraints of `analysis`, keeping the
 * component's representative crease where it already is. Linear relations are
 * homogeneous, so interpolation between two projected records stays linked.
 */
export function constrainAngles(
  analysis: { components: Component[]; linked: Set<string>; mentioned?: Set<string> },
  raw: Record<string, number>,
  limit = ANGLE_LIMIT,
): Record<string, number> {
  const out: Record<string, number> = { ...raw };
  for (const component of analysis.components) {
    const driver = component.root,
      solution = solveComponent(component, driver, raw[driver] ?? 0, limit);
    for (const crease of component.creases) out[crease] = solution.angles[crease]!;
  }
  for (const [crease, angle] of Object.entries(out))
    // Creases tied to a contradictory relation are frozen by their owner; all
    // other free creases are simply clamped.
    if (!analysis.linked.has(crease) && !analysis.mentioned?.has(crease))
      out[crease] = Math.max(-limit, Math.min(limit, angle || 0));
  return out;
}

/**
 * True when every relation inside a component already holds exactly enough.
 * Used after relation edits so removing a relation never makes a valid pose
 * jump because of rounding.
 */
export function isComponentConsistent(
  component: Component,
  angles: Record<string, number>,
  tol = 1e-3,
): boolean {
  const rootWeight = component.weight[component.root] ?? 1,
    root = angles[component.root] ?? 0;
  if (Math.abs(root) > ANGLE_LIMIT + 1e-6) return false;
  for (const crease of component.creases) {
    const expected = (component.weight[crease]! / rootWeight) * root,
      actual = angles[crease] ?? 0;
    if (Math.abs(expected - actual) > tol) return false;
    if (Math.abs(actual) > ANGLE_LIMIT + 1e-6) return false;
  }
  return true;
}

/**
 * Bring a pose back onto its relations only when it is not already there.
 * Consistent poses are returned untouched, which keeps edits predictable.
 */
export function settleAngles(
  analysis: {
    components: Component[];
    linked: Set<string>;
    mentioned?: Set<string>;
  },
  raw: Record<string, number>,
  limit = ANGLE_LIMIT,
): Record<string, number> {
  const out: Record<string, number> = { ...raw };
  let changed = false;
  for (const component of analysis.components) {
    if (isComponentConsistent(component, out)) continue;
    changed = true;
    const solution = solveComponent(
      component,
      component.root,
      out[component.root] ?? 0,
      limit,
    );
    for (const crease of component.creases)
      out[crease] = solution.angles[crease]!;
  }
  for (const [crease, angle] of Object.entries(out))
    if (!analysis.linked.has(crease) && !analysis.mentioned?.has(crease)) {
      const next = Math.max(-limit, Math.min(limit, angle || 0));
      if (next !== angle) changed = true;
      out[crease] = next;
    }
  return changed ? out : raw;
}
