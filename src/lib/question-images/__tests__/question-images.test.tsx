import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { displayWidth, editableImageAssets, imageAssets, isQuestionAssetPath, resolveImages, validateImageAssets } from "../index";
import { QuestionImages } from "../../../components/exam/QuestionImages";
import { prepareQuestionImage } from "../prepare";

describe("Question and option images", () => {
  it("preserves imported metadata and materializes the editor preview width", () => {
    const asset = { storage_path: "import/diagram.png", page_number: 4, custom: { crop: true } };
    assert.deepEqual(editableImageAssets(asset), [{ ...asset, display_width: 600 }]);
    assert.deepEqual(editableImageAssets({ ...asset, display_width: 123 })[0].display_width, 123);
    assert.equal(imageAssets(null).length, 0);
    assert.equal(imageAssets([]).length, 0);
    assert.deepEqual(imageAssets("import/old.png"), [{ storage_path: "import/old.png" }]);
  });

  it("accepts authored and imported preview paths while rejecting unsafe paths", () => {
    assert.equal(isQuestionAssetPath("authored/paper/diagram.png"), true);
    assert.equal(isQuestionAssetPath("papers/import/diagram.png"), true);
    for (const path of ["other/x.png", "authored/../x.png", "authored//x.png", "papers/%2e%2e/x.png", "papers/./x.png", "papers/a%2fb.png"]) {
      assert.equal(isQuestionAssetPath(path), false, path);
    }
  });

  it("rejects invalid sizes, paths, protocols, and too many attachments", () => {
    for (const width of [0, 39, 1201, 60.5, Infinity, NaN, "300"]) {
      assert.ok(validateImageAssets([{ storage_path: "x.png", display_width: width }]));
    }
    for (const width of [40, 600, 1200]) assert.equal(validateImageAssets([{ storage_path: "x.png", display_width: width }]), null);
    assert.ok(validateImageAssets({ storage_path: "../x.png" }));
    assert.ok(validateImageAssets({ url: "javascript:alert(1)" }));
    assert.ok(validateImageAssets(Array.from({ length: 13 }, () => ({ storage_path: "x.png" }))));
    assert.ok(validateImageAssets([null]));
    assert.equal(validateImageAssets(null), null);
  });

  it("keeps widths attached to the correct signed URL when another image fails signing", () => {
    const original = [
      { storage_path: "missing.png", display_width: 100 },
      { storage_path: "good.png", display_width: 350, width: 700, height: 400 },
    ];
    const result = resolveImages(original, new Map([["good.png", "https://cdn.example/good.png?token=test"]]));
    assert.deepEqual(result, [{ ...original[1], url: "https://cdn.example/good.png?token=test" }]);
    assert.equal(original[1].display_width, 350);
    assert.equal("url" in original[1], false);
  });

  it("uses signed storage URLs ahead of stale URLs and supports external assets", () => {
    assert.equal(resolveImages({ storage_path: "x.png", url: "https://old.example/x" }, new Map([["x.png", "https://new.example/x"]]))[0].url, "https://new.example/x");
    assert.equal(resolveImages({ url: "https://external.example/x", display_width: 200 }, new Map())[0].display_width, 200);
    assert.deepEqual(resolveImages({ storage_path: "unsigned.png" }, new Map()), []);
  });

  it("renders the same pixel width in admin and student views with responsive proportional height", () => {
    const asset = { url: "https://cdn.example/x.png", display_width: 320, width: 800, height: 400, alt: "Graph" };
    const student = renderToStaticMarkup(<QuestionImages assets={[asset]} />);
    const admin = renderToStaticMarkup(<QuestionImages assets={[asset]} admin />);
    assert.equal(student, admin);
    assert.match(student, /width:320px;max-width:100%;height:auto/);
    assert.match(student, /width="800" height="400"/);
    assert.match(student, /alt="Graph"/);
    assert.match(renderToStaticMarkup(<QuestionImages assets={[asset]} option />), /width:320px/);
  });

  it("deduplicates group images and never exposes unsigned storage paths to students", () => {
    assert.doesNotMatch(renderToStaticMarkup(<QuestionImages assets={{ storage_path: "private/x.png" }} />), /<img/);
    assert.match(renderToStaticMarkup(<QuestionImages assets={{ storage_path: "private/x.png" }} admin />), /src="\/api\/assets\/private\/x.png"/);
    assert.doesNotMatch(renderToStaticMarkup(<QuestionImages assets={{ url: "https://cdn.example/x" }} exclude={["https://cdn.example/x"]} />), /<img/);
    assert.match(renderToStaticMarkup(<QuestionImages urls={["https://cdn.example/legacy"]} />), /legacy/);
    assert.equal(displayWidth({ display_width: -1 }), 40);
    assert.equal(displayWidth({ display_width: 9999 }), 1200);
  });

  it("rejects unsupported and oversized uploads before decoding", async () => {
    await assert.rejects(prepareQuestionImage(new File(["svg"], "x.svg", { type: "image/svg+xml" })), /PNG or JPEG/);
    await assert.rejects(prepareQuestionImage(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "x.png", { type: "image/png" })), /10 MB/);
  });

  it("resizes large uploads, preserves smaller original files, and releases decoded resources", async () => {
    const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const savedBitmap = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
    let closed = 0;
    let bitmapWidth = 3200;
    let bitmapHeight = 1600;
    let encodedSize = 5;
    let encoding = "";
    let contextAvailable = true;
    const canvas = {
      width: 0, height: 0,
      getContext: () => contextAvailable ? { drawImage: () => {} } : null,
      toBlob: (callback: (blob: Blob) => void, type: string) => {
        encoding = type;
        callback(new Blob([new Uint8Array(encodedSize)], { type }));
      },
    };
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
    Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: async () => ({
      width: bitmapWidth, height: bitmapHeight, close: () => { closed++; },
    }) });
    try {
      const png = new File([new Uint8Array(10)], "graph.png", { type: "image/png" });
      const resized = await prepareQuestionImage(png);
      assert.equal(resized.width, 1600);
      assert.equal(resized.height, 800);
      assert.equal(canvas.width, 1600);
      assert.equal(canvas.height, 800);
      assert.equal(encoding, "image/png");
      assert.equal(resized.blob.size, 5);
      bitmapWidth = 100; bitmapHeight = 50; encodedSize = 20;
      const jpeg = new File([new Uint8Array(10)], "x.jpg", { type: "image/jpeg" });
      const original = await prepareQuestionImage(jpeg);
      assert.equal(original.blob, jpeg);
      assert.equal(original.width, 100);
      assert.equal(encoding, "image/jpeg");
      contextAvailable = false;
      await assert.rejects(prepareQuestionImage(png), /unavailable/);
      assert.equal(closed, 3);
    } finally {
      if (savedDocument) Object.defineProperty(globalThis, "document", savedDocument);
      else Reflect.deleteProperty(globalThis, "document");
      if (savedBitmap) Object.defineProperty(globalThis, "createImageBitmap", savedBitmap);
      else Reflect.deleteProperty(globalThis, "createImageBitmap");
    }
  });

});
