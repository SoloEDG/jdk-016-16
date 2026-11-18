<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  Layers,
  RotateCcw,
  ArrowUpRight,
  HelpCircle,
  Leaf,
} from "lucide-vue-next";
import { createDocument } from "../shared/document";
import { PaperPanel, papers, replacePaper } from "../features/paper";
import {
  CreasePanel,
  selectCrease,
  selectRange,
  selectAll,
  promoteCrease,
  selectedCrease,
} from "../features/creases";
import {
  FoldPanel,
  solvePose,
  hingePositions,
  changeAngle,
  flatten,
  applyTarget,
} from "../features/fold";
import {
  LinkPanel,
  analyzeDoc,
  createLinkGroup,
  updateLinkGroup,
  removeLinkGroup,
  clearLinks,
  reverseCrease,
} from "../features/links";
import {
  SequencePanel,
  makeSteps,
  seek,
  captureStep,
  syncCurrentStep,
  usePlayer,
} from "../features/sequence";
import { Viewport, ObservePanel, setView } from "../features/observe";
const doc = reactive(createDocument(papers[0]!, makeSteps(papers[0]!)));
const pose = computed(() => solvePose(doc.paper, doc.angles)),
  hinges = computed(() => hingePositions(doc.paper, pose.value)),
  analysis = computed(() => analyzeDoc(doc));
const { toggle } = usePlayer(doc);
const help = ref(false),
  toast = ref(""),
  ratio = ref(2);
