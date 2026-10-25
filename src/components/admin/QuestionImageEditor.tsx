"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { displayWidth, imageAssets, MAX_IMAGE_WIDTH, MIN_IMAGE_WIDTH, QuestionImageAsset } from "@/lib/question-images";
import { QuestionImages } from "@/components/exam/QuestionImages";

function ImageWidthInput({ width, label, onChange }: { width: number; label: string; onChange: (width: number) => void }) {
  const [edit, setEdit] = useState<{ width: number; value: string } | null>(null);
  const draft = edit?.width === width ? edit.value : String(width);
  return <input aria-label={label} type="number" min={MIN_IMAGE_WIDTH} max={MAX_IMAGE_WIDTH} value={draft}
    className="w-20 rounded border p-1" onBlur={() => setEdit(null)}
    onChange={(event) => {
      const value = Number(event.target.value);
      const valid = Number.isInteger(value) && value >= MIN_IMAGE_WIDTH && value <= MAX_IMAGE_WIDTH;
      setEdit({ width: valid ? value : width, value: event.target.value });
      if (valid) onChange(value);
    }} />;
}

export function QuestionImageEditor({ value, onChange, paperId, label, onBusyChange, onUploaded }: {
  value: unknown; onChange: (assets: QuestionImageAsset[]) => void; paperId: string; label: string;
  onBusyChange: (busy: boolean) => void; onUploaded: (path: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewUrls = useRef(new Set<string>());
  useEffect(() => () => { previewUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  const assets = imageAssets(value);
  async function upload(file: File) {
    setBusy(true); onBusyChange(true); setError("");
    try {
      const { prepareQuestionImage } = await import("@/lib/question-images/prepare");
      const { blob, width, height } = await prepareQuestionImage(file);
      const supabase = createClient();
      const path = `authored/${paperId}/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}`;
      const { error: uploadError } = await supabase.storage.from("question_assets").upload(path, blob, {
        contentType: file.type, cacheControl: "31536000", upsert: false,
      });
      if (uploadError) throw uploadError;
      const preview = URL.createObjectURL(blob);
      previewUrls.current.add(preview);
      setPreviews((current) => ({ ...current, [path]: preview }));
      onUploaded(path);
      onChange([...assets, { storage_path: path, width, height, display_width: Math.min(600, Math.max(MIN_IMAGE_WIDTH, width)), alt: "" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed. Try again.");
    } finally { setBusy(false); onBusyChange(false); }
  }
  return <div className="min-w-0 space-y-3 rounded border border-slate-200 dark:border-slate-700 p-3">
    <label className="block text-sm font-medium">{assets.length ? "Add another image" : "Upload image"}
      <input type="file" accept="image/png,image/jpeg" disabled={busy || assets.length >= 12}
        aria-label={`${label} upload`} className="mt-2 block w-full text-xs" onChange={(event) => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
          if (file) void upload(file);
        }} />
    </label>
    <p className="text-xs text-slate-500">PNG or JPG · up to 10 MB. Images shrink to fit smaller screens.</p>
    {busy && <p role="status">Optimizing and uploading image…</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {assets.map((asset, index) => {
      const width = displayWidth(asset) ?? Math.min(600, asset.width || 600);
      const update = (patch: Partial<QuestionImageAsset>) => onChange(assets.map((a, i) => i === index ? { ...a, ...patch } : a));
      return <div key={asset.storage_path || asset.url || index} className="min-w-0 space-y-2 border-t border-slate-200 dark:border-slate-700 pt-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label>Size (px) <ImageWidthInput width={width} label={`${label} ${index + 1} width`} onChange={(value) => update({ display_width: value })} /></label>
          <input aria-label={`${label} ${index + 1} size`} type="range" min={MIN_IMAGE_WIDTH} max={MAX_IMAGE_WIDTH} step="1" value={width} onChange={(e) => update({ display_width: Number(e.target.value) })} />
          <span>{width}px{asset.width && asset.height ? ` × ${Math.round(width * asset.height / asset.width)}px` : " (height automatic)"}</span>
          <button type="button" className="text-red-600 underline" onClick={() => onChange(assets.filter((_, i) => i !== index))}>Remove image</button>
        </div>
        <details className="text-xs"><summary className="cursor-pointer text-slate-500">Image description (optional)</summary>
          <input aria-label={`${label} ${index + 1} description`} value={asset.alt || ""} onChange={(e) => update({ alt: e.target.value })} className="mt-1 rounded border p-1" />
        </details>
        <QuestionImages assets={[{ ...asset, url: (asset.storage_path && previews[asset.storage_path]) || asset.url }]} admin label={label} />
      </div>;
    })}
  </div>;
}
