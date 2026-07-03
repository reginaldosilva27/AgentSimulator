// 095-harness-loop-lens — the Harness ⇄ Loop lens. A pure reframing of the same
// real run: `harness` lights up the wiring (space), `loop` lights up the cycle
// (time), `all` is today's view untouched. Mirrors the cloud/lang stores: a tiny
// Zustand store persisted to localStorage. Switching lens fires no request and
// never mutates the trace — the canvas only changes *emphasis* (§ pure projection).

import { create } from "zustand";

export type LensMode = "all" | "harness" | "loop";

export const LENS_MODES: LensMode[] = ["all", "harness", "loop"];

const STORAGE_KEY = "agentsim.lens";
const DEFAULT_LENS: LensMode = "all";

function isLensMode(v: unknown): v is LensMode {
  return v === "all" || v === "harness" || v === "loop";
}

function initialLens(): LensMode {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLensMode(saved)) return saved;
  }
  return DEFAULT_LENS;
}

interface LensState {
  mode: LensMode;
  setMode: (mode: LensMode) => void;
}

export const useLens = create<LensState>((set) => ({
  mode: initialLens(),
  setMode: (mode) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, mode);
    set({ mode });
  },
}));
