export interface QuestionImageAsset {
  id?: string;
  url?: string;
  storage_path?: string;
  display_width?: number;
  width?: number;
  height?: number;
  alt?: string;
  [key: string]: unknown;
}

export const MIN_IMAGE_WIDTH = 40;
export const MAX_IMAGE_WIDTH = 1200;

export function imageAssets(value: unknown): QuestionImageAsset[] {
  return (Array.isArray(value) ? value : value ? [value] : []).flatMap((item) => {
    if (typeof item === "string" && item.length > 0) {
      return /^https?:\/\//i.test(item) ? [{ url: item }] : [{ storage_path: item.replace(/^\/api\/assets\//, "") }];
    }
    if (!item || typeof item !== "object") return [];
    const asset = item as QuestionImageAsset;
    return typeof asset.storage_path === "string" || typeof asset.url === "string" ? [asset] : [];
  });
}

export function displayWidth(asset: QuestionImageAsset): number | undefined {
  const width = asset.display_width;
  return typeof width === "number" && Number.isFinite(width)
    ? Math.max(MIN_IMAGE_WIDTH, Math.min(MAX_IMAGE_WIDTH, Math.round(width)))
    : undefined;
}

// Keep each URL with its own metadata even if a different asset fails signing.
export function resolveImages(value: unknown, signedUrls: Map<string, string>): QuestionImageAsset[] {
  return imageAssets(value).flatMap((asset) => {
    const url = (asset.storage_path && signedUrls.get(asset.storage_path)) ||
      (asset.url && /^https?:\/\//i.test(asset.url) ? asset.url : undefined);
    return url ? [{ ...asset, url }] : [];
  });
}

export function validateImageAssets(value: unknown): string | null {
  if (value == null) return null;
  const list = Array.isArray(value) ? value : [value];
  if (list.length > 12) return "Use at most 12 images per question or option.";
  if (imageAssets(value).length !== list.length) return "Invalid image reference.";
  for (const asset of imageAssets(value)) {
    if (asset.display_width !== undefined &&
      (!Number.isInteger(asset.display_width) || asset.display_width < MIN_IMAGE_WIDTH || asset.display_width > MAX_IMAGE_WIDTH)) {
      return `Image width must be an integer between ${MIN_IMAGE_WIDTH} and ${MAX_IMAGE_WIDTH}px.`;
    }
    if (asset.url && !/^https?:\/\//i.test(asset.url)) return "Invalid image URL.";
    if (asset.storage_path && (asset.storage_path.startsWith("/") || asset.storage_path.split("/").includes(".."))) return "Invalid image path.";
  }
  return null;
}

/** Materialize defaults in editor state so the preview matches the saved paper. */
export function editableImageAssets(value: unknown): QuestionImageAsset[] {
  return imageAssets(value).map((asset) => ({
    ...asset,
    display_width: displayWidth(asset) ?? Math.max(MIN_IMAGE_WIDTH, Math.min(600, asset.width || 600)),
  }));
}

/** Imported papers and manually authored uploads share the same access checks. */
export function isQuestionAssetPath(path: string): boolean {
  return /^(papers|authored)\//.test(path) && !path.includes("..") && !path.includes("\\") &&
    path.split("/").every((segment) => segment.length > 0 && segment !== "." && !/%(?:2e|2f|5c)/i.test(segment));
}
