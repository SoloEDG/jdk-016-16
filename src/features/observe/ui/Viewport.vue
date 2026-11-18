<script setup lang="ts">
import { computed, ref } from "vue";
import type { Document, PoseFace } from "../../../shared/types";
import { project, polygon, cameraPoint } from "../lib/projection";
import { orbit, zoom, setView } from "../model/camera";
import { downloadView } from "../lib/export";
import { beginHingeDrag, dragAngle, type HingeDrag } from "../../fold/lib/kinematics";
import { setCreaseAngle } from "../../links/model/links";
import { rectFromPoints, segmentIntersectsRect, type Rect } from "../../creases/lib/marquee";

const props = defineProps<{
  doc: Document;
  pose: PoseFace[];
  hinges: {
    id: string;
    a: [number, number, number];
    b: [number, number, number];
  }[];
  analysis: {
    components: { id: string; creases: string[] }[];
    conflictGroups: Set<string>;
    redundantGroups: Set<string>;
    linked: Set<string>;
  };
}>();
const emit = defineEmits<{
  select: [id: string, additive: boolean];
  range: [ids: string[]];
}>();

const svg = ref<SVGSVGElement>();
let orbitDrag = false,
  lastX = 0,
  lastY = 0;

/* ---------------------------------------------------------------- marquee */
const marquee = ref<Rect | null>(null);
const marqueeMode = ref(false);
let marqueeStart: { x: number; y: number } | null = null;
const sceneBox = computed(() => ({
  w: 800,
  h: 560,
}));

