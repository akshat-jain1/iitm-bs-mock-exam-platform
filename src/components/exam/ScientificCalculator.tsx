"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";

const ScientificCalculatorDialog = dynamic(
  () =>
    import("./ScientificCalculatorDialog").then(
      (mod) => mod.ScientificCalculatorDialog
    ),
  { ssr: false }
);

export function ScientificCalculator() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-flex items-center">
      {/* ==================================================================== */}
      {/* 1. COMPACT HEADER TOOLBAR TRIGGER BUTTON (BESIDE TIME REMAINING)     */}
      {/* ==================================================================== */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? "Close Scientific Calculator" : "Open Scientific Calculator"}
        title="Scientific Calculator"
        className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 cursor-pointer select-none ${
          isOpen
            ? "bg-blue-50 dark:bg-blue-950 border-blue-400 text-blue-700 dark:text-blue-300 shadow-xs ring-1 ring-blue-400"
            : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 hover:text-blue-700 dark:hover:text-blue-300"
        }`}
      >
        <svg
          className={`w-4 h-4 transition-transform ${
            isOpen ? "text-blue-600 dark:text-blue-400 scale-105" : "text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <circle cx="8" cy="10" r="1" fill="currentColor" />
          <circle cx="12" cy="10" r="1" fill="currentColor" />
          <circle cx="16" cy="10" r="1" fill="currentColor" />
          <circle cx="8" cy="14" r="1" fill="currentColor" />
          <circle cx="12" cy="14" r="1" fill="currentColor" />
          <circle cx="16" cy="14" r="1" fill="currentColor" />
          <circle cx="8" cy="18" r="1" fill="currentColor" />
          <circle cx="12" cy="18" r="1" fill="currentColor" />
          <circle cx="16" cy="18" r="1" fill="currentColor" />
        </svg>
        <span className="hidden sm:inline font-semibold tracking-tight">Calculator</span>
      </button>

      {/* ==================================================================== */}
      {/* 2. LAZY-LOADED SCIENTIFIC CALCULATOR OVERLAY DIALOG                  */}
      {/* ==================================================================== */}
      {isOpen && <ScientificCalculatorDialog onClose={() => setIsOpen(false)} />}
    </div>
  );
}
