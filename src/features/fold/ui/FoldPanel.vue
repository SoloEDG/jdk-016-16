<script setup lang="ts">
import { computed } from "vue";
import type { Document } from "../../../shared/types";
import { angleHint, foldSenseLabel } from "../lib/angle";
import { analyzeDoc } from "../../links/model/links";
import { ANGLE_LIMIT } from "../../../shared/constants";
defineEmits<{ angle: [value: number]; direction: []; target: [] }>();
const p = defineProps<{ doc: Document }>();
const angle = computed(() => p.doc.angles[p.doc.selected] ?? 0);
const analysis = computed(() => analyzeDoc(p.doc));
const component = computed(() =>
  analysis.value.components.find(
    (c) => c.weight[p.doc.selected] !== undefined,
  ),
);
const linked = computed(() => Boolean(component.value));
/**
 * The slider always shows this crease's own angle. Dragging it asks the group
 * for that value; the solver clamps the whole group at whichever sibling hits
 * the limit first.
 */
const sliderValue = computed(() => angle.value);
const atLimit = computed(
  () =>
    Boolean(component.value) &&
    (component.value?.creases ?? []).some(
      (id) => Math.abs(p.doc.angles[id] ?? 0) >= ANGLE_LIMIT - 0.01,
    ),
);
const siblings = computed(() =>
  (component.value?.creases ?? [])
    .filter((id) => id !== p.doc.selected)
    .map((id) => ({
      id,
      name: p.doc.paper.creases.find((c) => c.id === id)?.name ?? id,
      angle: p.doc.angles[id] ?? 0,
    })),
);
const conflicted = computed(
  () => analysis.value.status[p.doc.selected] === "conflict",
);
</script>
<template>
  <section class="panel fold-panel">
    <div class="section-heading"><span>折叠控制</span><small>FOLD</small></div>
    <div class="angle-display">
      <strong>{{ angle.toFixed(0) }}<sup>°</sup></strong
      ><span>{{ angleHint(angle) }}</span>
    </div>
    <input
      aria-label="折叠角度"
      type="range"
      :min="-ANGLE_LIMIT"
      :max="ANGLE_LIMIT"
      :value="sliderValue"
      :disabled="conflicted"
      @input="$emit('angle', Number(($event.target as HTMLInputElement).value))"
    />
    <div class="range-labels">
      <span>−{{ ANGLE_LIMIT }}°</span><span>0°</span><span>{{ ANGLE_LIMIT }}°</span>
    </div>
    <div class="angle-presets">
      <button v-for="a in [0, 45, 90, 135]" :key="a" @click="$emit('angle', a)">
        {{ a }}°
      </button>
    </div>
    <div class="line-label">
      <label>折叠方向</label
      ><button class="text-button" :disabled="conflicted" @click="$emit('direction')">
        {{ foldSenseLabel(doc, doc.selected) }} ⇄
      </button>
    </div>
    <button class="primary full" :disabled="conflicted" @click="$emit('target')">
      折至建议角度 <span>↗</span>
    </button>
    <div v-if="linked" class="fold-linked">
      <span class="eyebrow">联动中 · 整组同动</span>
      <div v-for="s in siblings" :key="s.id" class="fold-linked-row">
        <span>{{ s.name }}</span>
        <b>{{ s.angle.toFixed(1) }}°</b>
      </div>
      <span class="muted small">角度以各折痕自身局部折轴为正负基准</span>
    </div>
    <p v-if="atLimit" class="fold-limit">
      已到 {{ ANGLE_LIMIT }}° 边界，整组按比例停住
    </p>
    <p v-else class="muted small">关联纸面将随当前折痕一起转动。</p>
  </section>
</template>
