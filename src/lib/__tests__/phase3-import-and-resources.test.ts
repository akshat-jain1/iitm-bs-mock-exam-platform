import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ==============================================================================
// 1. PDF Import & File Size Validation Tests
// ==============================================================================

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB

function validatePdfUpload(file: { name: string; size: number; type?: string; buffer?: Buffer }) {
  if (!file) {
    return { valid: false, error: "Please upload a PDF file." };
  }
  if (file.size === 0) {
    return { valid: false, error: "The uploaded file is empty. Please upload a valid PDF document." };
  }
  const filename = file.name || "paper.pdf";
  if (!filename.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    return { valid: false, error: "Invalid file type. Only PDF files are supported." };
  }
  if (file.size > MAX_PDF_BYTES) {
    return { valid: false, error: "File exceeds 20MB size limit." };
  }
  if (file.size < 5) {
    return { valid: false, error: "Malformed PDF file: file is too small to be a valid PDF." };
  }
  if (file.buffer) {
    const header = file.buffer.subarray(0, 5).toString("ascii");
    if (!header.startsWith("%PDF")) {
      return { valid: false, error: "Malformed PDF file: missing PDF header signature (%PDF)." };
    }
  }
  return { valid: true };
}

describe("Phase 3: PDF Import Request Limits & Magic Header Validation", () => {
  it("TC-1: Accepts valid PDF exactly at 20MB limit", () => {
    const validHeader = Buffer.from("%PDF-1.7\n");
    const result = validatePdfUpload({
      name: "exam_paper.pdf",
      size: 20 * 1024 * 1024,
      type: "application/pdf",
      buffer: validHeader,
    });
    assert.strictEqual(result.valid, true);
  });

  it("TC-2: Rejects PDF that exceeds 20MB limit", () => {
    const result = validatePdfUpload({
      name: "oversized.pdf",
      size: 20 * 1024 * 1024 + 1,
      type: "application/pdf",
    });
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, "File exceeds 20MB size limit.");
  });

  it("TC-3: Rejects empty PDF file (0 bytes)", () => {
    const result = validatePdfUpload({
      name: "empty.pdf",
      size: 0,
      type: "application/pdf",
    });
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, "The uploaded file is empty. Please upload a valid PDF document.");
  });

  it("TC-4: Rejects file with non-PDF extension", () => {
    const result = validatePdfUpload({
      name: "document.docx",
      size: 1024,
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, "Invalid file type. Only PDF files are supported.");
  });

  it("TC-5: Rejects malformed PDF missing %PDF header signature", () => {
    const corruptedBuffer = Buffer.from("NOT_A_PDF_FILE_HEADER");
    const result = validatePdfUpload({
      name: "fake.pdf",
      size: corruptedBuffer.length,
      type: "application/pdf",
      buffer: corruptedBuffer,
    });
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, "Malformed PDF file: missing PDF header signature (%PDF).");
  });
});

// ==============================================================================
// 2. Resource Upload Validation & Content Sanity Tests
// ==============================================================================

const MAX_RESOURCE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_RESOURCE_EXTENSIONS = [".pdf", ".doc", ".docx", ".txt"] as const;

function validateResourceUpload(file: { name: string; size: number; buffer?: Buffer }) {
  if (file.size === 0) {
    return { valid: false, error: "Uploaded file is empty. Please select a valid document." };
  }
  if (file.size > MAX_RESOURCE_SIZE) {
    return { valid: false, error: "File exceeds 20MB size limit." };
  }
  const name = file.name || "";
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1) {
    return {
      valid: false,
      error: "Uploaded file has no extension. Allowed formats: .pdf, .docx, .doc, .txt",
    };
  }
  const ext = name.slice(lastDot).toLowerCase();
  if (!ALLOWED_RESOURCE_EXTENSIONS.includes(ext as (typeof ALLOWED_RESOURCE_EXTENSIONS)[number])) {
    return {
      valid: false,
      error: `Unsupported file format '${ext}'. Allowed formats: .pdf, .docx, .doc, .txt`,
    };
  }

  if (file.buffer) {
    const header = file.buffer.subarray(0, Math.min(512, file.buffer.length));
    if (ext === ".pdf") {
      if (header.length < 5 || !header.toString("ascii", 0, 5).startsWith("%PDF")) {
        return { valid: false, error: "Malformed PDF file: missing PDF header signature (%PDF)." };
      }
    } else if (ext === ".docx") {
      if (
        header.length < 4 ||
        header[0] !== 0x50 ||
        header[1] !== 0x4b ||
        header[2] !== 0x03 ||
        header[3] !== 0x04
      ) {
        return { valid: false, error: "Malformed DOCX file: missing document package signature." };
      }
    } else if (ext === ".doc") {
      if (
        header.length < 4 ||
        header[0] !== 0xd0 ||
        header[1] !== 0xcf ||
        header[2] !== 0x11 ||
        header[3] !== 0xe0
      ) {
        return { valid: false, error: "Malformed DOC file: missing document structure signature." };
      }
    } else if (ext === ".txt") {
      if (header.includes(0x00)) {
        return { valid: false, error: "Malformed text file: binary data detected in text file." };
      }
    }
  }

  return { valid: true };
}

