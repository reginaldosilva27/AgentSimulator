// 121-arena-learn-links — the deep-link consume path: LearnPage opens the pending
// topic on mount and clears it (consume-once), so a link/chip lands the reader on
// the topic detail (AC4 "select" half), and a later plain visit doesn't reopen it.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { allTopicsFor } from "../learn/content";
import { LearnPage } from "../learn/LearnPage";
import { useLearnTarget } from "../lib/learnTarget";

beforeEach(() => {
  if (typeof ResizeObserver === "undefined") {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  }
  useLearnTarget.setState({ pendingTopic: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("121 — LearnPage consumes a pending topic (AC4 select)", () => {
  it("opens the requested topic's detail on mount", () => {
    useLearnTarget.getState().requestTopic("tokens");
    render(<LearnPage />);
    const title = allTopicsFor("en").tokens.topic.title;
    // TopicDetail renders the selected topic's title as an <h2>.
    expect(screen.getByRole("heading", { name: title, level: 2 })).toBeTruthy();
  });

  it("consumes once: the pending topic is cleared after mount", () => {
    useLearnTarget.getState().requestTopic("embeddings");
    render(<LearnPage />);
    expect(useLearnTarget.getState().pendingTopic).toBeNull();
  });

  it("with no pending topic, opens no detail (the unselected map)", () => {
    render(<LearnPage />);
    // no topic requested → the tokens detail heading is not shown
    const title = allTopicsFor("en").tokens.topic.title;
    expect(screen.queryByRole("heading", { name: title, level: 2 })).toBeNull();
  });
});
