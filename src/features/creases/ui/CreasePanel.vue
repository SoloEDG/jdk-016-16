<script setup lang="ts">
import type { Document } from "../../../shared/types";
import { creaseProgress } from "../lib/availability";
import { foldSenseLabel } from "../../fold/lib/angle";
import { analyzeDoc } from "../../links/model/links";
const props = defineProps<{ doc: Document }>();
defineEmits<{ select: [id: string, additive: boolean]; all: [] }>();
const selectedSet = () => new Set(props.doc.selection);
const analysis = () => analyzeDoc(props.doc);
</script>
<template>
  <section class="panel">
    <div class="section-heading">
      <span>02 / 折痕</span><small>CREASES</small>
    </div>
    <p class="muted">
      点选折痕；按住 Shift 点选多条，或直接框选，再建立联动关系。
    </p>
    <button
      v-for="(c, i) in doc.paper.creases"
      :key="c.id"
      class="crease-row"
      :class="{
        active: doc.selected === c.id,
        chosen: selectedSet().has(c.id) && doc.selected !== c.id,
        conflicted: analysis().status[c.id] === 'conflict',
      }"
      @click="$emit('select', c.id, ($event as MouseEvent).shiftKey)"
    >
      <span class="crease-num">0{{ i + 1 }}</span
      ><span class="crease-name"
        ><b>{{ c.name }}</b
        ><small
          >{{ (doc.angles[c.id] ?? 0).toFixed(0) }}° ·
          {{ foldSenseLabel(doc, c.id) }}</small
        ><i :style="{ width: creaseProgress(doc, c.id) + '%' }"></i
      ></span>
      <span v-if="selectedSet().has(c.id)" class="crease-check">✓</span>
      <span v-else>↗</span>
    </button>
    <div class="crease-tools">
      <button class="text-button" @click="$emit('all')">全选折痕</button>
      <span class="muted small"
        >已选 {{ doc.selection.length }} / {{ doc.paper.creases.length }}</span
      >
    </div>
    <div class="tip">
      <span>⌁</span>
      <p>也可以直接点击纸张上的虚线<br />选择对应折痕</p>
    </div>
  </section>
</template>