describe("Phase 3: Academic Resource Upload Validation", () => {
  it("TC-6: Rejects unsupported file extensions (.exe, .png)", () => {
    const resExe = validateResourceUpload({ name: "malware.exe", size: 1024 });
    assert.strictEqual(resExe.valid, false);
    assert.strictEqual(resExe.error, "Unsupported file format '.exe'. Allowed formats: .pdf, .docx, .doc, .txt");

    const resPng = validateResourceUpload({ name: "diagram.png", size: 1024 });
    assert.strictEqual(resPng.valid, false);
    assert.strictEqual(resPng.error, "Unsupported file format '.png'. Allowed formats: .pdf, .docx, .doc, .txt");
  });

  it("TC-7: Rejects empty resource file", () => {
    const result = validateResourceUpload({ name: "notes.txt", size: 0 });
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, "Uploaded file is empty. Please select a valid document.");
  });

  it("TC-8: Rejects resource exceeding 20MB", () => {
    const result = validateResourceUpload({ name: "lecture.pdf", size: 20 * 1024 * 1024 + 1 });
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, "File exceeds 20MB size limit.");
  });

  it("TC-9: Validates DOCX ZIP header signature PK\\x03\\x04", () => {
    const validDocx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const resValid = validateResourceUpload({ name: "syllabus.docx", size: validDocx.length, buffer: validDocx });
    assert.strictEqual(resValid.valid, true);

    const invalidDocx = Buffer.from("plain text claiming to be docx");
    const resInvalid = validateResourceUpload({ name: "syllabus.docx", size: invalidDocx.length, buffer: invalidDocx });
    assert.strictEqual(resInvalid.valid, false);
    assert.strictEqual(resInvalid.error, "Malformed DOCX file: missing document package signature.");
  });

  it("TC-10: Validates TXT file sanity (rejects binary null bytes)", () => {
    const validTxt = Buffer.from("This is a plain text study guide with ASCII content.");
    const resValid = validateResourceUpload({ name: "guide.txt", size: validTxt.length, buffer: validTxt });
    assert.strictEqual(resValid.valid, true);

    const binaryTxt = Buffer.from([0x48, 0x65, 0x00, 0x6c, 0x6f]); // Contains null byte
    const resBinary = validateResourceUpload({ name: "binary.txt", size: binaryTxt.length, buffer: binaryTxt });
    assert.strictEqual(resBinary.valid, false);
    assert.strictEqual(resBinary.error, "Malformed text file: binary data detected in text file.");
  });
});

// ==============================================================================
// 3. Import Pipeline Persistence Reliability & Rollback Simulation
// ==============================================================================

interface MockDbJob {
  id: string;
  paper_set_id: string;
  status: "Extracting" | "Ready" | "Needs Review" | "Failed";
  error_message: string | null;
  extraction_metadata: Record<string, unknown>;
}

interface MockSection {
  id: string;
  paper_set_id: string;
  title: string;
}

interface MockQuestion {
  id: string;
  section_id: string;
  text: string;
}

interface MockOption {
  id: string;
  question_id: string;
  text: string;
}

interface MockEval {
  id: string;
  question_id: string;
  correct_option_id: string;
}

class MockImportPipeline {
  jobs: Map<string, MockDbJob> = new Map();
  sections: Map<string, MockSection> = new Map();
  questions: Map<string, MockQuestion> = new Map();
  options: Map<string, MockOption> = new Map();
  evals: Map<string, MockEval> = new Map();

  failAtStage: "none" | "section" | "question" | "node" | "option" | "eval" | "second_section" = "none";
  cleanupMode: "succeed" | "supabase_error" | "thrown_exception" = "succeed";
  cleanupErrorMessage: string = "Database timeout during section cleanup";
  jobUpdateFailureMode: "succeed" | "supabase_error" | "thrown_exception" | "missing_row" = "succeed";
  jobUpdateErrorMessage: string = "statement timeout updating paper_import_jobs";

