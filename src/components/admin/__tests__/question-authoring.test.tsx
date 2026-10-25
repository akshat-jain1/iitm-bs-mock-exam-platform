import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { useState } from "react";
import { QuestionImageAsset } from "@/lib/question-images";
import type { QuestionSavePayload } from "@/app/(admin)/admin/question-bank/actions";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Node", "MutationObserver", "getComputedStyle"] as const) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === "window" ? dom.window : dom.window[name] });
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let testing: typeof import("@testing-library/react");
let setupUser: typeof import("@testing-library/user-event").default.setup;
let Editor: typeof import("../UnifiedQuestionEditor").UnifiedQuestionEditor;
let Content: typeof import("../QuestionContentEditor").QuestionContentEditor;
before(async () => {
  testing = await import("@testing-library/react");
  setupUser = (await import("@testing-library/user-event")).default.setup;
  Editor = (await import("../UnifiedQuestionEditor")).UnifiedQuestionEditor;
  Content = (await import("../QuestionContentEditor")).QuestionContentEditor;
});
afterEach(() => testing.cleanup());
after(() => dom.window.close());

const image = { storage_path: "authored/test/graph.png", width: 800, height: 400, display_width: 320 };
function ContentHarness() {
  const [text, setText] = useState("Original text");
  const [images, setImages] = useState<QuestionImageAsset[]>([]);
  return <Content label="Question" text={text} images={images} onTextChange={setText} onImagesChange={setImages}
    paperId="test" onBusyChange={() => {}} onUploaded={() => {}} />;
}

