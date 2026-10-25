// Requires a running local Supabase stack and app (default http://localhost:3001).
// Run: node --env-file=.env.local scripts/test_question_authoring_local.mjs
// Only loopback endpoints are accepted. All created fixtures are removed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const appUrl = process.env.QUESTION_TEST_APP_URL || "http://localhost:3001";
for (const url of [supabaseUrl, appUrl]) {
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname), "This test only runs against local services.");
}
const config = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, config);
const client = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, config);
const id = randomUUID();
const email = `question-regression-${id}@sst.scaler.com`;
const password = randomUUID();
const storagePath = `authored/${id}/diagram.png`;
const importedPath = `papers/${id}/diagram.png`;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNXkAAAAASUVORK5CYII=", "base64");
let userId;
let paperId;
function checked(result) { if (result.error) throw new Error(result.error.message); return result.data; }
try {
  const created = checked(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Temporary image regression" } }));
  userId = created.user.id;
  checked(await service.from("users").update({ role: "admin" }).eq("id", userId));
  const signedIn = checked(await client.auth.signInWithPassword({ email, password }));
  const headers = { Authorization: `Bearer ${signedIn.session.access_token}` };

  checked(await client.storage.from("question_assets").upload(storagePath, png, { contentType: "image/png" }));
  checked(await client.storage.from("question_assets").upload(importedPath, png, { contentType: "image/png" }));
  for (const path of [storagePath, importedPath]) {
    const response = await fetch(`${appUrl}/api/assets/${path}`, { headers });
    assert.equal(response.status, 200, `Preview rejected ${path}: ${await response.clone().text()}`);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  }
  assert.equal((await fetch(`${appUrl}/api/assets/${storagePath}`)).status, 401);
  assert.equal((await fetch(`${appUrl}/api/assets/unsupported/${id}.png`, { headers })).status, 400);

  const subject = checked(await service.from("subjects").select("id").limit(1).single());
  const assessment = checked(await service.from("assessment_types").select("id").limit(1).single());
  paperId = checked(await service.from("paper_set_templates").insert({ subject_id: subject.id, assessment_type_id: assessment.id, title: `Temporary question regression ${id}` }).select("id").single()).id;
  const section = checked(await service.from("section_templates").insert({ paper_set_id: paperId, title: "Temporary section" }).select("id").single());
  const image = { storage_path: storagePath, display_width: 320, width: 1, height: 1 };
  const payload = { paper_set_id: paperId, section_id: section.id, type: "MCQ", text: "", marks: 1, image_assets: [image], options: [
    { text: "", sequence: 1, image_assets: [image], is_correct: true },
    { text: "Text answer", sequence: 2, is_correct: false },
  ] };
  const saved = checked(await client.rpc("save_question_template", { p_payload: payload }));
  assert.equal(saved.success, true);
  const reopened = checked(await client.from("question_templates").select("text,image_assets,option_templates(text,image_assets)").eq("id", saved.id).single());
  assert.equal(reopened.text, "");
  assert.equal(reopened.image_assets[0].display_width, 320);
  assert.ok(reopened.option_templates.some((option) => option.text === "" && option.image_assets[0].storage_path === storagePath));
  const signedImage = checked(await client.storage.from("question_assets").createSignedUrl(storagePath, 60));
  const cdn = await fetch(signedImage.signedUrl);
  assert.equal(cdn.status, 200);
  assert.deepEqual(Buffer.from(await cdn.arrayBuffer()), png);
  console.log("PASS: authenticated uploads, authored/imported preview bytes, auth/path guards, image-only RPC creation, reopening/sizing, and signed CDN delivery.");
} finally {
  if (paperId) checked(await service.from("paper_set_templates").delete().eq("id", paperId));
  checked(await service.storage.from("question_assets").remove([storagePath, importedPath]));
  if (userId) checked(await service.auth.admin.deleteUser(userId));
  console.log("Temporary local fixtures removed.");
}
