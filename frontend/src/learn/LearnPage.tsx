import { useEffect, useState } from "react";

import { useLearnTarget } from "../lib/learnTarget";
import { LearnMap } from "./LearnMap";
import { TopicDetail } from "./TopicDetail";

export function LearnPage() {
  const [selected, setSelected] = useState<string | null>(null);

  // 121-arena-learn-links — if opened by a "Learn more" link / concept chip,
  // consume the pending topic on mount and open it. consumeTopic clears the store
  // (consume-once), so a stale target can't re-open a topic on a later visit.
  useEffect(() => {
    const topic = useLearnTarget.getState().consumeTopic();
    if (topic) setSelected(topic);
  }, []);

  return (
    <div className="flex min-h-0 flex-1">
      <main className="relative min-w-0 flex-1">
        <LearnMap selected={selected} onSelect={setSelected} />
      </main>
      <aside className="w-[400px] shrink-0 border-l border-[var(--color-line)] bg-[var(--color-panel)]">
        <TopicDetail selected={selected} onSelect={setSelected} />
      </aside>
    </div>
  );
}