  createJob(paperSetId: string): MockDbJob {
    const job: MockDbJob = {
      id: "job-1",
      paper_set_id: paperSetId,
      status: "Extracting",
      error_message: null,
      extraction_metadata: {},
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async executeImport({
    jobId,
    sectionsToInsert,
  }: {
    jobId: string;
    sectionsToInsert: Array<{
      title: string;
      questions: Array<{
        text: string;
        options: string[];
      }>;
    }>;
  }) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("Job not found");

    const createdSectionIds: string[] = [];
    let createdQuestionsCount = 0;
    let createdSectionsCount = 0;

    try {
      for (let sIdx = 0; sIdx < sectionsToInsert.length; sIdx++) {
        if (sIdx === 1 && this.failAtStage === "second_section") {
          throw new Error("DB Error: Unique constraint violation inserting Section 2");
        }
        if (this.failAtStage === "section") {
          throw new Error("DB Error: Connection timeout creating section");
        }

        const secId = `sec-${sIdx + 1}`;
        const sec: MockSection = {
          id: secId,
          paper_set_id: job.paper_set_id,
          title: sectionsToInsert[sIdx].title,
        };
        this.sections.set(secId, sec);
        createdSectionIds.push(secId);
        createdSectionsCount++;

        for (let qIdx = 0; qIdx < sectionsToInsert[sIdx].questions.length; qIdx++) {
          if (this.failAtStage === "question") {
            throw new Error("DB Error: Check constraint violation inserting question");
          }
          if (this.failAtStage === "node") {
            throw new Error("DB Error: Foreign key error inserting section content node");
          }

          const qId = `q-${secId}-${qIdx + 1}`;
          const q: MockQuestion = {
            id: qId,
            section_id: secId,
            text: sectionsToInsert[sIdx].questions[qIdx].text,
          };
          this.questions.set(qId, q);

          for (let optIdx = 0; optIdx < sectionsToInsert[sIdx].questions[qIdx].options.length; optIdx++) {
            if (this.failAtStage === "option") {
              throw new Error("DB Error: Option template insert error");
            }

            const optId = `opt-${qId}-${optIdx + 1}`;
            this.options.set(optId, {
              id: optId,
              question_id: qId,
              text: sectionsToInsert[sIdx].questions[qIdx].options[optIdx],
            });

            if (optIdx === 0) {
              if (this.failAtStage === "eval") {
                throw new Error("DB Error: Eval mapping constraint error");
              }
              this.evals.set(`eval-${qId}`, {
                id: `eval-${qId}`,
                question_id: qId,
                correct_option_id: optId,
              });
            }
          }
          createdQuestionsCount++;
        }
      }

      if (createdQuestionsCount === 0) {
        throw new Error("No valid questions could be persisted for this paper set.");
      }

      // Success: mark Ready
      job.status = "Ready";
      job.extraction_metadata = {
        total_questions: createdQuestionsCount,
        sections_created: createdSectionsCount,
      };
      return { success: true, count: createdQuestionsCount };
    } catch (err: unknown) {
      const originalMessage = err instanceof Error ? err.message : "Persistence failed.";

      let rollbackAttempted = false;
      let rollbackSucceeded = false;
      let cleanupError: string | null = null;

      if (createdSectionIds.length > 0) {
        rollbackAttempted = true;
        if (this.cleanupMode === "supabase_error") {
          // Supabase returns { error } without throwing
          rollbackSucceeded = false;
          cleanupError = this.cleanupErrorMessage;
        } else if (this.cleanupMode === "thrown_exception") {
          // Cleanup call throws an exception
          rollbackSucceeded = false;
          cleanupError = "Network connection terminated during cleanup RPC";
        } else {
          // Cleanup succeeds
          rollbackSucceeded = true;
          for (const sId of createdSectionIds) {
            this.sections.delete(sId);
            // Cascade delete child questions, options, evals
            for (const [qKey, qVal] of this.questions.entries()) {
              if (qVal.section_id === sId) {
                this.questions.delete(qKey);
                for (const [optKey, optVal] of this.options.entries()) {
                  if (optVal.question_id === qKey) this.options.delete(optKey);
                }
                for (const [evalKey, evalVal] of this.evals.entries()) {
                  if (evalVal.question_id === qKey) this.evals.delete(evalKey);
                }
              }
            }
          }
        }
      } else {
        rollbackAttempted = false;
        rollbackSucceeded = true;
      }

      let combinedErrorMessage = originalMessage;
      const failureMetadata: Record<string, unknown> = {
        failure_stage: "persistence",
        rollback_attempted: rollbackAttempted,
        rollback_succeeded: rollbackSucceeded,
      };

      if (rollbackAttempted && !rollbackSucceeded) {
        combinedErrorMessage = `${originalMessage} (Partial record rollback failed: ${cleanupError})`;
        failureMetadata.sections_created = createdSectionsCount;
        failureMetadata.unremoved_section_ids = createdSectionIds;
        failureMetadata.rollback_error = cleanupError;
      } else {
        failureMetadata.total_questions = 0;
        failureMetadata.sections_created = 0;
        failureMetadata.needs_review_count = 0;
      }

      let jobUpdateSucceeded = false;
      let jobUpdateError: string | null = null;

      if (this.jobUpdateFailureMode === "supabase_error") {
        jobUpdateSucceeded = false;
        jobUpdateError = this.jobUpdateErrorMessage;
      } else if (this.jobUpdateFailureMode === "thrown_exception") {
        jobUpdateSucceeded = false;
        jobUpdateError = "Connection reset by peer during job status update";
      } else if (this.jobUpdateFailureMode === "missing_row") {
        jobUpdateSucceeded = false;
        jobUpdateError = "Import job row with ID job-1 was not updated or not found";
      } else {
        jobUpdateSucceeded = true;
        job.status = "Failed";
        job.error_message = combinedErrorMessage;
        job.extraction_metadata = failureMetadata;
      }

      let returnedError = `Paper import failed: ${combinedErrorMessage}`;
      if (!jobUpdateSucceeded) {
        returnedError = `Paper import failed: ${combinedErrorMessage} (Job failure status update failed: ${jobUpdateError})`;
      }

      return { success: false, error: returnedError };
    }
  }
}

describe("Phase 3: Import Pipeline Persistence Reliability & Rollback", () => {
  it("TC-11: Marks job Ready when all inserts succeed", async () => {
    const pipeline = new MockImportPipeline();
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [
            { text: "Question 1", options: ["A", "B", "C", "D"] },
            { text: "Question 2", options: ["A", "B", "C", "D"] },
          ],
        },
      ],
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(job.status, "Ready");
    assert.strictEqual(pipeline.sections.size, 1);
    assert.strictEqual(pipeline.questions.size, 2);
    assert.strictEqual(pipeline.options.size, 8);
    assert.strictEqual(pipeline.evals.size, 2);
  });

