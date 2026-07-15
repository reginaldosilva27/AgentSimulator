import { create } from "zustand";

import type { ChatMessage } from "../lib/chatApi";
import { loadTrace as loadCachedTrace } from "../lib/traceCache";
import { cumulativeUsage, tallyUsage, type CumulativeUsage, type TurnUsage } from "../lib/usage";

// 018-cumulative-hud: the running, per-conversation totals that the HUD renders.
// They are RE-DERIVED from the saved per-message traces (the clarified source —
// not a live in-memory accumulator that would be lost on reload), loaded through
// 022's memoized cache so a long conversation doesn't refetch each turn. An
// evicted trace is skipped and flips `partial` (no faked numbers). Reflecting
// only the messages it is handed keeps the HUD scoped to the active conversation.

export const ZERO_USAGE: CumulativeUsage = {
  turns: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  cachedTokens: 0,
  costSavedUsd: 0,
  toolCalls: 0,
  ragHits: 0,
  partial: false,
};

interface HudState {
  cumulative: CumulativeUsage;
  loading: boolean;
  // Recompute the totals from the active conversation's messages (message.id ===
  // trace_id). Safe to call on every turn-complete / conversation switch.
  recompute: (messages: ChatMessage[]) => Promise<void>;
}

// Monotonic guard so a fast conversation switch can't let a stale (slower)
// recompute overwrite the newer one — only the latest call commits.
let token = 0;

export const useHud = create<HudState>((set) => ({
  cumulative: ZERO_USAGE,
  loading: false,

  recompute: async (messages) => {
    const mine = ++token;
    if (messages.length === 0) {
      set({ cumulative: ZERO_USAGE, loading: false });
      return;
    }
    set({ loading: true });
    const records = await Promise.all(
      messages.map(async (m): Promise<TurnUsage | null> => {
        const result = await loadCachedTrace(m.id);
        return result.ok ? tallyUsage(result.events) : null;
      }),
    );
    if (mine !== token) return; // a newer recompute superseded this one
    set({ cumulative: cumulativeUsage(records), loading: false });
  },
}));
