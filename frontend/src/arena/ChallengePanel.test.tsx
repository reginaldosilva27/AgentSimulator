// 130-arena-challenges — the brief panel + the live verdict (AC7, AC9, AC13).

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UI } from "../i18n/strings";
import { ChallengePanel } from "./ChallengePanel";
import { CHALLENGES } from "./challenges";
import { DEFAULT_SLO_TARGETS } from "./slo";
import { useArena } from "./store";

const t = UI.en.arena;
const WALL = CHALLENGES.find((c) => c.id === "agent-wall")!;

beforeEach(() => {
  localStorage.clear();
  useArena.setState({
    nodes: [],
    edges: [],
    challengeId: null,
    sandbox: null,
    referenceShown: false,
    sloTargets: { ...DEFAULT_SLO_TARGETS },
    dismissedNudges: [],
  });
});

afterEach(cleanup);

describe("130 AC7 — the live verdict", () => {
  it("renders the brief, difficulty and locked givens, unsolved at the start", () => {
    act(() => useArena.getState().enterChallenge(WALL.id));
    render(<ChallengePanel />);

    expect(screen.getByText(WALL.title.en)).toBeTruthy();
    expect(screen.getByText(t.challenge.difficulty.easy)).toBeTruthy();
    expect(screen.getByText(WALL.brief.en)).toBeTruthy();
    expect(screen.getByText(t.challenge.lockedHint)).toBeTruthy();
    // One objective on this challenge, and it starts failed (~225 s vs 30 s).
    expect(screen.getByText(t.challengeNotYet(0, 1))).toBeTruthy();
  });

  it("flips to Solved after the scaling change, with no reload", () => {
    act(() => useArena.getState().enterChallenge(WALL.id));
    render(<ChallengePanel />);
    expect(screen.getByText(t.challengeNotYet(0, 1))).toBeTruthy();

    // Load the shipped reference — the same gesture a solving user performs.
    act(() => useArena.getState().loadReference());

    expect(screen.getByText(t.challenge.solved)).toBeTruthy();
    expect(screen.queryByText(t.challengeNotYet(0, 1))).toBeNull();
  });

  it("renders nothing outside challenge mode", () => {
    const { container } = render(<ChallengePanel />);
    expect(container.firstChild).toBeNull();
  });
});

describe("130 AC9 — revealing the reference", () => {
  it("marks the attempt as assisted and keeps the challenge active", () => {
    act(() => useArena.getState().enterChallenge(WALL.id));
    render(<ChallengePanel />);

    fireEvent.click(screen.getByText(t.challenge.showReference));

    expect(useArena.getState().referenceShown).toBe(true);
    expect(useArena.getState().challengeId).toBe(WALL.id);
    expect(screen.getByText(new RegExp(t.challenge.referenceShown))).toBeTruthy();
  });
});

describe("130 AC5 — leaving restores the sandbox", () => {
  it("exits challenge mode from the panel", () => {
    const be = useArena.getState().addNode("backend", { x: 0, y: 0 });
    act(() => useArena.getState().enterChallenge(WALL.id));
    render(<ChallengePanel />);

    fireEvent.click(screen.getByText(t.challenge.exit));

    expect(useArena.getState().challengeId).toBeNull();
    expect(useArena.getState().nodes.map((n) => n.id)).toEqual([be]);
  });
});
