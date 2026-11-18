export type Vec3 = [number, number, number];
export interface Face {
  id: string;
  points: Vec3[];
  parent?: string;
  hinge?: [Vec3, Vec3];
  crease?: string;
}
export interface Crease {
  id: string;
  name: string;
  description: string;
  face: string;
  target: number;
}

/** Relationship used by a linked group. The factor is applied to the anchor. */
export type LinkKind = "same" | "opposite" | "ratio";

/**
 * A link group is directional: `anchor` drives every crease in `members`.
 * `ratio` is only meaningful for the "ratio" kind and is always positive.
 * Angles themselves stay signed in each crease's own local fold axis.
 */
export interface LinkGroup {
  id: string;
  anchor: string;
  members: string[];
  kind: LinkKind;
  ratio: number;
}

export interface Feedback {
  tone: "ok" | "warn" | "error";
  text: string;
}

export interface Paper {
  id: string;
  name: string;
  subtitle: string;
  size: number;
  faces: Face[];
  creases: Crease[];
}
export interface Step {
  id: string;
  title: string;
  note: string;
  angles: Record<string, number>;
  /**
   * Relation snapshot. Present when the step was saved with links; absent
   * means "inherit the relations currently on the desk".
   */
  links?: LinkGroup[];
  duration: number;
}
export interface View {
  yaw: number;
  pitch: number;
  zoom: number;
  grid: boolean;
  wire: boolean;
}
export interface Document {
  paper: Paper;
  front: string;
  back: string;
  texture: string;
  selected: string;
  /** Multi-selection used by group linking and box selection. */
  selection: string[];
  angles: Record<string, number>;
  /** Local fold sense (1 valley / -1 mountain) used when the angle is zero. */
  directions: Record<string, number>;
  links: LinkGroup[];
  feedback: Feedback | null;
  steps: Step[];
  step: number;
  playing: boolean;
  speed: number;
  view: View;
}
export interface PoseFace {
  id: string;
  points: Vec3[];
  normal: Vec3;
}
