import type { LinkGroup, LinkKind } from "../../../shared/types";
import { LINK_TOL } from "../../../shared/constants";

/**
 * The link graph is solved in a canonical sign convention: every edge is a
 * signed factor applied to the anchor angle (angle[b] = factor * angle[a]).
 *
 * That factor never depends on the camera. It comes from the relation the user
 * asked for (same / opposite / ratio), so orbiting behind the paper can never
 * turn a valley fold into a mountain fold. The sign of each resulting angle is
 * then interpreted against that crease's own local hinge axis.
 */

export interface Edge {
  /** Canonical, undirected key, used to mark a specific constraint. */
  key: string;
  a: string;
  b: string;
  factor: number;
  group: string;
}

export interface Component {
  id: string;
  creases: string[];
  /** weight[c] = signed factor from the component's representative angle. */
  weight: Record<string, number>;
  root: string;
}

export type NodeStatus = "free" | "redundant" | "conflict";

export interface GraphIssue {
  group: string;
  kind: "redundant" | "conflict";
  text: string;
}

export interface LinkAnalysis {
  /** Every constraint the stored groups claim. */
  edges: Edge[];
  /** Constraints that actually take part in solving. */
  effective: Edge[];
  conflictGroups: Set<string>;
  redundantGroups: Set<string>;
  /** Edges that closed a loop with a matching factor. */
  redundantEdges: Set<string>;
  /** Edges that closed a loop with a disagreeing factor. */
  conflictingEdges: Set<string>;
  components: Component[];
  issues: GraphIssue[];
  /** Creases involved in at least one effective relation. */
  linked: Set<string>;
  /** Creases involved in any relation, including contradictory ones. */
  mentioned: Set<string>;
  status: Record<string, NodeStatus>;
  /** False when at least one relation group is contradictory. */
  valid: boolean;
}

export const factorOf = (kind: LinkKind, ratio: number): number => {
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return kind === "same" ? 1 : kind === "opposite" ? -1 : r;
};

export function cloneLinks(links: LinkGroup[]): LinkGroup[] {
  return links.map((g) => ({ ...g, members: [...g.members] }));
}

const edgeKey = (a: string, b: string, group: string) =>
  (a < b ? a + "|" + b : b + "|" + a) + "|" + group;

export function edgeList(links: LinkGroup[], creaseIds?: Set<string>): Edge[] {
  const edges: Edge[] = [],
    seen = new Set<string>();
  for (const g of links) {
    if (!g.anchor) continue;
    const factor = factorOf(g.kind, g.ratio);
    if (!Number.isFinite(factor) || factor === 0) continue;
    for (const member of new Set(g.members)) {
      if (member === g.anchor) continue;
      if (creaseIds && (!creaseIds.has(g.anchor) || !creaseIds.has(member)))
        continue;
      const key = edgeKey(g.anchor, member, g.id);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ key, a: g.anchor, b: member, factor, group: g.id });
    }
  }
  return edges;
}

interface RawComponent {
  nodes: string[];
  weight: Record<string, number>;
  root: string;
}

/**
 * First pass: classify every constraint.
 *
 * A spanning forest is built greedily from the oldest relations, so the
 * relation a user just added is the one that closes the loop. Everything the
 * forest already implies is checked against the forest's weights: matching
 * factors are redundant, disagreeing factors are contradictions. This is
 * deterministic — the same relation list always yields the same verdict,
 * independent of iteration order.
 */
function walkAll(edges: Edge[], creaseIds: string[]) {
  const nodes = new Set(creaseIds);
  for (const e of edges) {
    nodes.add(e.a);
    nodes.add(e.b);
  }
  const parent = new Map<string, string>();
  for (const n of nodes) parent.set(n, n);
  const find = (n: string): string => {
    let root = n;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(n) !== root) {
      const next = parent.get(n)!;
      parent.set(n, root);
      n = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const tree: Edge[] = [],
    redundantEdges = new Set<string>(),
    conflictingEdges = new Set<string>();
  for (const e of edges) {
    if (find(e.a) === find(e.b)) continue;
    union(e.a, e.b);
    tree.push(e);
  }

  const adjacency = new Map<string, { to: string; factor: number }[]>();
  const add = (from: string, to: string, factor: number) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push({ to, factor });
  };
  for (const e of tree) {
    add(e.a, e.b, e.factor);
    add(e.b, e.a, 1 / e.factor);
  }
  const weightOf = new Map<string, Record<string, number>>(),
    comps: RawComponent[] = [];
  for (const start of [...nodes].sort()) {
    if (weightOf.has(start)) continue;
    const weight: Record<string, number> = { [start]: 1 },
      queue = [start];
    weightOf.set(start, weight);
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i]!;
      for (const next of adjacency.get(from) ?? []) {
        if (weightOf.has(next.to)) continue;
        weight[next.to] = weight[from]! * next.factor;
        weightOf.set(next.to, weight);
        queue.push(next.to);
      }
    }
    comps.push({ nodes: queue, weight, root: start });
  }

  // Only loop-closing constraints are classified; spanning-forest edges are
  // the ones doing the defining.
  const treeKeys = new Set(tree.map((e) => e.key)),
    loopGroups = new Map<string, { redundant: boolean; conflict: boolean }>();
  for (const e of edges) {
    if (treeKeys.has(e.key)) continue;
    const weight = weightOf.get(e.a);
    if (!weight || weightOf.get(e.b) !== weight) continue;
    const expected = weight[e.a]! * e.factor,
      actual = weight[e.b]!;
    const entry = loopGroups.get(e.group) ?? {
      redundant: false,
      conflict: false,
    };
    if (Math.abs(actual - expected) <= LINK_TOL) {
      redundantEdges.add(e.key);
      entry.redundant = true;
    } else {
      conflictingEdges.add(e.key);
      entry.conflict = true;
    }
    loopGroups.set(e.group, entry);
  }
  return {
    comps,
    redundantEdges,
    conflictingEdges,
    loopGroups,
    nodes: [...nodes],
  };
}

