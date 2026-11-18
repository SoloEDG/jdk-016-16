<script setup lang="ts">
import { computed } from "vue";
import type { Document, LinkGroup, LinkKind } from "../../../shared/types";
import { ANGLE_LIMIT } from "../../../shared/constants";
import { analyzeDoc, creaseName, groupLabel, orderedParticipants } from "../model/links";

const props = defineProps<{
  doc: Document;
  analysis: ReturnType<typeof analyzeDoc>;
}>();
const emit = defineEmits<{
  create: [kind: LinkKind, ratio: number];
  update: [id: string, patch: Partial<Pick<LinkGroup, "kind" | "ratio">>];
  remove: [id: string];
  clear: [];
  select: [id: string];
}>();
const ratio = defineModel<number>("ratio", { default: 2 });
/** Guard the ratio against empty/zero input while typing. */
const ratioValue = computed(() =>
  Number.isFinite(ratio.value) && ratio.value > 0 ? ratio.value : 2,
);
const setRatio = (value: string) => {
  const next = Number(value);
  if (Number.isFinite(next) && next > 0) ratio.value = next;
};

const participants = computed(() => orderedParticipants(props.doc));
const ready = computed(() => participants.value.length >= 2);
const statusOf = (id: string) => props.analysis.status[id] ?? "free";
const nodeName = (id: string) => creaseName(props.doc, id);
const hasConflict = computed(() => props.analysis.conflictGroups.size > 0);
</script>

<template>
  <section class="panel link-panel">
    <div class="section-heading">
      <span>联动折叠</span><small>LINK</small>
    </div>
    <p class="muted">框选折痕，或按住 Shift 点选。第一条为主动折痕，其余随动。</p>
    <div class="link-participants">
      <button
        v-for="(id, i) in participants"
        :key="id"
        class="link-chip"
        :class="[statusOf(id), { lead: i === 0 }]"
        @click="emit('select', id)"
      >
        <span>{{ i === 0 ? "主动" : "随动" }}</span>
        <b>{{ nodeName(id) }}</b>
        <i v-if="statusOf(id) === 'conflict'">矛盾</i>
        <i v-else-if="statusOf(id) === 'redundant'">冗余</i>
      </button>
      <span v-if="!participants.length" class="link-empty">尚未选择折痕</span>
      <span v-else-if="participants.length === 1" class="link-empty">
        再选一条即可建立关系
      </span>
    </div>
    <div class="link-actions">
      <button
        class="link-action"
        :disabled="!ready"
        @click="emit('create', 'same', 1)"
      >
        同角
      </button>
      <button
        class="link-action"
        :disabled="!ready"
        @click="emit('create', 'opposite', 1)"
      >
        反向
      </button>
      <button
        class="link-action"
        :disabled="!ready"
        @click="emit('create', 'ratio', ratioValue)"
      >
        比例 {{ Number(ratioValue.toFixed(2)) }}×
      </button>
    </div>
    <label class="ratio-field">
      <span>比例系数</span>
      <input
        :value="ratioValue"
        type="number"
        min="0.05"
        max="8"
        step="0.05"
        aria-label="联动比例"
        @change="setRatio(($event.target as HTMLInputElement).value)"
      />
    </label>

    <div class="link-groups">
      <div
        v-for="(g, i) in doc.links"
        :key="g.id"
        class="link-group"
        :class="{
          conflict: analysis.conflictGroups.has(g.id),
          redundant: analysis.redundantGroups.has(g.id),
          active: doc.selected === g.anchor,
        }"
      >
        <div class="link-group-head">
          <span class="link-index">0{{ i + 1 }}</span>
          <button class="link-group-name" @click="emit('select', g.anchor)">
            {{ nodeName(g.anchor) }} → {{ g.members.map(nodeName).join("、") }}
          </button>
          <button class="link-remove" title="解除关系" @click="emit('remove', g.id)">
            ×
          </button>
        </div>
        <div class="link-group-body">
          <select
            :value="g.kind"
            aria-label="关系类型"
            @change="
              emit('update', g.id, {
                kind: ($event.target as HTMLSelectElement).value as LinkKind,
              })
            "
          >
            <option value="same">同角</option>
            <option value="opposite">反向</option>
            <option value="ratio">比例</option>
          </select>
          <input
            v-if="g.kind === 'ratio'"
            class="link-ratio"
            type="number"
            min="0.05"
            max="8"
            step="0.05"
            :value="g.ratio"
            aria-label="关系比例"
            @change="
              emit('update', g.id, {
                ratio: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <span class="link-tag">{{ groupLabel(g) }}</span>
        </div>
        <p v-if="analysis.conflictGroups.has(g.id)" class="link-note error">
          与已有关系构成矛盾闭环，本组不参与求解
        </p>
        <p
          v-else-if="analysis.redundantGroups.has(g.id)"
          class="link-note warn"
        >
          闭环冗余，与已有约束一致
        </p>
      </div>
      <p v-if="!doc.links.length" class="link-empty-block">
        还没有联动关系。选择两条以上折痕后建立关系。
      </p>
    </div>
    <div class="link-footer">
      <span v-if="hasConflict" class="link-warning"
        >存在矛盾关系，形态维持上次完整状态</span
      >
      <span v-else class="muted small"
        >角度上限 {{ ANGLE_LIMIT }}° · 联动按比例同步</span
      >
      <button v-if="doc.links.length" class="text-button" @click="emit('clear')">
        全部解除
      </button>
    </div>
    <p v-if="doc.feedback" class="link-feedback" :class="doc.feedback.tone">
      {{ doc.feedback.text }}
    </p>
  </section>
</template>