describe("Question authoring interactions", () => {
  it("defaults questions and answer options to plain text with advanced settings collapsed", () => {
    const view = testing.render(<Editor isOpen onClose={() => {}} onSave={async () => ({ success: true })} paperSetId="paper" sectionId="section" />);
    assert.ok(view.getByLabelText("Question text"));
    for (const letter of ["A", "B", "C", "D"]) assert.ok(view.getByLabelText(`Option ${letter} text`));
    assert.equal(view.queryByLabelText("Question upload"), null);
    assert.equal(view.queryByLabelText("Option A upload"), null);
    assert.equal(view.getByText(/More settings/).closest("details")?.open, false);
  });

  it("switches to image-only mode, offers optional text, and restores text when switching back", async () => {
    const user = setupUser({ document: dom.window.document });
    const view = testing.render(<ContentHarness />);
    await user.click(view.getByRole("button", { name: "Image" }));
    assert.ok(view.getByLabelText("Question upload"));
    assert.equal(view.queryByLabelText("Question text"), null);
    await user.click(view.getByRole("button", { name: "+ Add text (optional)" }));
    assert.equal((view.getByLabelText("Question text") as HTMLTextAreaElement).value, "Original text");
    await user.click(view.getByRole("button", { name: "Remove text" }));
    assert.equal(view.queryByLabelText("Question text"), null);
    await user.click(view.getByRole("button", { name: "Text" }));
    assert.equal((view.getByLabelText("Question text") as HTMLTextAreaElement).value, "Original text");
    assert.equal(view.queryByLabelText("Question upload"), null);
  });

  it("saves a new text question and its options through the editor", async () => {
    const user = setupUser({ document: dom.window.document });
    let saved: QuestionSavePayload | undefined;
    const view = testing.render(<Editor isOpen onClose={() => {}} onSave={async (payload) => { saved = payload; return { success: true }; }} paperSetId="paper" sectionId="section" />);
    await user.type(view.getByLabelText("Question text"), "What is 2 + 2?");
    for (const [index, letter] of ["A", "B", "C", "D"].entries()) await user.type(view.getByLabelText(`Option ${letter} text`), String(index + 4));
    await user.click(view.getByRole("button", { name: "Create Question" }));
    assert.equal(saved?.text, "What is 2 + 2?");
    assert.equal(saved?.options?.length, 4);
    assert.equal(saved?.options?.[0].is_correct, true);
  });

  it("previews authored images and saves an image-only question/option without requiring filler text", async () => {
    const user = setupUser({ document: dom.window.document });
    let saved: QuestionSavePayload | undefined;
    const view = testing.render(<Editor isOpen onClose={() => {}} onSave={async (payload) => { saved = payload; return { success: true }; }}
      paperSetId="paper" sectionId="section" initialQuestion={{ id: "question", type: "MCQ", text: "", marks: 1,
        image_assets: [image], options: [
          { id: "a", text: "", sequence: 1, is_correct: true, image_assets: [image] },
          { id: "b", text: "Text answer", sequence: 2, is_correct: false },
        ] }} />);
    const images = view.getAllByRole("img") as HTMLImageElement[];
    assert.equal(images.length, 2);
    assert.equal(images[0].getAttribute("src"), "/api/assets/authored/test/graph.png");
    assert.equal(images[0].style.width, "320px");
    await user.clear(view.getByLabelText("Question 1 width"));
    await user.type(view.getByLabelText("Question 1 width"), "480");
    assert.equal((view.getAllByRole("img")[0] as HTMLImageElement).style.width, "480px");
    await user.click(view.getByRole("button", { name: "Update Question" }));
    assert.equal(saved?.text, "");
    assert.equal((saved?.image_assets as QuestionImageAsset[])[0].display_width, 480);
    assert.equal(saved?.options?.[0].text, "");
    assert.equal((saved?.options?.[0].image_assets as QuestionImageAsset[])[0].display_width, 320);
  });

  it("uploads an image and immediately previews its bytes through a temporary object URL", async (context) => {
    const user = setupUser({ document: dom.window.document });
    const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const savedBitmap = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
    const canvasPrototype = dom.window.HTMLCanvasElement.prototype;
    const savedContext = Object.getOwnPropertyDescriptor(canvasPrototype, "getContext");
    const savedToBlob = Object.getOwnPropertyDescriptor(canvasPrototype, "toBlob");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://image-test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
    Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: async () => ({ width: 800, height: 400, close: () => {} }) });
    Object.defineProperty(canvasPrototype, "getContext", { configurable: true, value: () => ({ drawImage: () => {} }) });
    Object.defineProperty(canvasPrototype, "toBlob", { configurable: true, value: (callback: (blob: Blob) => void) => callback(new Blob(["png"], { type: "image/png" })) });
    let uploadRequests = 0;
    context.mock.method(globalThis, "fetch", async () => {
      uploadRequests++;
      return Response.json({ Key: "question_assets/authored/test/image.png", Id: "upload" });
    });
    context.mock.method(URL, "createObjectURL", () => "blob:http://localhost:3000/image-preview");
    context.mock.method(URL, "revokeObjectURL", () => {});
    try {
      const view = testing.render(<ContentHarness />);
      await user.click(view.getByRole("button", { name: "Image" }));
      await user.upload(view.getByLabelText("Question upload"), new dom.window.File(["a sample png file"], "graph.png", { type: "image/png" }));
      const preview = await view.findByRole("img") as HTMLImageElement;
      assert.equal(preview.getAttribute("src"), "blob:http://localhost:3000/image-preview");
      assert.equal(preview.style.width, "600px");
      assert.equal(uploadRequests, 1);
      assert.equal(view.queryByRole("alert"), null);
      view.unmount();
      const { createClient } = await import("@/lib/supabase/client");
      await createClient().auth.dispose();
    } finally {
      if (envUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = envUrl;
      if (envKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = envKey;
      if (savedBitmap) Object.defineProperty(globalThis, "createImageBitmap", savedBitmap); else Reflect.deleteProperty(globalThis, "createImageBitmap");
      if (savedContext) Object.defineProperty(canvasPrototype, "getContext", savedContext);
      if (savedToBlob) Object.defineProperty(canvasPrototype, "toBlob", savedToBlob);
    }
  });

  it("shows a useful error for an empty image question", async () => {
    const user = setupUser({ document: dom.window.document });
    let saves = 0;
    const view = testing.render(<Editor isOpen onClose={() => {}} onSave={async () => { saves++; return { success: true }; }} paperSetId="paper" sectionId="section" />);
    await user.click(testing.within(view.getByRole("group", { name: "Question format" })).getByRole("button", { name: "Image" }));
    for (const letter of ["A", "B", "C", "D"]) await user.type(view.getByLabelText(`Option ${letter} text`), letter);
    await user.click(view.getByRole("button", { name: "Create Question" }));
    assert.ok(view.getByText("Add text or an image to the question."));
    assert.equal(saves, 0);
  });
});
