import React from "react";
import katex from "katex";

interface MathTextProps {
  text?: string;
  html?: string;
  className?: string;
  as?: "div" | "span";
}

interface Segment {
  type: "text" | "inline-math" | "display-math";
  content: string;
}

// Module-level caches to eliminate repeated parsing and KaTeX render calls across re-renders
const segmentsCache = new Map<string, Segment[]>();
const mathHtmlCache = new Map<string, string>();

function parseMathSegments(text: string): Segment[] {
  const cached = segmentsCache.get(text);
  if (cached) return cached;

  const segments: Segment[] = [];
  let remaining = text;

  // Pattern matches $$...$$, \[...\], \begin{...}...\end{...}, $...$, or \(...\)
  const envPattern =
    "\\\\begin\\{(?:bmatrix|pmatrix|vmatrix|Vmatrix|matrix|cases|aligned|align\\*?)\\}[\\s\\S]+?\\\\end\\{(?:bmatrix|pmatrix|vmatrix|Vmatrix|matrix|cases|aligned|align\\*?)\\}";
  const mathRegex = new RegExp(
    "(\\$\\$[\\s\\S]+?\\$\\$|\\\\\\[[\\s\\S]+?\\\\\\]|" +
      envPattern +
      "|\\$[^\\$\\n]+?\\$|\\\\\\([\\s\\S]+?\\\\\\))"
  );

  while (remaining.length > 0) {
    const match = remaining.match(mathRegex);
    if (!match || match.index === undefined) {
      segments.push({ type: "text", content: remaining });
      break;
    }

    if (match.index > 0) {
      segments.push({ type: "text", content: remaining.slice(0, match.index) });
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith("$$") && matchedStr.endsWith("$$")) {
      segments.push({ type: "display-math", content: matchedStr.slice(2, -2).trim() });
    } else if (matchedStr.startsWith("\\[") && matchedStr.endsWith("\\]")) {
      segments.push({ type: "display-math", content: matchedStr.slice(2, -2).trim() });
    } else if (matchedStr.startsWith("\\begin{")) {
      segments.push({ type: "display-math", content: matchedStr.trim() });
    } else if (matchedStr.startsWith("$") && matchedStr.endsWith("$")) {
      segments.push({ type: "inline-math", content: matchedStr.slice(1, -1).trim() });
    } else if (matchedStr.startsWith("\\(") && matchedStr.endsWith("\\)")) {
      segments.push({ type: "inline-math", content: matchedStr.slice(2, -2).trim() });
    } else {
      segments.push({ type: "text", content: matchedStr });
    }

    remaining = remaining.slice(match.index + matchedStr.length);
  }

  // Cap cache size at 500 entries to prevent memory growth
  if (segmentsCache.size > 500) {
    segmentsCache.clear();
  }
  segmentsCache.set(text, segments);
  return segments;
}

function getOrRenderMathHtml(type: "inline-math" | "display-math", content: string): string {
  const cacheKey = `${type}:${content}`;
  const cached = mathHtmlCache.get(cacheKey);
  if (cached) return cached;

  let rendered: string;
  try {
    rendered = katex.renderToString(content, {
      displayMode: type === "display-math",
      throwOnError: false,
    });
  } catch {
    rendered = type === "display-math" ? `$$${content}$$` : `$${content}$`;
  }

  if (mathHtmlCache.size > 1000) {
    mathHtmlCache.clear();
  }
  mathHtmlCache.set(cacheKey, rendered);
  return rendered;
}

function MathTextBase({ text = "", html, className = "", as = "div" }: MathTextProps) {
  const Component = as;

  // 1. FAST PATH: Server-side pre-rendered KaTeX HTML
  if (html) {
    return (
      <Component
        className={`leading-relaxed ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  if (!text) return null;

  // 2. FAST PATH: Plain text without math delimiters
  if (
    !text.includes("$") &&
    !text.includes("\\(") &&
    !text.includes("\\[") &&
    !text.includes("\\begin{")
  ) {
    return (
      <Component className={`whitespace-pre-line leading-relaxed ${className}`}>
        {text}
      </Component>
    );
  }

  // 3. FALLBACK PATH: Client-side parsing with memoized segments & cached KaTeX rendering
  const segments = parseMathSegments(text);

  return (
    <Component className={`leading-relaxed ${className}`}>
      {segments.map((seg, idx) => {
        if (seg.type === "display-math") {
          const renderedHtml = getOrRenderMathHtml("display-math", seg.content);
          return (
            <div
              key={idx}
              className="my-3 overflow-x-auto py-1 text-center"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          );
        }

        if (seg.type === "inline-math") {
          const renderedHtml = getOrRenderMathHtml("inline-math", seg.content);
          return (
            <span
              key={idx}
              className="inline-block px-0.5"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          );
        }

        // Normal text segment
        return (
          <span key={idx} className="whitespace-pre-line">
            {seg.content}
          </span>
        );
      })}
    </Component>
  );
}

// React.memo to prevent re-renders when parent components update unrelated state (e.g. response selection)
export const MathText = React.memo(MathTextBase, (prev, next) => {
  return (
    prev.text === next.text &&
    prev.html === next.html &&
    prev.className === next.className &&
    prev.as === next.as
  );
});
