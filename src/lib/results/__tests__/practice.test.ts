import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reviewBlockedReason } from "../release";
import { gradePractice, hideAnswerKeys } from "../practice";
import type { ExamResponses } from "@/lib/types/exam";
import type { QuestionReviewItem } from "@/app/(student)/student/(portal)/results/actions";
const questions: QuestionReviewItem[] = [
  { id: "mcq", sequenceNumber: 1, text: "Choice", type: "MCQ", marks: 2, status: "CORRECT", options: [{ id: "a", text: "A", isStudentSelected: true, isCorrect: true }, { id: "b", text: "B", isStudentSelected: false, isCorrect: false }] },
  { id: "msq", sequenceNumber: 2, text: "Set", type: "MSQ", marks: 3, status: "INCORRECT", options: [{ id: "a", text: "A", isStudentSelected: false, isCorrect: true }, { id: "b", text: "B", isStudentSelected: false, isCorrect: true }, { id: "c", text: "C", isStudentSelected: true, isCorrect: false }] },
  { id: "exact", sequenceNumber: 3, text: "Exact", type: "NUMERICAL", marks: 2, status: "UNANSWERED", correctAnswerText: "0", numericalEvaluation: { mode: "EXACT", exactVal: 0 } },
  { id: "range", sequenceNumber: 4, text: "Range", type: "NUMERICAL", marks: 1, status: "UNANSWERED", correctAnswerText: "1 to 2", numericalEvaluation: { mode: "RANGE", minVal: 1, maxVal: 2 } },
];
describe("personal practice grading and answer privacy", () => {
  it("omits every key from serialized initial data while retaining submitted responses", () => {
    const safe = hideAnswerKeys({ allowed: true, questions });
    const json = JSON.stringify(safe);
    for (const key of ["isCorrect", "correctAnswerText", "numericalEvaluation"]) assert.equal(json.includes(key), false);
    assert.equal(safe.questions?.[0].options?.[0].isStudentSelected, true);
    assert.equal(questions[0].options?.[0].isCorrect, true);
  });
  it("grades MCQ, exact MSQ sets, zero and inclusive numeric ranges", () => {
    const result = gradePractice(questions, { mcq: "a", msq: ["b", "a"], exact: 0, range: "2" });
    assert.deepEqual(result.map(q => q.status), ["CORRECT", "CORRECT", "CORRECT", "CORRECT"]);
    assert.equal(result.reduce((sum, q) => sum + q.marksAwarded!, 0), 8);
    assert.equal(result[2].studentAnswerText, "0");
  });
  it("does not award partial MSQ credit or reuse the original exam response", () => {
    const result = gradePractice(questions, { mcq: "b", msq: ["a"], range: 2.01 });
    assert.deepEqual(result.map(q => q.status), ["INCORRECT", "INCORRECT", "UNANSWERED", "INCORRECT"]);
    assert.equal(result[0].options?.[0].isStudentSelected, false);
    assert.equal(result[0].options?.[1].isStudentSelected, true);
    assert.equal(result.reduce((sum, q) => sum + q.marksAwarded!, 0), 0);
  });
  it("treats cleared values as unanswered and never mistakes them for zero", () => {
    const result = gradePractice(questions, { mcq: null, msq: [], exact: "", range: null });
    assert.ok(result.every(q => q.status === "UNANSWERED"));
  });
  it("rejects invalid question IDs, options, shapes and nonfinite numerical inputs", () => {
    const invalid: ExamResponses[] = [{ other: "a" }, { mcq: "foreign" }, { msq: "a" }, { exact: "NaN" }, { exact: Infinity }, { exact: [] }, { exact: "  " }];
    for (const response of invalid) {
      assert.throws(() => gradePractice(questions, response));
    }
  });
});

describe("test and production paper release rules", () => {
  it("unlocks evaluated tests immediately, including when retakes remain live", () => {
    assert.equal(reviewBlockedReason(true, "Evaluated", "Live"), undefined);
  });
  it("keeps production locked until Completed or Archived even after evaluation", () => {
    for (const state of ["Draft", "Scheduled", "Live"]) assert.ok(reviewBlockedReason(false, "Evaluated", state));
    for (const state of ["Completed", "Archived"]) assert.equal(reviewBlockedReason(false, "Evaluated", state), undefined);
  });
  it("requires an evaluated result for both assignment types, including closed exams", () => {
    for (const isTest of [true, false]) for (const status of ["Pending Review", "", "Submitted"]) {
      assert.ok(reviewBlockedReason(isTest, status, "Completed"));
    }
  });
});