  it("TC-12: Cleans up partial writes and marks job Failed when question insert fails", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "question";
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Question 1", options: ["A", "B"] }],
        },
      ],
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(job.status, "Failed");
    assert.match(job.error_message!, /Check constraint violation/);
    assert.strictEqual(pipeline.sections.size, 0); // Rolled back
    assert.strictEqual(pipeline.questions.size, 0);
  });

  it("TC-13: Cleans up partial writes when option insert fails", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "option";
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Question 1", options: ["A", "B"] }],
        },
      ],
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(job.status, "Failed");
    assert.strictEqual(pipeline.sections.size, 0);
    assert.strictEqual(pipeline.questions.size, 0);
    assert.strictEqual(pipeline.options.size, 0);
  });

  it("TC-14: Cleans up partial writes when eval mapping insert fails", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "eval";
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Question 1", options: ["A", "B"] }],
        },
      ],
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(job.status, "Failed");
    assert.strictEqual(pipeline.sections.size, 0);
    assert.strictEqual(pipeline.questions.size, 0);
    assert.strictEqual(pipeline.evals.size, 0);
  });

  it("TC-15: Rolls back Section 1 when Section 2 fails in multi-section paper", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "second_section";
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Question 1", options: ["A", "B"] }],
        },
        {
          title: "Section 2",
          questions: [{ text: "Question 2", options: ["C", "D"] }],
        },
      ],
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(job.status, "Failed");
    // All sections from this failed attempt are rolled back so retrying doesn't duplicate Section 1
    assert.strictEqual(pipeline.sections.size, 0);
    assert.strictEqual(pipeline.questions.size, 0);
    assert.strictEqual(pipeline.options.size, 0);
  });

  it("TC-16: Job is NEVER marked Ready when a persistence error occurs", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "node";
    const job = pipeline.createJob("paper-1");

    await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Q1", options: ["A"] }],
        },
      ],
    });

    assert.notStrictEqual(job.status, "Ready");
    assert.notStrictEqual(job.status, "Needs Review");
    assert.strictEqual(job.status, "Failed");
  });

  it("TC-16A: Cleanup succeeds after persistence failure (records rollback_succeeded: true and sections_created: 0)", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "question";
    pipeline.cleanupMode = "succeed";
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Question 1", options: ["A", "B"] }],
        },
      ],
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(job.status, "Failed");
    assert.strictEqual(job.extraction_metadata.rollback_attempted, true);
    assert.strictEqual(job.extraction_metadata.rollback_succeeded, true);
    assert.strictEqual(job.extraction_metadata.sections_created, 0);
    assert.strictEqual(job.extraction_metadata.total_questions, 0);
    assert.strictEqual(pipeline.sections.size, 0);
  });

  it("TC-16B: Cleanup returns Supabase { error } result without throwing (preserves original error, appends cleanup error, and does NOT claim sections_created: 0)", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "question";
    pipeline.cleanupMode = "supabase_error";
    pipeline.cleanupErrorMessage = "statement timeout deleting partial sections";
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Question 1", options: ["A", "B"] }],
        },
      ],
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(job.status, "Failed");
    assert.notStrictEqual(job.status, "Ready");
    assert.notStrictEqual(job.status, "Needs Review");
    // Original persistence error is preserved
    assert.match(job.error_message!, /Check constraint violation inserting question/);
    // Cleanup failure is reported in error_message
    assert.match(job.error_message!, /Partial record rollback failed: statement timeout deleting partial sections/);
    // Metadata does not falsely claim rollback succeeded or sections_created: 0
    assert.strictEqual(job.extraction_metadata.rollback_attempted, true);
    assert.strictEqual(job.extraction_metadata.rollback_succeeded, false);
    assert.strictEqual(job.extraction_metadata.rollback_error, "statement timeout deleting partial sections");
    assert.strictEqual(job.extraction_metadata.sections_created, 1);
    assert.deepStrictEqual(job.extraction_metadata.unremoved_section_ids, ["sec-1"]);
    // Partial sections remain because cleanup failed
    assert.strictEqual(pipeline.sections.size, 1);
  });

  it("TC-16C: Cleanup throws an exception (preserves original error, appends thrown exception, and does NOT claim rollback succeeded)", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "question";
    pipeline.cleanupMode = "thrown_exception";
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Question 1", options: ["A", "B"] }],
        },
      ],
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(job.status, "Failed");
    assert.notStrictEqual(job.status, "Ready");
    assert.notStrictEqual(job.status, "Needs Review");
    // Original persistence error is preserved
    assert.match(job.error_message!, /Check constraint violation inserting question/);
    // Cleanup failure is reported in error_message
    assert.match(job.error_message!, /Partial record rollback failed: Network connection terminated during cleanup RPC/);
    // Metadata truthfully reports failure
    assert.strictEqual(job.extraction_metadata.rollback_attempted, true);
    assert.strictEqual(job.extraction_metadata.rollback_succeeded, false);
    assert.strictEqual(job.extraction_metadata.rollback_error, "Network connection terminated during cleanup RPC");
    assert.strictEqual(job.extraction_metadata.sections_created, 1);
    assert.deepStrictEqual(job.extraction_metadata.unremoved_section_ids, ["sec-1"]);
    assert.strictEqual(pipeline.sections.size, 1);
  });

  it("TC-16D: Direct rollback handler captures Supabase { error } return value without throwing", async () => {
    let queriedTable = "";
    let queriedColumn = "";
    let queriedIds: string[] = [];

    const mockSupabase = {
      from: (table: string) => {
        queriedTable = table;
        return {
          delete: () => ({
            in: async (column: string, ids: string[]) => {
              queriedColumn = column;
              queriedIds = ids;
              return { error: { message: "permission denied for table section_templates" } };
            },
          }),
        };
      },
    };

    const outcome = await executeRollback(mockSupabase, ["sec-101", "sec-102"]);
    assert.strictEqual(outcome.attempted, true);
    assert.strictEqual(outcome.succeeded, false);
    assert.strictEqual(outcome.cleanupError, "permission denied for table section_templates");
    assert.strictEqual(queriedTable, "section_templates");
    assert.strictEqual(queriedColumn, "id");
    assert.deepStrictEqual(queriedIds, ["sec-101", "sec-102"]);
  });

  it("TC-16E: Direct rollback handler catches thrown exception during cleanup and does not crash", async () => {
    const mockSupabase = {
      from: () => ({
        delete: () => ({
          in: async () => {
            throw new Error("Socket disconnected unexpectedly");
          },
        }),
      }),
    };

    const outcome = await executeRollback(mockSupabase, ["sec-201"]);
    assert.strictEqual(outcome.attempted, true);
    assert.strictEqual(outcome.succeeded, false);
    assert.strictEqual(outcome.cleanupError, "Socket disconnected unexpectedly");
  });

  it("TC-16F: Direct rollback handler reports success when Supabase delete returns { error: null }", async () => {
    const mockSupabase = {
      from: () => ({
        delete: () => ({
          in: async () => {
            return { error: null };
          },
        }),
      }),
    };

    const outcome = await executeRollback(mockSupabase, ["sec-301"]);
    assert.strictEqual(outcome.attempted, true);
    assert.strictEqual(outcome.succeeded, true);
    assert.strictEqual(outcome.cleanupError, null);
  });

  it("TC-16G: Direct rollback handler returns safe no-op outcome when no section IDs were tracked", async () => {
    let called = false;
    const mockSupabase = {
      from: () => {
        called = true;
        return { delete: () => ({ in: async () => ({ error: null }) }) };
      },
    };

    const outcome = await executeRollback(mockSupabase, []);
    assert.strictEqual(outcome.attempted, false);
    assert.strictEqual(outcome.succeeded, true);
    assert.strictEqual(outcome.cleanupError, null);
    assert.strictEqual(called, false);
  });

  it("TC-16H: Job failure-status update succeeds and records failure status and metadata", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "question";
    pipeline.jobUpdateFailureMode = "succeed";
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Question 1", options: ["A", "B"] }],
        },
      ],
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(job.status, "Failed");
    assert.strictEqual(job.error_message, "DB Error: Check constraint violation inserting question");
    assert.strictEqual(job.extraction_metadata.rollback_succeeded, true);
    assert.strictEqual(job.extraction_metadata.sections_created, 0);
  });

  it("TC-16I: Job failure-status update returns Supabase { error } without throwing, preserves original error, reports update failure, and does not claim metadata saved", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "question";
    pipeline.jobUpdateFailureMode = "supabase_error";
    pipeline.jobUpdateErrorMessage = "connection pool exhausted during job status update";
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Question 1", options: ["A", "B"] }],
        },
      ],
    });

    assert.strictEqual(result.success, false);
    // Job in database was NOT updated to Failed because the update call failed
    assert.strictEqual(job.status, "Extracting");
    assert.deepStrictEqual(job.extraction_metadata, {});
    // Original persistence error is preserved
    assert.match(result.error!, /DB Error: Check constraint violation inserting question/);
    // Status update failure is reported
    assert.match(result.error!, /Job failure status update failed: connection pool exhausted during job status update/);
  });

  it("TC-16J: Job failure-status update throws exception, preserves original error, reports update failure, and does not claim metadata saved", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "question";
    pipeline.jobUpdateFailureMode = "thrown_exception";
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Question 1", options: ["A", "B"] }],
        },
      ],
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(job.status, "Extracting");
    assert.deepStrictEqual(job.extraction_metadata, {});
    assert.match(result.error!, /DB Error: Check constraint violation inserting question/);
    assert.match(result.error!, /Job failure status update failed: Connection reset by peer during job status update/);
  });

  it("TC-16K: Preserves original persistence error, rollback failure, and job status update failure simultaneously", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "question";
    pipeline.cleanupMode = "supabase_error";
    pipeline.cleanupErrorMessage = "statement timeout deleting partial sections";
    pipeline.jobUpdateFailureMode = "supabase_error";
    pipeline.jobUpdateErrorMessage = "lock timeout updating paper_import_jobs";
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Question 1", options: ["A", "B"] }],
        },
      ],
    });

    assert.strictEqual(result.success, false);
    // 1. Original persistence failure preserved
    assert.match(result.error!, /DB Error: Check constraint violation inserting question/);
    // 2. Rollback cleanup failure diagnostic preserved
    assert.match(result.error!, /Partial record rollback failed: statement timeout deleting partial sections/);
    // 3. Job status update failure diagnostic reported
    assert.match(result.error!, /Job failure status update failed: lock timeout updating paper_import_jobs/);
    // Database job status was not updated
    assert.strictEqual(job.status, "Extracting");
  });

  it("TC-16L: Direct job failure update helper captures Supabase { error } without throwing", async () => {
    let queriedTable = "";
    let queriedValues: Record<string, unknown> = {};
    let queriedId = "";

    const mockSupabase = {
      from: (table: string) => {
        queriedTable = table;
        return {
          update: (values: Record<string, unknown>) => {
            queriedValues = values;
            return {
              eq: (column: string, id: string) => {
                queriedId = id;
                return {
                  select: () => ({
                    single: async () => ({ data: null, error: { message: "statement timeout updating job" } }),
                  }),
                };
              },
            };
          },
        };
      },
    };

    const outcome = await executeJobFailureUpdate(mockSupabase, "job-99", "Failed due to schema err", { error: true });
    assert.strictEqual(outcome.succeeded, false);
    assert.strictEqual(outcome.updateError, "statement timeout updating job");
    assert.strictEqual(queriedTable, "paper_import_jobs");
    assert.strictEqual(queriedId, "job-99");
    assert.strictEqual(queriedValues.status, "Failed");
    assert.strictEqual(queriedValues.error_message, "Failed due to schema err");
  });

  it("TC-16M: Direct job failure update helper catches thrown exception and does not crash", async () => {
    const mockSupabase = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => {
                throw new Error("Network connection dropped");
              },
            }),
          }),
        }),
      }),
    };

    const outcome = await executeJobFailureUpdate(mockSupabase, "job-99", "Error", {});
    assert.strictEqual(outcome.succeeded, false);
    assert.strictEqual(outcome.updateError, "Network connection dropped");
  });

  it("TC-16N: Direct job failure update helper reports success when update returns valid matching row", async () => {
    const mockSupabase = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: "job-99" }, error: null }),
            }),
          }),
        }),
      }),
    };

    const outcome = await executeJobFailureUpdate(mockSupabase, "job-99", "Error", {});
    assert.strictEqual(outcome.succeeded, true);
    assert.strictEqual(outcome.updateError, null);
  });

  it("TC-16O: Direct job failure update helper treats missing updated row (error null but no matching row) as failure", async () => {
    const mockSupabase = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };

    const outcome = await executeJobFailureUpdate(mockSupabase, "job-99", "Error", {});
    assert.strictEqual(outcome.succeeded, false);
    assert.strictEqual(outcome.updateError, "Import job row with ID job-99 was not updated or not found");
  });

  it("TC-16P: Direct job failure update helper treats mismatched returned row ID as failure", async () => {
    const mockSupabase = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: "job-mismatched" }, error: null }),
            }),
          }),
        }),
      }),
    };

    const outcome = await executeJobFailureUpdate(mockSupabase, "job-99", "Error", {});
    assert.strictEqual(outcome.succeeded, false);
    assert.strictEqual(outcome.updateError, "Import job row with ID job-99 was not updated or not found");
  });

  it("TC-16Q: Pipeline with missing job row reports update failure and preserves previous job status", async () => {
    const pipeline = new MockImportPipeline();
    pipeline.failAtStage = "question";
    pipeline.jobUpdateFailureMode = "missing_row";
    const job = pipeline.createJob("paper-1");

    const result = await pipeline.executeImport({
      jobId: job.id,
      sectionsToInsert: [
        {
          title: "Section 1",
          questions: [{ text: "Question 1", options: ["A", "B"] }],
        },
      ],
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(job.status, "Extracting");
    assert.deepStrictEqual(job.extraction_metadata, {});
    assert.match(result.error!, /DB Error: Check constraint violation inserting question/);
    assert.match(result.error!, /Job failure status update failed: Import job row with ID job-1 was not updated or not found/);
  });
});

