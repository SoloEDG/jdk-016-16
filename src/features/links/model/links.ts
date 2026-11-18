import type { Document, LinkGroup } from "../../../shared/types";
import { ANGLE_LIMIT } from "../../../shared/constants";
import {
  analyzeLinks,
  cloneLinks,
  describeFactor,
  factorOf,
  type LinkAnalysis,
} from "../lib/graph";
import { settleAngles, solveComponent } from "../lib/solve";
import { normalizeAngle } from "../../fold/lib/angle";

export interface LinkOutcome {
  ok: boolean;
  tone: "ok" | "warn" | "error";
  text: string;
}

export const creaseIds = (doc: Document): string[] =>
  doc.paper.creases.map((c) => c.id);

export const analyzeDoc = (doc: Document): LinkAnalysis =>
  analyzeLinks(doc.links, creaseIds(doc));

export const creaseName = (doc: Document, id: string): string =>
  doc.paper.creases.find((c) => c.id === id)?.name ?? id;

export const groupLabel = (group: LinkGroup): string =>
  describeFactor(group.kind, group.ratio);

export function setFeedback(doc: Document, outcome: LinkOutcome | null) {
  doc.feedback = outcome ? { tone: outcome.tone, text: outcome.text } : null;
}

/** Normalise a selection, dropping duplicates and unknown creases. */
export function cleanSelection(doc: Document, ids: string[]): string[] {
  const valid = new Set(creaseIds(doc)),
    seen = new Set<string>(),
    out: string[] = [];
  for (const id of ids)
    if (valid.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  return out;
}

/** Anchor first, members after — the order is stable and visible in the UI. */
export function orderedParticipants(doc: Document): string[] {
  const ids = cleanSelection(doc, doc.selection);
  const anchor = ids.includes(doc.selected) ? doc.selected : ids[0];
  return anchor ? [anchor, ...ids.filter((id) => id !== anchor)] : [];
}

const cloneAngles = (angles: Record<string, number>) => ({ ...angles });

/**
 * Settle a pose while preserving the angle of `driver`. The driver's component
 * is solved from the driver itself (so the crease the user just touched never
 * jumps); every other component is left alone unless it is inconsistent.
 */
function resolveFor(
  analysis: LinkAnalysis,
  driver: string,
  angles: Record<string, number>,
): Record<string, number> {
  const component = analysis.components.find(
    (c) => c.weight[driver] !== undefined,
  );
  if (!component) return settleAngles(analysis, angles);
  const solution = solveComponent(component, driver, angles[driver] ?? 0);
  if (!Number.isFinite(solution.value)) return settleAngles(analysis, angles);
  return settleAngles(analysis, { ...angles, ...solution.angles });
}

/**
 * Validate a candidate link list without mutating the document. Returns the
 * new pose, or an error that asks the caller to keep the previous complete
 * pose untouched.
 */
function plan(
  doc: Document,
  nextLinks: LinkGroup[],
): {
  analysis: LinkAnalysis;
  introduced: string[];
  /** English-free user-facing message when the change adds a contradiction. */
  error?: string;
} {
  const analysis = analyzeLinks(nextLinks, creaseIds(doc)),
    previous = analyzeLinks(doc.links, creaseIds(doc)),
    introduced = [...analysis.conflictGroups].filter(
      (id) => !previous.conflictGroups.has(id),
    );
  if (introduced.length)
    return {
      analysis,
      introduced,
      error:
        "新关系与已有联动构成矛盾闭环；关系已标注，形态保留上次完整状态",
    };
  return { analysis, introduced };
}

/**
 * A contradictory change keeps the pose byte-for-byte and only records the
 * relation, so the conflict is visible and can be repaired. This is the
 * "keep the last complete form" rule.
 */
function keepPose(angles: Record<string, number>): Record<string, number> {
  return { ...angles };
}

function commit(doc: Document, links: LinkGroup[], angles: Record<string, number>) {
  doc.links = links;
  doc.angles = angles;
}

function boundaryTouched(
  analysis: LinkAnalysis,
  angles: Record<string, number>,
): boolean {
  return Object.entries(angles).some(
    ([id, value]) =>
      analysis.linked.has(id) && Math.abs(value) >= ANGLE_LIMIT - 1e-6,
  );
}

function relationText(doc: Document, group: LinkGroup) {
  const factor = factorOf(group.kind, group.ratio);
  const body = `${creaseName(doc, group.anchor)} → ${group.members
    .map((m) => creaseName(doc, m))
    .join("、")}`;
  return group.kind === "ratio"
    ? `${body} · 比例 ${Number(factor.toFixed(3))}×`
    : `${body} · ${group.kind === "same" ? "同角" : "反向"}`;
}

/**
 * Create a relation from the current multi-selection. The anchor is the
 * focused crease; its angle drives the members.
 */
export function createLinkGroup(
  doc: Document,
  kind: LinkGroup["kind"],
  ratio: number,
): LinkOutcome {
  doc.playing = false;
  const participants = orderedParticipants(doc);
  if (participants.length < 2) {
    const outcome: LinkOutcome = {
      ok: false,
      tone: "warn",
      text: "请先框选或按住 Shift 点选至少两条折痕",
    };
    setFeedback(doc, outcome);
    return outcome;
  }
  const [anchor, ...members] = participants as [string, ...string[]];
  const group: LinkGroup = {
    id: "link-" + Date.now().toString(36) + "-" + doc.links.length,
    anchor,
    members,
    kind,
    ratio: kind === "ratio" ? (Number.isFinite(ratio) && ratio > 0 ? ratio : 2) : 1,
  };
  const next = [...cloneLinks(doc.links), group];
  const planned = plan(doc, next);
  if (planned.error) {
    // Keep the relation so the loop can be inspected and repaired, but do not
    // touch the pose: the last complete form survives a contradictory edit.
    commit(doc, next, keepPose(doc.angles));
    doc.selection = cleanSelection(doc, [group.anchor, ...group.members]);
    const outcome: LinkOutcome = {
      ok: false,
      tone: "error",
      text: planned.error,
    };
    setFeedback(doc, outcome);
    return outcome;
  }
  const { analysis } = planned;
  const redundant = analysis.redundantGroups.has(group.id),
    angles = resolveFor(analysis, anchor, doc.angles);
  commit(doc, next, angles);
  // Keep the group selected so it can be edited right away.
  doc.selection = cleanSelection(doc, [group.anchor, ...group.members]);
  const touched = boundaryTouched(analysis, angles);
  const tone: LinkOutcome["tone"] = redundant || touched ? "warn" : "ok";
  const outcome: LinkOutcome = {
    ok: true,
    tone,
    text:
      "已建立联动：" +
      relationText(doc, group) +
      (redundant ? "（闭环冗余，与已有约束一致）" : "") +
      (touched ? `；部分角度已按比例触及 ${ANGLE_LIMIT}° 上限` : ""),
  };
  setFeedback(doc, outcome);
  return outcome;
}

export function updateLinkGroup(
  doc: Document,
  id: string,
  patch: Partial<Pick<LinkGroup, "kind" | "ratio">>,
): LinkOutcome {
  doc.playing = false;
  const current = doc.links.find((g) => g.id === id);
  if (!current) {
    const outcome: LinkOutcome = { ok: false, tone: "error", text: "关系不存在" };
    setFeedback(doc, outcome);
    return outcome;
  }
  const next = cloneLinks(doc.links).map((g) =>
    g.id === id ? { ...g, ...patch } : g,
  );
  const planned = plan(doc, next);
  if (planned.error) {
    commit(doc, next, keepPose(doc.angles));
    const outcome: LinkOutcome = {
      ok: false,
      tone: "error",
      text: planned.error,
    };
    setFeedback(doc, outcome);
    return outcome;
  }
  const group = next.find((g) => g.id === id)!;
  const analysis = planned.analysis;
  // If the edited relation itself is still contradictory, keep the last
  // complete pose as well: an unsolvable edit never half-applies.
  if (analysis.conflictGroups.has(id)) {
    commit(doc, next, keepPose(doc.angles));
    const outcome: LinkOutcome = {
      ok: false,
      tone: "error",
      text: "该修改仍使闭环无解；关系已保留，形态维持上次完整状态",
    };
    setFeedback(doc, outcome);
    return outcome;
  }
  // Re-solve from the group's anchor, preserving the anchor's angle.
  const angles = resolveFor(analysis, group.anchor, doc.angles);
  commit(doc, next, angles);
  const touched = boundaryTouched(analysis, angles);
  const outcome: LinkOutcome = {
    ok: true,
    tone: touched ? "warn" : "ok",
    text:
      "已更新：" +
      relationText(doc, group) +
      (touched ? `；部分角度已按比例触及 ${ANGLE_LIMIT}° 上限` : ""),
  };
  setFeedback(doc, outcome);
  return outcome;
}

export function removeLinkGroup(doc: Document, id: string): LinkOutcome {
  doc.playing = false;
  const group = doc.links.find((g) => g.id === id),
    next = cloneLinks(doc.links).filter((g) => g.id !== id);
  // The pose is only re-settled when the remaining relations disagree with it.
  // A consistent pose is kept exactly, so removing a relation never jumps.
  commit(doc, next, settleAngles(analyzeLinks(next, creaseIds(doc)), doc.angles));
  const outcome: LinkOutcome = {
    ok: Boolean(group),
    tone: group ? "ok" : "error",
    text: group ? "已解除关系，折痕可独立编辑" : "关系不存在",
  };
  setFeedback(doc, outcome);
  return outcome;
}

export function clearLinks(doc: Document): LinkOutcome {
  doc.playing = false;
  doc.links = [];
  // Nothing is constrained any more; angles stay where they are.
  const outcome: LinkOutcome = {
    ok: true,
    tone: "ok",
    text: "已解除全部联动关系，折痕恢复独立",
  };
  setFeedback(doc, outcome);
  return outcome;
}

/**
 * Drive one crease (range slider, hinge drag or preset). A linked component
 * moves as a whole, proportionally, and stops at the first limit.
 */
export function setCreaseAngle(
  doc: Document,
  id: string,
  value: number,
): LinkOutcome {
  doc.playing = false;
  const analysis = analyzeDoc(doc);
  if (analysis.status[id] === "conflict") {
    const outcome: LinkOutcome = {
      ok: false,
      tone: "error",
      text: "该折痕所在的联动关系存在矛盾，形态保持不变",
    };
    setFeedback(doc, outcome);
    return outcome;
  }
  // A degenerate component (e.g. only links with non-existing creases) can
  // leave the requested crease outside the solve; clamp it directly.
  const component = analysis.components.find(
    (c) => c.weight[id] !== undefined,
  );
  if (!component) {
    doc.angles[id] = normalizeAngle(value);
    setFeedback(doc, null);
    return { ok: true, tone: "ok", text: "" };
  }
  const solution = solveComponent(component, id, value);
  if (!Number.isFinite(solution.value) || !Number.isFinite(solution.maxAbs)) {
    const outcome: LinkOutcome = {
      ok: false,
      tone: "error",
      text: "求解失败，形态保持不变",
    };
    setFeedback(doc, outcome);
    return outcome;
  }
  for (const [crease, angle] of Object.entries(solution.angles))
    doc.angles[crease] = angle;
  // A sibling may already sit exactly on the limit, in which case asking for
  // the same value is what "clamped" looks like; also report when the driver
  // we were asked to move is itself pinned.
  if (!solution.clamped) {
    if (Math.abs(solution.value) >= ANGLE_LIMIT - 1e-9) {
      const outcome: LinkOutcome = {
        ok: true,
        tone: "warn",
        text: `联动比例保持，整组停在 ${ANGLE_LIMIT}°：${creaseName(
          doc,
          id,
        )} 达到边界`,
      };
      setFeedback(doc, outcome);
      return outcome;
    }
    setFeedback(doc, null);
    return { ok: true, tone: "ok", text: "" };
  }
  const outcome: LinkOutcome = {
    ok: true,
    tone: "warn",
    text: `联动比例保持，整组停在 ${ANGLE_LIMIT}°：${creaseName(
      doc,
      solution.boundary ?? id,
    )} 先到达边界`,
  };
  setFeedback(doc, outcome);
  return outcome;
}

/** Reverse the fold sense of the focused crease, or its whole component. */
export function reverseCrease(doc: Document): LinkOutcome {
  doc.playing = false;
  const analysis = analyzeDoc(doc),
    id = doc.selected;
  if (analysis.status[id] === "conflict") {
    const outcome: LinkOutcome = {
      ok: false,
      tone: "error",
      text: "该折痕所在的联动关系存在矛盾，形态保持不变",
    };
    setFeedback(doc, outcome);
    return outcome;
  }
  const component = analysis.components.find(
    (c) => c.weight[id] !== undefined,
  );
  const targets = component ? component.creases : [id];
  for (const crease of targets) {
    doc.angles[crease] = -(doc.angles[crease] ?? 0);
    // The remembered sense is only used while the angle is still zero, but it
    // must follow the user's intent too.
    doc.directions[crease] = -(doc.directions[crease] ?? 1);
  }
  const outcome: LinkOutcome = {
    ok: true,
    tone: "ok",
    text: component
      ? "整组联动已反向，各折痕仍以自身局部折轴为正负基准"
      : "已切换折叠方向",
  };
  setFeedback(doc, outcome);
  return outcome;
}

/**
 * Resolve the pose stored in a step. Steps whose relations are contradictory
 * are shown exactly as saved (only hard limits are applied): a step is never
 * allowed to silently half-solve. This is the same function used by playback
 * and by step restore, so both always produce identical angles.
 */
export function poseForStep(
  links: LinkGroup[],
  creaseList: string[],
  angles: Record<string, number>,
): Record<string, number> {
  const analysis = analyzeLinks(links, creaseList);
  if (!analysis.valid) {
    const out: Record<string, number> = {};
    for (const id of creaseList)
      out[id] = normalizeAngle(angles[id] ?? 0);
    return out;
  }
  return settleAngles(analysis, { ...angles });
}

/** Snap an arbitrary pose onto the document's current relations. */
export function constrainPose(
  doc: Document,
  angles: Record<string, number> = doc.angles,
): Record<string, number> {
  return settleAngles(analyzeDoc(doc), cloneAngles(angles));
}

export { ANGLE_LIMIT };
