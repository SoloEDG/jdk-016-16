import type { Document, Paper } from "../../../shared/types";
import { reconcileSelection } from "../../creases/model/selection";

export function replacePaper(doc: Document, paper: Paper) {
  doc.paper = paper;
  doc.angles = {};
  doc.selected = paper.creases[0]?.id ?? "";
  doc.selection = paper.creases[0]?.id ? [paper.creases[0]!.id] : [];
  doc.directions = Object.fromEntries(
    paper.creases.map((c) => [c.id, c.target < 0 ? -1 : 1]),
  );
  doc.links = [];
  doc.feedback = null;
  doc.playing = false;
  doc.step = 0;
  reconcileSelection(doc);
}

export function setMaterial(doc: Document, front: string, back: string) {
  doc.front = front;
  doc.back = back;
}