interface JobFailureUpdateOutcome {
  succeeded: boolean;
  updateError: string | null;
}

async function executeJobFailureUpdate(
  supabaseClient: {
    from: (table: string) => {
      update: (values: Record<string, unknown>) => {
        eq: (column: string, id: string) => {
          select: (columns: string) => {
            single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
          };
        };
      };
    };
  },
  jobId: string,
  errorMessage: string,
  metadata: Record<string, unknown>
): Promise<JobFailureUpdateOutcome> {
  try {
    const { data: updatedJob, error: updateError } = await supabaseClient
      .from("paper_import_jobs")
      .update({
        status: "Failed",
        error_message: errorMessage,
        extraction_metadata: metadata,
      })
      .eq("id", jobId)
      .select("id")
      .single();

    if (updateError) {
      return {
        succeeded: false,
        updateError: updateError.message,
      };
    }

    if (!updatedJob || updatedJob.id !== jobId) {
      return {
        succeeded: false,
        updateError: `Import job row with ID ${jobId} was not updated or not found`,
      };
    }

    return { succeeded: true, updateError: null };
  } catch (thrown: unknown) {
    const msg = thrown instanceof Error ? thrown.message : "Unexpected exception during job status update";
    return {
      succeeded: false,
      updateError: msg,
    };
  }
}

