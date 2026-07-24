// 121-arena-learn-links — a tiny transient store carrying a "jump to this Learn
// topic" intent across pages, mirroring the useCloud/useSelection pattern. NOT
// persisted: it's a one-shot navigation signal.
//
// Flow: an Arena "Learn more" link / concept chip calls `requestTopic(id)`; `App`
// subscribes to `pendingTopic` and flips the page to Learn; `LearnPage` calls
// `consumeTopic()` on mount to read + clear it (consume-once, so a stale target
// can't re-open Learn later).

import { create } from "zustand";

interface LearnTargetStore {
  /** The Learn topic id requested from elsewhere, or null. */
  pendingTopic: string | null;
  /** Request a jump to a Learn topic (sets the pending intent). */
  requestTopic: (id: string) => void;
  /** Read and clear the pending topic (returns null when there is none). */
  consumeTopic: () => string | null;
}

export const useLearnTarget = create<LearnTargetStore>((set, get) => ({
  pendingTopic: null,
  requestTopic: (id) => set({ pendingTopic: id }),
  consumeTopic: () => {
    const id = get().pendingTopic;
    if (id !== null) set({ pendingTopic: null });
    return id;
  },
}));
