import React from "react";

interface CodeBlockProps {
  code: string;
}

export function CodeBlock({ code }: CodeBlockProps) {
  return (
    <div className="my-4 rounded-md bg-[#1e1e1e] p-4 overflow-x-auto border border-border shadow-sm">
      <pre className="text-sm font-mono text-[#d4d4d4] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
