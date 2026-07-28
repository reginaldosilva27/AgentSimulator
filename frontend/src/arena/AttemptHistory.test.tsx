// 132-arena-attempts — the history view (AC4 UI, AC5 restore, AC12 i18n).

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UI } from "../i18n/strings";
import { AttemptHistory } from "./AttemptHistory";
import { PROGRESS_STORAGE_KEY } from "./progress";
import { __setArenaClock, useArena } from "./store";

const t = UI.en.arena;
const WALL = "agent-wall";

beforeEach(() => {
  localStorage.clear();
  localStorage.removeItem(PROGRESS_STORAGE_KEY);
  useArena.setState({
    nodes: [],
    edges: [],
    faults: [],
    challengeId: null,
    sandbox: null,
    referenceShown: false,
    progress: {},
    lastVerdictMet: false,
  });
  let tick = 1_000;
  __setArenaClock(() => (tick += 1_000));
});

afterEach(cleanup);

describe("132 — the attempt history view", () => {
  it("renders nothing outside challenge mode", () => {
    const { container } = render(<AttemptHistory />);
    expect(container.firstChild).toBeNull();
  });

  it("shows an empty state before anything is recorded", () => {
    act(() => useArena.getState().enterChallenge(WALL));
    render(<AttemptHistory />);
    expect(screen.getByText(t.progress.noAttempts)).toBeTruthy();
    // Honesty: progress is local to this browser, and the panel says so.
    expect(screen.getByText(t.progress.localOnly)).toBeTruthy();
  });

  it("lists a recorded attempt with its verdict and stored figures", () => {
    act(() => {
      useArena.getState().enterChallenge(WALL);
      useArena.getState().loadReference(); // solving records attempt #1
    });
    render(<AttemptHistory />);

    expect(screen.getByText(t.progressAttemptLabel(1))).toBeTruthy();
    expect(screen.getByText(t.progress.passed)).toBeTruthy();
    expect(screen.getByText(t.progress.best)).toBeTruthy(); // the only passing one
    expect(screen.getByText(t.progress.assisted)).toBeTruthy(); // reference was shown
    // The figures are labelled as being from THAT attempt (a recalibration must
    // not silently rewrite history).
    expect(screen.getByText(new RegExp(t.progress.figuresFromThen))).toBeTruthy();
  });

  it("AC5 — restores an attempt's design to the canvas", () => {
    act(() => {
      useArena.getState().enterChallenge(WALL);
      useArena.getState().loadReference();
    });
    const solvedCount = useArena.getState().nodes.length;

    // Wander off, then restore from the history.
    act(() => useArena.getState().clear());
    expect(useArena.getState().nodes).toHaveLength(0);

    render(<AttemptHistory />);
    fireEvent.click(screen.getByText(t.progress.restore));

    expect(useArena.getState().nodes).toHaveLength(solvedCount);
    expect(useArena.getState().challengeId).toBe(WALL); // still active
  });

  it("marks an attempt that passed WITH faults applied", () => {
    act(() => {
      useArena.getState().enterChallenge("survive-the-outage");
      useArena.getState().loadReference();
    });
    render(<AttemptHistory />);
    expect(screen.getByText(new RegExp(t.progress.withFaults))).toBeTruthy();
  });

  it("shows newest first", () => {
    act(() => {
      useArena.getState().enterChallenge(WALL);
      useArena.getState().loadReference(); // #1 (passing)
      useArena.getState().exitChallenge(); // #2 — nothing changed ⇒ deduped
      useArena.getState().enterChallenge(WALL);
      const llm = useArena.getState().nodes.find((n) => n.kind === "llm")!;
      useArena.getState().setReplicas(llm.id, 30);
      useArena.getState().exitChallenge();
      // Come back in: the history only renders inside challenge mode.
      useArena.getState().enterChallenge(WALL);
    });

    // Read the list items directly: the label span also carries the "best" badge,
    // so the text node is split and a regex text query cannot match it.
    const { container } = render(<AttemptHistory />);
    const seqs = [...container.querySelectorAll("li")].map(
      (li) => Number(li.textContent!.match(/#(\d+)/)![1]),
    );
    expect(seqs.length).toBeGreaterThan(1);
    expect(seqs[0]).toBe(Math.max(...seqs)); // newest first
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a));
  });
});
