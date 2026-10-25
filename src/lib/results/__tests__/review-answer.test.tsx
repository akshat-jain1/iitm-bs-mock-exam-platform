import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { useState } from "react";
import type { QuestionReviewItem } from "@/app/(student)/student/(portal)/results/actions";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Node", "MutationObserver", "getComputedStyle"] as const) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === "window" ? dom.window : dom.window[name] });
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let testing: typeof import("@testing-library/react");
let setupUser: typeof import("@testing-library/user-event").default.setup;
let ResultsClient: typeof import("@/app/(student)/student/(portal)/results/StudentResultsClient").StudentResultsClient;
let ReviewAnswer: typeof import("@/components/student/study/ReviewAnswer").ReviewAnswer;
before(async () => {
  testing = await import("@testing-library/react");
  setupUser = (await import("@testing-library/user-event")).default.setup;
  ResultsClient = (await import("@/app/(student)/student/(portal)/results/StudentResultsClient")).StudentResultsClient;
  ReviewAnswer = (await import("@/components/student/study/ReviewAnswer")).ReviewAnswer;
});
afterEach(() => testing.cleanup());
after(() => dom.window.close());
const question: QuestionReviewItem = { id: "q", sequenceNumber: 1, type: "NUMERICAL", text: "Number?", marks: 2, status: "INCORRECT", studentAnswerText: "3" };
function RevealHarness({ status = "INCORRECT" }: { status?: QuestionReviewItem["status"] }) {
  const [answer, setAnswer] = useState<QuestionReviewItem>();
  return <ReviewAnswer question={{ ...question, status }} answer={answer} loading={false} onReveal={() => setAnswer({ ...question, correctAnswerText: "42" })} />;
}
describe("review answer interaction", () => {
  it("hides incorrect answers until the reveal button is clicked", async () => {
    const user = setupUser({ document: dom.window.document });
    const view = testing.render(<RevealHarness />);
    assert.equal(view.queryByText("42"), null);
    await user.click(view.getByRole("button", { name: "Show correct answer" }));
    assert.ok(view.getByText("42"));
    assert.ok(view.getByRole("heading", { name: "Correct answer" }));
  });
  it("also hides keys for unanswered questions", () => {
    const view = testing.render(<RevealHarness status="UNANSWERED" />);
    assert.ok(view.getByRole("button", { name: "Show correct answer" }));
    assert.equal(view.queryByText("42"), null);
  });
  it("confirms correct submitted answers without an unnecessary reveal button", () => {
    const view = testing.render(<RevealHarness status="CORRECT" />);
    assert.ok(view.getByText("Your answer is correct."));
    assert.equal(view.queryByRole("button"), null);
  });
  it("renders image-only correct options and excludes incorrect options after reveal", () => {
    const answer: QuestionReviewItem = { ...question, type: "MCQ", options: [
      { id: "a", text: "", isStudentSelected: false, isCorrect: true, imageUrl: "https://example.com/a.png" },
      { id: "b", text: "Wrong option", isStudentSelected: true, isCorrect: false },
    ] };
    const view = testing.render(<ReviewAnswer question={answer} answer={answer} loading={false} onReveal={() => {}} />);
    assert.ok(view.getByRole("img", { name: "Correct option visual 1" }));
    assert.equal(view.queryByText("Wrong option"), null);
  });
});

describe("role-specific review presentation", () => {
  it("does not show internal test or production terminology to students", async () => {
    const view = testing.render(<ResultsClient exams={[]} historySessions={[]} isTester={false} />);
    const user = setupUser({ document: dom.window.document });
    await user.click(view.getByRole("button", { name: /Exam Review/ }));
    assert.ok(view.getByText(/Review your completed exam papers/));
    assert.equal(/test assignment|production|tester/i.test(view.container.textContent || ""), false);
  });
  it("keeps assignment filters visible for testers", async () => {
    const view = testing.render(<ResultsClient exams={[]} historySessions={[]} isTester />);
    const user = setupUser({ document: dom.window.document });
    await user.click(view.getByRole("button", { name: /Exam Review/ }));
    assert.ok(view.getByRole("button", { name: /Test Assignments/ }));
    assert.ok(view.getByRole("button", { name: /Production Exams/ }));
  });
});