/** Second pass: rebuild clean components from non-contradictory edges. */
function buildEffective(edges: Edge[]): Component[] {
  const adjacency = new Map<string, { to: string; factor: number }[]>();
  const add = (from: string, to: string, factor: number) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push({ to, factor });
  };
  for (const e of edges) {
    add(e.a, e.b, e.factor);
    add(e.b, e.a, 1 / e.factor);
  }
  const nodes = [...new Set(edges.flatMap((e) => [e.a, e.b]))].sort();
  const seen = new Set<string>(),
    components: Component[] = [];
  let index = 0;
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const weight: Record<string, number> = { [start]: 1 },
      queue = [start];
    seen.add(start);
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i]!;
      for (const next of adjacency.get(from) ?? []) {
        if (seen.has(next.to)) continue;
        seen.add(next.to);
        weight[next.to] = weight[from]! * next.factor;
        queue.push(next.to);
      }
    }
    components.push({
      id: "component-" + index++,
      creases: queue.slice().sort(),
      weight,
      root: start,
    });
  }
  return components;
}

export function analyzeLinks(
  links: LinkGroup[],
  creases: string[],
): LinkAnalysis {
  const ids = new Set(creases),
    edges = edgeList(links, ids),
    raw = walkAll(edges, creases),
    conflictGroups = new Set<string>(),
    redundantGroups = new Set<string>();
  for (const e of edges) {
    if (raw.conflictingEdges.has(e.key)) conflictGroups.add(e.group);
  }
  // A relation is redundant when every one of its constraints closed a loop
  // that the earlier relations already implied. A group with a single edge
  // that became a spanning-forest edge contributes something new, so it is not
  // redundant even if another of its edges closes a matching loop.
  const groupEdges = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!groupEdges.has(e.group)) groupEdges.set(e.group, []);
    groupEdges.get(e.group)!.push(e);
  }
  for (const [group, list] of groupEdges) {
    if (conflictGroups.has(group)) continue;
    if (list.every((e) => raw.redundantEdges.has(e.key)))
      redundantGroups.add(group);
  }

  // A contradictory group is not partially applied: all of its edges are
  // removed from the solve, so we never leave half a relation in the pose.
  const effective = edges.filter((e) => !conflictGroups.has(e.group)),
    components = buildEffective(effective);

  const issues: GraphIssue[] = [];
  for (const group of [...conflictGroups].sort())
    issues.push({
      group,
      kind: "conflict",
      text: "闭环约束相互矛盾，该组关系不参与求解",
    });
  for (const group of [...redundantGroups].sort())
    issues.push({
      group,
      kind: "redundant",
      text: "闭环冗余约束，与已有关系一致",
    });

  const linked = new Set<string>(),
    mentioned = new Set<string>();
  for (const e of edges) {
    mentioned.add(e.a);
    mentioned.add(e.b);
  }
  for (const e of effective) {
    linked.add(e.a);
    linked.add(e.b);
  }
  const incident = new Map<string, Edge[]>();
  for (const e of edges) {
    for (const n of [e.a, e.b]) {
      if (!incident.has(n)) incident.set(n, []);
      incident.get(n)!.push(e);
    }
  }
  const status: Record<string, NodeStatus> = {};
  for (const id of creases) {
    const list = incident.get(id) ?? [];
    if (list.some((e) => conflictGroups.has(e.group))) status[id] = "conflict";
    else if (
      list.length > 0 &&
      list.every(
        (e) =>
          !conflictGroups.has(e.group) && raw.redundantEdges.has(e.key),
      )
    )
      status[id] = "redundant";
    else status[id] = "free";
  }
  return {
    edges,
    effective,
    conflictGroups,
    redundantGroups,
    redundantEdges: raw.redundantEdges,
    conflictingEdges: raw.conflictingEdges,
    components,
    issues,
    linked,
    mentioned,
    status,
    valid: conflictGroups.size === 0,
  };
}

export function componentFor(
  analysis: LinkAnalysis,
  creaseId: string,
): Component | undefined {
  return analysis.components.find((c) => c.weight[creaseId] !== undefined);
}

/** Human readable summary of a relation, shared by panel and messages. */
export const describeFactor = (kind: LinkKind, ratio: number): string =>
  kind === "same"
    ? "同角"
    : kind === "opposite"
      ? "反向"
      : `比例 ${Number(factorOf(kind, ratio).toFixed(3))}×`;
