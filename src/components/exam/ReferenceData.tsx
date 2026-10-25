import { MathText } from "./MathText";
import type { ReferenceMaterial, ReferenceSection, ReferenceItem } from "@/lib/types/exam";

export interface ExtendedReferenceMaterial {
  title?: string;
  sections?: ReferenceSection[];
  content?: string;
  assets?: Array<{ storage_path?: string; url?: string }>;
}

interface ReferenceDataProps {
  data: ReferenceMaterial | ExtendedReferenceMaterial;
}

function renderItem(item: ReferenceItem, idx: number) {
  switch (item.type) {
    case "text":
      return (
        <div key={idx} className="mb-2 last:mb-0 leading-relaxed text-sm text-slate-700 dark:text-slate-200">
          <MathText text={item.content} />
        </div>
      );
    case "list":
      return (
        <ul key={idx} className="list-disc pl-5 mb-2 last:mb-0 text-sm text-slate-700 dark:text-slate-200 space-y-1">
          {item.items.map((li, i) => (
            <li key={i}>
              <MathText text={li} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div key={idx} className="overflow-x-auto my-3 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
              <tr>
                {item.headers.map((h, i) => (
                  <th key={i} className="px-4 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {item.rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-4 py-2 text-slate-700 dark:text-slate-200">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "image":
      return (
        <div key={idx} className="my-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={item.alt || "Reference Image"}
            loading="lazy"
            decoding="async"
            className="max-w-full h-auto rounded border border-slate-200 dark:border-slate-700 shadow-sm object-contain bg-white"
          />
        </div>
      );
    default:
      return null;
  }
}

export function ReferenceData({ data }: ReferenceDataProps) {
  if (!data) return null;
  const ext = data as ExtendedReferenceMaterial;
  const hasSections = Array.isArray(ext.sections) && ext.sections.length > 0;
  const hasContent = Boolean(ext.content && ext.content.trim().length > 0);
  const hasAssets = Boolean(Array.isArray(ext.assets) && ext.assets.length > 0);

  if (!hasSections && !hasContent && !hasAssets) return null;

  const displayTitle = ext.title || "Useful Data / Reference Material";

  return (
    <div className="mb-4 bg-blue-50/40 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/60 rounded-md shadow-sm overflow-hidden font-sans">
      <details className="group" open>
        <summary className="cursor-pointer py-3 px-5 text-sm font-semibold text-blue-900 dark:text-blue-200 flex items-center select-none bg-blue-100/30 dark:bg-blue-900/30 hover:bg-blue-100/50 dark:hover:bg-blue-900/50 transition-colors">
          <span className="mr-2 text-base">ℹ️</span> 
          {displayTitle}
          <span className="ml-auto transition-transform duration-200 group-open:rotate-180 opacity-70">▼</span>
        </summary>
        <div className="p-5 pt-3 border-t border-blue-200/50 dark:border-blue-800/50 bg-white/50 dark:bg-slate-900/50 max-h-[500px] overflow-y-auto space-y-4">
          {hasContent && (
            <div className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed font-sans">
              <MathText text={ext.content!} />
            </div>
          )}

          {hasAssets && (
            <div className="space-y-4 pt-1">
              {ext.assets!.map((ast, aIdx) => {
                const src = ast.url || "";
                if (!src) return null;
                return (
                  <div key={aIdx} className="overflow-x-auto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Reference Diagram ${aIdx + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="max-w-3xl w-full h-auto rounded border border-slate-200 dark:border-slate-700 shadow-sm object-contain bg-white"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {hasSections &&
            ext.sections!.map((sec: ReferenceSection, sIdx: number) => (
              <div key={sIdx} className="mb-6 last:mb-0">
                <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-2 pb-1 border-b border-slate-200/60 dark:border-slate-700/60 text-sm tracking-tight">{sec.title}</h4>
                <div className="space-y-2">
                  {sec.items.map((item, iIdx) => renderItem(item, iIdx))}
                </div>
              </div>
            ))}
        </div>
      </details>
    </div>
  );
}
