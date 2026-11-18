import type { Paper, PoseFace, Vec3, View } from "../../../shared/types";
import { rotate, sub, cross, unit } from "../../../shared/vector";
import { project } from "../../observe/lib/projection";
import { ANGLE_LIMIT } from "../../../shared/constants";

/** Never let a corrupted angle reach the geometry: NaN would poison the pose. */
const safeAngle = (value: number | undefined) => {
  if (!Number.isFinite(value as number)) return 0;
  return Math.max(-ANGLE_LIMIT, Math.min(ANGLE_LIMIT, value as number));
};

type Transform = (p: Vec3) => Vec3;

export function solvePose(
  paper: Paper,
  angles: Record<string, number>,
): PoseFace[] {
  const transforms = new Map<string, Transform>(),
    pending = [...paper.faces],
    result: PoseFace[] = [];
  while (pending.length) {
    const i = pending.findIndex((f) => !f.parent || transforms.has(f.parent));
    if (i < 0) throw new Error("纸面连接关系不能成环");
    const f = pending.splice(i, 1)[0]!;
    const parent: Transform = f.parent ? transforms.get(f.parent)! : (p) => p;
    let transform = parent;
    if (f.hinge && f.crease) {
      const a = parent(f.hinge[0]),
        b = parent(f.hinge[1]),
        angle = safeAngle(angles[f.crease]);
      transform = (p) => rotate(parent(p), a, b, angle);
    }
    transforms.set(f.id, transform);
    const points = f.points.map(transform);
    result.push({
      id: f.id,
      points,
      normal: unit(
        cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!)),
      ),
    });
  }
  return result;
}

export function hingePositions(paper: Paper, pose: PoseFace[]) {
  return paper.creases.map((c) => {
    const base = paper.faces.find((f) => f.id === c.face)!;
    const face = pose.find((f) => f.id === c.face)!;
    const indices = base.hinge!.map((h) =>
      base.points.findIndex((p) => p.every((n, i) => n === h[i])),
    );
    return {
      id: c.id,
      a: face.points[indices[0]!]!,
      b: face.points[indices[1]!]!,
    };
  });
}

export interface HingeDrag {
  id: string;
  a: Vec3;
  b: Vec3;
  /** Screen-space pixel offset from hinge midpoint to a point on the moving face. */
  lever: { x: number; y: number };
  /** Pixel delta that corresponds to one degree, never zero. */
  scale: number;
}

/**
 * Prepare a drag interaction. The lever is measured in the current projection
 * from the hinge to the centroid of the face the crease actually moves, so the
 * direction the user drags is the direction the paper visibly moves.
 */
export function beginHingeDrag(
  paper: Paper,
  pose: PoseFace[],
  id: string,
  view: View,
): HingeDrag | null {
  const crease = paper.creases.find((c) => c.id === id),
    face = crease && paper.faces.find((f) => f.id === crease.face),
    posed = crease && pose.find((f) => f.id === crease.face);
  if (!crease || !face || !posed || !face.hinge) return null;
  const indices = face.hinge.map((h) =>
      face.points.findIndex((p) => p.every((n, i) => n === h[i])),
    ),
    a = posed.points[indices[0]!]!,
    b = posed.points[indices[1]!]!,
    mid: Vec3 = [
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2,
    ],
    centroid = posed.points.reduce<Vec3>(
      (sum, p) => [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]],
      [0, 0, 0],
    );
  const n = posed.points.length,
    center: Vec3 = [centroid[0] / n, centroid[1] / n, centroid[2] / n];
  const from = project(mid, view),
    to = project(center, view),
    dx = to.x - from.x,
    dy = to.y - from.y,
    length = Math.hypot(dx, dy);
  // Edge-on poses have a nearly zero lever; use a horizontal fallback so the
  // drag stays usable instead of exploding.
  const lever = length > 6 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 },
    scale = Math.max(2.2, length / 70);
  return { id, a, b, lever, scale };
}

/** Convert pointer movement into a new absolute angle for the drag. */
export function dragAngle(
  drag: HingeDrag,
  startAngle: number,
  dx: number,
  dy: number,
): number {
  return startAngle + (dx * drag.lever.x + dy * drag.lever.y) / drag.scale;
}