interface RollbackOutcome {
  attempted: boolean;
  succeeded: boolean;
  cleanupError: string | null;
}

async function executeRollback(
  supabaseClient: {
    from: (table: string) => {
      delete: () => {
        in: (column: string, ids: string[]) => Promise<{ error: { message: string } | null }>;
      };
    };
  },
  createdSectionIds: string[]
): Promise<RollbackOutcome> {
  if (createdSectionIds.length === 0) {
    return { attempted: false, succeeded: true, cleanupError: null };
  }

  try {
    const { error: deleteError } = await supabaseClient
      .from("section_templates")
      .delete()
      .in("id", createdSectionIds);

    if (deleteError) {
      return {
        attempted: true,
        succeeded: false,
        cleanupError: deleteError.message,
      };
    }

    return { attempted: true, succeeded: true, cleanupError: null };
  } catch (thrown: unknown) {
    const msg = thrown instanceof Error ? thrown.message : "Unexpected exception during cleanup";
    return {
      attempted: true,
      succeeded: false,
      cleanupError: msg,
    };
  }
}

// ==============================================================================
// 4. Resource Storage Upload & DB Metadata Failure Handling Tests
// ==============================================================================

class MockResourceStorageFlow {
  storageBuckets: Map<string, Map<string, Buffer>> = new Map();
  dbResources: Map<string, { id: string; title: string; storage_path: string | null }> = new Map();