/** Client pixels → viewBox coordinates (the SVG scales responsively). */
function toScene(e: PointerEvent) {
  const node = svg.value;
  if (!node) return { x: 0, y: 0 };
  const matrix = node.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const point = node.createSVGPoint();
  point.x = e.clientX;
  point.y = e.clientY;
  const local = point.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

function hingeScreen(id: string) {
  const h = props.hinges.find((h) => h.id === id);
  if (!h) return null;
  const a = project(h.a, props.doc.view),
    b = project(h.b, props.doc.view);
  return { a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

const marqueeSelection = computed(() => {
  const rect = marquee.value;
  if (!rect) return [];
  return props.hinges
    .filter((h) => {
      const s = hingeScreen(h.id);
      return s ? segmentIntersectsRect(s.a, s.b, rect) : false;
    })
    .map((h) => h.id);
});

/* ------------------------------------------------------------- hinge drag */
let drag: HingeDrag | null = null,
  dragStart: { x: number; y: number } | null = null,
  dragAngleStart = 0,
  dragMoved = false,
  dragId = "";

function hingeDown(e: PointerEvent, id: string) {
  // In marquee mode a drag starting on a crease must still draw a box, so let
  // the event fall through to the scene handler instead of grabbing the hinge.
  if (marqueeMode.value || e.altKey) return;
  e.stopPropagation();
  const start = beginHingeDrag(props.doc.paper, props.pose, id, props.doc.view);
  if (!start) return;
  drag = start;
  dragId = id;
  dragStart = { x: e.clientX, y: e.clientY };
  dragAngleStart = props.doc.angles[id] ?? 0;
  dragMoved = false;
  (e.currentTarget as Element).setPointerCapture(e.pointerId);
}

function hingeMove(e: PointerEvent) {
  if (!drag || !dragStart) return;
  e.stopPropagation();
  const dx = e.clientX - dragStart.x,
    dy = e.clientY - dragStart.y;
  if (!dragMoved && Math.hypot(dx, dy) < 3) return;
  dragMoved = true;
  const next = dragAngle(drag, dragAngleStart, dx, dy);
  setCreaseAngle(props.doc, dragId, next);
}

function hingeUp(e: PointerEvent, id: string) {
  if (!drag) return;
  e.stopPropagation();
  const target = e.currentTarget as Element;
  if (target.hasPointerCapture(e.pointerId))
    target.releasePointerCapture(e.pointerId);
  const moved = dragMoved;
  drag = null;
  dragStart = null;
  dragMoved = false;
  if (!moved) emit("select", id, e.shiftKey);
}

/* ------------------------------------------------------------ scene orbit */
function down(e: PointerEvent) {
  const onHinge = Boolean((e.target as Element).closest(".hinge"));
  if ((e.target as Element).closest(".scene-tools, .view-tabs")) return;
  // A hinge handles its own drag; only box selection may start on top of one.
  if (onHinge && !marqueeMode.value && !e.shiftKey && !e.altKey) return;
  if (marqueeMode.value || e.shiftKey || e.altKey) {
    marqueeStart = toScene(e);
    marquee.value = rectFromPoints(
      marqueeStart.x,
      marqueeStart.y,
      marqueeStart.x,
      marqueeStart.y,
    );
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    return;
  }
  orbitDrag = true;
  lastX = e.clientX;
  lastY = e.clientY;
  (e.currentTarget as Element).setPointerCapture(e.pointerId);
}

function move(e: PointerEvent) {
  if (marqueeStart) {
    const p = toScene(e);
    marquee.value = rectFromPoints(marqueeStart.x, marqueeStart.y, p.x, p.y);
    return;
  }
  if (!orbitDrag) return;
  orbit(props.doc, e.clientX - lastX, e.clientY - lastY);
  lastX = e.clientX;
  lastY = e.clientY;
}

function up() {
  if (marquee.value) {
    const ids = marqueeSelection.value;
    if (ids.length) emit("range", ids);
    marquee.value = null;
    marqueeStart = null;
  }
  orbitDrag = false;
}

const faces = computed(() =>
  props.pose
    .map((f) => ({
      ...f,
      depth:
        f.points.reduce((s, p) => s + project(p, props.doc.view).z, 0) /
        f.points.length,
      back: cameraPoint(f.normal, props.doc.view)[2] > 0,
    }))
    .sort((a, b) => a.depth - b.depth),
);

const selectedSet = computed(() => new Set(props.doc.selection));
const linkedOverlay = computed(() =>
  props.analysis.components
    .filter((c) => c.creases.length > 1)
    .map((c) => ({
      id: c.id,
      points: c.creases
        .map((id) => hingeScreen(id)?.mid)
        .filter((p): p is { x: number; y: number } => Boolean(p)),
    }))
    .filter((c) => c.points.length > 1),
);
const conflict = computed(() => props.analysis.conflictGroups.size > 0);
</script>

<template>
  <section class="viewport">
    <div class="viewport-top">
      <div class="view-tabs">
        <button class="active" @click="setView(doc, 'iso')">立体视图</button
        ><button @click="setView(doc, 'top')">俯视</button
        ><button @click="setView(doc, 'front')">正视</button>
      </div>
      <span class="live" :class="{ danger: conflict }"
        ><i></i> {{ conflict ? "存在矛盾关系" : "实时预览" }}</span
      >
    </div>
    <svg
      ref="svg"
      class="paper-scene"
      :viewBox="`0 0 ${sceneBox.w} ${sceneBox.h}`"
      :class="{ marqueeing: marqueeMode }"
      aria-label="三维折纸预览"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @wheel.prevent="zoom(doc, -$event.deltaY * 0.001)"
    >
      <defs>
        <pattern id="grid" width="35" height="35" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="#d4d9d0" />
        </pattern>
        <pattern
          id="fiber"
          width="13"
          height="17"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M1 2l3 1M8 11l2 -2M3 14l1 -2"
            stroke="#fff"
            stroke-opacity=".22"
            stroke-width=".7"
          />
        </pattern>
        <pattern id="dots" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r=".65" fill="#fff" fill-opacity=".4" />
        </pattern>
        <filter id="shadow"><feGaussianBlur stdDeviation="15" /></filter>
      </defs>
      <rect width="800" height="560" fill="#f6f7f2" />
      <rect v-if="doc.view.grid" width="800" height="560" fill="url(#grid)" />
      <ellipse
        cx="400"
        cy="401"
        rx="180"
        ry="32"
        fill="#63705a"
        opacity=".15"
        filter="url(#shadow)"
      />
      <g v-for="f in faces" :key="f.id" :data-face="f.id">
        <polygon
          :points="polygon(f.points, doc.view)"
          :fill="f.back ? doc.back : doc.front"
          stroke="#785945"
          stroke-opacity=".35"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
        <polygon
          :points="polygon(f.points, doc.view)"
          fill="#314638"
          :opacity="Math.max(0, 0.1 + f.normal[1] * 0.08)"
        />
        <polygon
          v-if="doc.texture !== 'plain'"
          :points="polygon(f.points, doc.view)"
          :fill="'url(#' + doc.texture + ')'"
        />
      </g>
      <g v-if="doc.view.wire">
        <g
          v-for="(h, i) in hinges"
          :key="h.id"
          class="hinge"
          @pointerdown="hingeDown($event, h.id)"
          @pointermove="hingeMove"
          @pointerup="hingeUp($event, h.id)"
          @pointercancel="hingeUp($event, h.id)"
        >
          <line
            :x1="project(h.a, doc.view).x"
            :y1="project(h.a, doc.view).y"
            :x2="project(h.b, doc.view).x"
            :y2="project(h.b, doc.view).y"
            stroke="transparent"
            stroke-width="18"
          />
          <line
            :x1="project(h.a, doc.view).x"
            :y1="project(h.a, doc.view).y"
            :x2="project(h.b, doc.view).x"
            :y2="project(h.b, doc.view).y"
            :stroke="
              h.id === doc.selected
                ? '#fff8d9'
                : selectedSet.has(h.id)
                  ? '#e7d9a8'
                  : '#746f57'
            "
            :stroke-width="h.id === doc.selected ? 2.5 : 1.2"
            stroke-dasharray="5 4"
          />
          <circle
            :cx="(project(h.a, doc.view).x + project(h.b, doc.view).x) / 2"
            :cy="(project(h.a, doc.view).y + project(h.b, doc.view).y) / 2"
            r="11"
            :fill="
              h.id === doc.selected
                ? '#384d3f'
                : selectedSet.has(h.id)
                  ? '#c9d7b6'
                  : '#f7f6ee'
            "
          />
          <text
            :x="(project(h.a, doc.view).x + project(h.b, doc.view).x) / 2"
            :y="(project(h.a, doc.view).y + project(h.b, doc.view).y) / 2 + 3.5"
            text-anchor="middle"
            font-size="10"
            :fill="h.id === doc.selected ? 'white' : '#555'"
          >
            {{ i + 1 }}
          </text>
        </g>
        <g class="link-overlay">
          <path
            v-for="overlay in linkedOverlay"
            :key="overlay.id"
            :d="
              overlay.points
                .map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y)
                .join(' ')
            "
            fill="none"
            :stroke="conflict ? '#b6695b' : '#7d9a63'"
            stroke-width="1.4"
            stroke-dasharray="2 5"
            opacity=".8"
          />
        </g>
      </g>
      <rect
        v-if="marquee"
        :x="marquee.x1"
        :y="marquee.y1"
        :width="marquee.x2 - marquee.x1"
        :height="marquee.y2 - marquee.y1"
        fill="#6c855c"
        fill-opacity=".08"
        stroke="#6c855c"
        stroke-width="1"
        stroke-dasharray="4 3"
        pointer-events="none"
      />
      <g transform="translate(58,475)" stroke-width="1.5">
        <path d="M0 0l28 12" stroke="#be806c" />
        <path d="M0 0v-30" stroke="#839b72" />
        <path d="M0 0l-18 15" stroke="#839eae" />
        <text x="32" y="17" font-size="10" fill="#ad7a69">X</text>
        <text x="-3" y="-37" font-size="10" fill="#789069">Y</text>
        <text x="-28" y="23" font-size="10" fill="#839eae">Z</text>
      </g>
    </svg>
    <div class="scene-caption">
      <span>{{
        marqueeMode
          ? "框选折痕 · 松开完成选择"
          : "拖动旋转视角 · 拖动折痕折纸 · Shift 拖动框选"
      }}</span
      ><b>{{ Math.round(doc.view.zoom * 100) }}%</b>
    </div>
    <div class="scene-tools">
      <button
        :class="{ selected: doc.view.grid }"
        title="网格"
        @click="doc.view.grid = !doc.view.grid"
      >
        ▦</button
      ><button
        :class="{ selected: doc.view.wire }"
        title="折痕"
        @click="doc.view.wire = !doc.view.wire"
      >
        ⌁</button
        ><i></i
      ><button
        :class="{ selected: marqueeMode }"
        title="框选折痕（Shift 拖动同样可用）"
        @click="marqueeMode = !marqueeMode"
      >
        ⬚</button
      ><i></i><button title="放大" @click="zoom(doc, 0.1)">＋</button
      ><button title="缩小" @click="zoom(doc, -0.1)">−</button
      ><button title="重置视角" @click="setView(doc, 'iso')">⤢</button><i></i
      ><button title="下载观察图" @click="svg && downloadView(svg)">↓</button>
    </div>
  </section>
</template>
