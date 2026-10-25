import { displayWidth, imageAssets, QuestionImageAsset } from "@/lib/question-images";

export function QuestionImages({ assets, urls, admin = false, exclude = [], label = "Diagram", option = false }: {
  assets?: unknown; urls?: string[]; admin?: boolean; exclude?: string[]; label?: string; option?: boolean;
}) {
  const list = imageAssets(assets);
  const images: QuestionImageAsset[] = list.length ? list : (urls || []).map((url) => ({ url }));
  return <div className="space-y-3 min-w-0">{images.map((asset, index) => {
    const src = asset.url || (admin && asset.storage_path ? `/api/assets/${asset.storage_path.split("/").map(encodeURIComponent).join("/")}` : "");
    if (!src || exclude.includes(src)) return null;
    const width = displayWidth(asset);
    return <div key={asset.id || index}>
      {/* CDN URLs already optimize delivery; avoid a second image proxy. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={asset.alt || `${label} ${index + 1}`} decoding="async"
        width={asset.width} height={asset.height}
        style={{ width: width ? `${width}px` : undefined, maxWidth: "100%", height: "auto" }}
        className={`block rounded border border-border bg-white object-contain ${width ? "" : option ? "w-auto sm:max-w-xl" : "w-full max-w-3xl"}`} />
    </div>;
  })}</div>;
}