  storageUploadFails = false;
  dbInsertFails = false;

  constructor() {
    this.storageBuckets.set("academic_resources", new Map());
  }

  async uploadResource({
    subjectId,
    title,
    filename,
    fileBuffer,
  }: {
    subjectId: string;
    title: string;
    filename: string;
    fileBuffer: Buffer;
  }) {
    let storagePath: string | null = null;

    if (fileBuffer) {
      if (this.storageUploadFails) {
        return { success: false, error: "Upload failed: S3 connection reset" };
      }

      storagePath = `${subjectId}/${Date.now()}_${filename}`;
      this.storageBuckets.get("academic_resources")!.set(storagePath, fileBuffer);
    }

    if (this.dbInsertFails) {
      // Rollback orphaned storage object
      if (storagePath) {
        this.storageBuckets.get("academic_resources")!.delete(storagePath);
      }
      return { success: false, error: "DB Error: resources constraint violation" };
    }

    const id = `res-${Date.now()}`;
    this.dbResources.set(id, { id, title, storage_path: storagePath });
    return { success: true, id };
  }
}

describe("Phase 3: Storage Upload and DB Metadata Atomicity", () => {
  it("TC-17: Returns error and creates no DB entry when storage upload fails", async () => {
    const flow = new MockResourceStorageFlow();
    flow.storageUploadFails = true;

    const result = await flow.uploadResource({
      subjectId: "subj-1",
      title: "Lecture Notes",
      filename: "notes.pdf",
      fileBuffer: Buffer.from("%PDF-1.7"),
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error!, /Upload failed/);
    assert.strictEqual(flow.dbResources.size, 0);
  });

  it("TC-18: Removes storage object when DB metadata insert fails (no orphaned files)", async () => {
    const flow = new MockResourceStorageFlow();
    flow.dbInsertFails = true;

    const result = await flow.uploadResource({
      subjectId: "subj-1",
      title: "Lecture Notes",
      filename: "notes.pdf",
      fileBuffer: Buffer.from("%PDF-1.7"),
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error!, /DB Error/);
    assert.strictEqual(flow.dbResources.size, 0);
    // Storage object was cleaned up
    assert.strictEqual(flow.storageBuckets.get("academic_resources")!.size, 0);
  });

  it("TC-19: Succeeds and retains storage object when both storage and DB insert succeed", async () => {
    const flow = new MockResourceStorageFlow();

    const result = await flow.uploadResource({
      subjectId: "subj-1",
      title: "Lecture Notes",
      filename: "notes.pdf",
      fileBuffer: Buffer.from("%PDF-1.7"),
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(flow.dbResources.size, 1);
    assert.strictEqual(flow.storageBuckets.get("academic_resources")!.size, 1);
  });
});

// ==============================================================================
// 5. Download Filename, MIME Type, and Header Security Tests
// ==============================================================================

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".txt": "text/plain; charset=utf-8",
};

function resolveDownloadHeaders({
  resource,
  buffer,
  isDownloadParam,
}: {
  resource: { title: string; storage_path: string; is_published: boolean };
  buffer: Buffer;
  isDownloadParam?: boolean;
}) {
  // Validate path traversal
  if (
    resource.storage_path.includes("..") ||
    resource.storage_path.startsWith("/") ||
    !/^[a-zA-Z0-9_\-\/.]+$/.test(resource.storage_path)
  ) {
    throw new Error("Invalid storage path");
  }

  const lastDot = resource.storage_path.lastIndexOf(".");
  const pathExt = lastDot !== -1 ? resource.storage_path.slice(lastDot).toLowerCase() : "";

  let resolvedExt = pathExt in MIME_MAP ? pathExt : "";
  if (!resolvedExt) {
    if (buffer.length >= 5 && buffer.toString("ascii", 0, 5).startsWith("%PDF")) {
      resolvedExt = ".pdf";
    } else if (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    ) {
      resolvedExt = ".docx";
    } else if (
      buffer.length >= 4 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0
    ) {
      resolvedExt = ".doc";
    }
  }

  const contentType = MIME_MAP[resolvedExt] || "application/octet-stream";

  let cleanTitle = (resource.title || "resource")
    .replace(/[\x00-\x1F\x7F\r\n]/g, "")
    .replace(/[/\\]/g, "_")
    .replace(/"/g, "'")
    .trim();

  if (!cleanTitle) cleanTitle = "resource";

  let finalFilename: string;
  if (resolvedExt && cleanTitle.toLowerCase().endsWith(resolvedExt)) {
    finalFilename = cleanTitle;
  } else if (resolvedExt) {
    finalFilename = `${cleanTitle}${resolvedExt}`;
  } else {
    finalFilename = cleanTitle;
  }

  const safeAsciiFilename = finalFilename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, '\\"');
  const safeUtf8Filename = encodeURIComponent(finalFilename);

  const dispositionType = isDownloadParam ? "attachment" : "inline";
  const contentDisposition = `${dispositionType}; filename="${safeAsciiFilename}"; filename*=UTF-8''${safeUtf8Filename}`;

  return {
    contentType,
    contentDisposition,
    finalFilename,
  };
}

describe("Phase 3: Download Headers, Filename Sanitization, and Path Safety", () => {
  it("TC-20: Correct download filename and MIME type for PDF", () => {
    const headers = resolveDownloadHeaders({
      resource: {
        title: "Mathematics Syllabus",
        storage_path: "sub-1/1700000000_syllabus.pdf",
        is_published: true,
      },
      buffer: Buffer.from("%PDF-1.7"),
    });

    assert.strictEqual(headers.contentType, "application/pdf");
    assert.strictEqual(headers.finalFilename, "Mathematics Syllabus.pdf");
    assert.match(headers.contentDisposition, /filename="Mathematics Syllabus\.pdf"/);
  });

  it("TC-21: Correct download filename and MIME type for DOCX (does NOT append .pdf)", () => {
    const docxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const headers = resolveDownloadHeaders({
      resource: {
        title: "Assignment Guide",
        storage_path: "sub-1/1700000000_guide.docx",
        is_published: true,
      },
      buffer: docxHeader,
    });

    assert.strictEqual(headers.contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.strictEqual(headers.finalFilename, "Assignment Guide.docx");
    assert.doesNotMatch(headers.finalFilename, /\.pdf$/);
    assert.match(headers.contentDisposition, /filename="Assignment Guide\.docx"/);
  });

  it("TC-22: Correct download filename and MIME type for TXT (does NOT append .pdf)", () => {
    const headers = resolveDownloadHeaders({
      resource: {
        title: "Quick Formula Sheet",
        storage_path: "sub-1/1700000000_sheet.txt",
        is_published: true,
      },
      buffer: Buffer.from("Formula: E=mc^2"),
    });

    assert.strictEqual(headers.contentType, "text/plain; charset=utf-8");
    assert.strictEqual(headers.finalFilename, "Quick Formula Sheet.txt");
    assert.doesNotMatch(headers.finalFilename, /\.pdf$/);
    assert.match(headers.contentDisposition, /filename="Quick Formula Sheet\.txt"/);
  });

  it("TC-23: Does not duplicate extension if title already contains it", () => {
    const headers = resolveDownloadHeaders({
      resource: {
        title: "LabReport.docx",
        storage_path: "sub-1/1700000000_report.docx",
        is_published: true,
      },
      buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    });

    assert.strictEqual(headers.finalFilename, "LabReport.docx");
    assert.notStrictEqual(headers.finalFilename, "LabReport.docx.docx");
  });

  it("TC-24: Sanitizes dangerous characters, double-quotes and newlines in filenames", () => {
    const headers = resolveDownloadHeaders({
      resource: {
        title: 'Exam "Questions" / Part 1\r\n',
        storage_path: "sub-1/1700000000_exam.pdf",
        is_published: true,
      },
      buffer: Buffer.from("%PDF-1.7"),
    });

    // Slashes and control chars removed, double quotes replaced
    assert.doesNotMatch(headers.finalFilename, /[\r\n/]/);
    assert.strictEqual(headers.finalFilename, "Exam 'Questions' _ Part 1.pdf");
    assert.match(headers.contentDisposition, /filename="Exam 'Questions' _ Part 1\.pdf"/);
  });

  it("TC-25: Rejects path traversal attempts in storage_path", () => {
    assert.throws(() => {
      resolveDownloadHeaders({
        resource: {
          title: "Secret",
          storage_path: "../../etc/passwd",
          is_published: true,
        },
        buffer: Buffer.from("data"),
      });
    }, /Invalid storage path/);

    assert.throws(() => {
      resolveDownloadHeaders({
        resource: {
          title: "Root File",
          storage_path: "/var/log/secret.pdf",
          is_published: true,
        },
        buffer: Buffer.from("data"),
      });
    }, /Invalid storage path/);
  });

  it("TC-26: Supports attachment disposition when download parameter is set", () => {
    const headers = resolveDownloadHeaders({
      resource: {
        title: "Notes",
        storage_path: "sub-1/1700000000_notes.pdf",
        is_published: true,
      },
      buffer: Buffer.from("%PDF-1.7"),
      isDownloadParam: true,
    });

    assert.match(headers.contentDisposition, /^attachment;/);
  });
});