let toastTimer = 0;
function notify(s: string) {
  toast.value = s;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ""), 2600);
}
function choosePaper(id: string) {
  const p = papers.find((p) => p.id === id);
  if (p) {
    replacePaper(doc, p);
    doc.steps = makeSteps(p);
    setView(doc, "iso");
  }
}
function reset() {
  flatten(doc);
  doc.links = [];
  doc.directions = Object.fromEntries(
    doc.paper.creases.map((c) => [c.id, c.target < 0 ? -1 : 1]),
  );
  doc.steps = makeSteps(doc.paper);
  setView(doc, "iso");
  notify("已回到平展纸张，联动关系已清空");
}
function capture() {
  captureStep(doc);
  notify("当前形态与联动关系已保存为步骤 " + String(doc.step + 1).padStart(2, "0"));
}
function createLink(kind: "same" | "opposite" | "ratio") {
  const outcome = createLinkGroup(doc, kind, ratio.value);
  if (outcome.ok) syncCurrentStep(doc);
  if (outcome.text) notify(outcome.text);
}
function updateLink(
  id: string,
  patch: Partial<{ kind: "same" | "opposite" | "ratio"; ratio: number }>,
) {
  const outcome = updateLinkGroup(doc, id, patch);
  if (outcome.ok) syncCurrentStep(doc);
  if (outcome.text) notify(outcome.text);
}
function removeLink(id: string) {
  const outcome = removeLinkGroup(doc, id);
  if (outcome.ok) syncCurrentStep(doc);
  notify(outcome.text);
}
function clearAllLinks() {
  const outcome = clearLinks(doc);
  if (outcome.ok) syncCurrentStep(doc);
  notify(outcome.text);
}
function reverse() {
  notify(reverseCrease(doc).text);
}
</script>
<template>
  <div class="workspace">
    <header class="topbar">
      <a class="brand" href="#"
        ><span class="brand-mark">◩</span><strong>折间<span>ORI</span></strong
        ><i></i><small>三维折纸工作室</small></a
      >
      <nav>
        <span class="project-indicator"></span> 未命名的纸间探索
        <span class="local-badge">本次会话</span>
      </nav>
      <div class="header-actions">
        <button class="icon-button" aria-label="帮助" @click="help = !help">
          <HelpCircle :size="18" /></button
        ><button class="reset" @click="reset">
          <RotateCcw :size="14" />重新开始</button
        ><button class="primary" @click="seek(doc, doc.steps.length - 1)">
          观察成品 <ArrowUpRight :size="15" />
        </button>
      </div>
    </header>
    <main>
      <div class="page-title">
        <div>
          <div class="eyebrow">THE ART OF FOLDING</div>
          <h1>一张纸，无限可能<span>。</span></h1>
          <p>沿着折痕，让平面生长成空间。</p>
        </div>
        <div class="session-note">
          <Leaf :size="16" /><span>放慢一点，折出自己的节奏。</span>
        </div>
      </div>
      <div class="studio">
        <aside class="left-sidebar">
          <PaperPanel :doc="doc" @paper="choosePaper" /><CreasePanel
            :doc="doc"
            @select="(id, additive) => selectCrease(doc, id, additive)"
            @all="selectAll(doc)"
          />
          <div class="sidebar-footer">
            <Layers :size="13" /> 单张纸 ·
            {{ doc.paper.faces.length }} 个关联纸面 · {{ doc.links.length }} 组联动
          </div>
        </aside>
        <div class="center">
          <div class="canvas-label">
            <span
              >{{ doc.paper.name }}
              <small
                >/
                {{
                  doc.paper.id === "shelter" ? "PAPER GARDEN" : "VALLEY WALK"
                }}</small
              ></span
            ><span class="difficulty"
              >入门探索 <i></i><i></i><i class="empty"></i
            ></span>
          </div>
          <Viewport
            :doc="doc"
            :pose="pose"
            :hinges="hinges"
            :analysis="analysis"
            @select="(id, additive) => selectCrease(doc, id, additive)"
            @range="(ids) => selectRange(doc, ids)"
          />
          <div class="instruction">
            <span class="instruction-number">0{{ doc.step + 1 }}</span>
            <div>
              <b>{{ doc.steps[doc.step]?.title }}</b>
              <p>{{ doc.steps[doc.step]?.note }}</p>
            </div>
            <span class="step-count"
              >{{ doc.step + 1 }} / {{ doc.steps.length }}</span
            >
          </div>
        </div>
        <aside class="right-sidebar">
          <div class="selected-heading">
            <span class="eyebrow">当前折痕</span>
            <h2>{{ selectedCrease(doc)?.name }}</h2>
            <p>{{ selectedCrease(doc)?.description }}</p>
          </div>
          <FoldPanel
            :doc="doc"
            @angle="changeAngle(doc, $event)"
            @direction="reverse"
            @target="applyTarget(doc)"
          />
          <LinkPanel
            v-model:ratio="ratio"
            :doc="doc"
            :analysis="analysis"
            @create="createLink"
            @update="updateLink"
            @remove="removeLink"
            @clear="clearAllLinks"
            @select="promoteCrease(doc, $event)"
          /><ObservePanel :doc="doc" />
        </aside>
      </div>
      <SequencePanel
        :doc="doc"
        @seek="seek(doc, $event)"
        @play="toggle"
        @capture="capture"
      />
      <footer>
        <span>ORI / 折间 <i>用折叠，重新认识一张纸。</i></span
        ><span
          ><i class="status-dot"></i> 全部计算于浏览器本地
          <small>© 2026 ORI STUDIO</small></span
        >
      </footer>
    </main>
    <div v-if="toast" role="status" class="toast">✓ {{ toast }}</div>
    <div v-if="help" class="modal-backdrop" @click.self="help = false">
      <section class="help-modal">
        <button class="close" @click="help = false">×</button>
        <div class="eyebrow">A SMALL GUIDE</div>
        <h2>从第一道折痕开始</h2>
        <p>
          选择纸张与颜色，点选折痕后拖动角度滑杆，也可以直接拖动画面中的折痕。父纸面转动时，关联纸面会一起运动。
        </p>
        <p>
          按住 Shift 点选或框选多条折痕，可建立同角、反向或比例联动；拖动其中任意一条，整组按比例同动。关系跨越父子纸面时，角度正负始终以各自局部折轴为准。
        </p>
        <p>
          闭环关系会自动区分冗余与矛盾。矛盾时不会保存，并保留上一次完整形态。达到角度上限时整组按比例停住。保存后的步骤包含联动关系，播放与单步还原结果一致。
        </p>
        <button class="primary" @click="help = false">开始探索 ↗</button>
      </section>
    </div>
  </div>
</template>
