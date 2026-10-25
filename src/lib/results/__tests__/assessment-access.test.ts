import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignmentLabel, canAccessAssignment } from "@/lib/assessment-access";

describe("student and tester assignment access", () => {
  it("limits students to their exam assignment type, including inconsistent legacy flags", () => {
    assert.equal(canAccessAssignment("student", "PRODUCTION"), true);
    assert.equal(canAccessAssignment("student", "TEST"), false);
    assert.equal(canAccessAssignment("student", "PRODUCTION", true), false);
    assert.equal(canAccessAssignment("student", ""), false);
    assert.equal(canAccessAssignment("unknown", "PRODUCTION"), false);
  });
  it("allows testers to use both assignment types", () => {
    for (const role of ["tester", "admin"]) {
      assert.equal(canAccessAssignment(role, "PRODUCTION"), true);
      assert.equal(canAccessAssignment(role, "TEST", true), true);
    }
  });
  it("uses normal exam language for students and distinct labels for testers", () => {
    assert.equal(assignmentLabel(false, false), "Exam");
    assert.equal(assignmentLabel(false, true), "Exam");
    assert.equal(assignmentLabel(true, false), "Production exam");
    assert.equal(assignmentLabel(true, true), "Test assignment");
  });
});
