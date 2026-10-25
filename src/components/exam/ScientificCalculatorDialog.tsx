"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { evaluateExpression, formatResult, AngleMode } from "@/lib/calculator/engine";

// Distinct button style classes
const BTN_BASE =
  "h-8 sm:h-9 rounded-lg flex items-center justify-center font-medium transition-all duration-100 active:scale-95 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer select-none text-xs";
const BTN_NUM = `${BTN_BASE} bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-50 border border-slate-200/90 dark:border-slate-700/90 shadow-xs font-semibold text-sm`;
const BTN_OP = `${BTN_BASE} bg-blue-50/70 dark:bg-blue-950/70 hover:bg-blue-100/80 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 shadow-xs font-semibold`;
const BTN_SCI = `${BTN_BASE} bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700/70 shadow-xs font-mono`;
const BTN_MEM = `${BTN_BASE} bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 shadow-xs font-mono text-[11px] h-7`;
const BTN_DEL = `${BTN_BASE} bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-xs font-bold`;
const BTN_CLEAR = `${BTN_BASE} bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 shadow-xs font-bold`;
const BTN_EQUALS = `${BTN_BASE} bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm text-base active:bg-blue-800`;
const BTN_ACCENT = `${BTN_BASE} bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 font-bold`;

interface ScientificCalculatorDialogProps {
  onClose: () => void;
}

export function ScientificCalculatorDialog({ onClose }: ScientificCalculatorDialogProps) {
  const [expression, setExpression] = useState("");
  const [displayValue, setDisplayValue] = useState("0");
  const [history, setHistory] = useState<string | null>(null);
  const [angleMode, setAngleMode] = useState<AngleMode>("DEG");
  const [memory, setMemory] = useState<number>(0);
  const [isNewCalculation, setIsNewCalculation] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayRef = useRef<HTMLDivElement>(null);
  const calculatorRef = useRef<HTMLDivElement>(null);

  // Auto-scroll display to the right when expression changes
  useEffect(() => {
    if (displayRef.current) {
      displayRef.current.scrollLeft = displayRef.current.scrollWidth;
    }
  }, [displayValue, expression]);

  // ----------------------------------------------------------------------------
  // INPUT HANDLERS
  // ----------------------------------------------------------------------------

  const handleClearAll = useCallback(() => {
    setExpression("");
    setDisplayValue("0");
    setHistory(null);
    setErrorMessage(null);
    setIsNewCalculation(true);
  }, []);

  const handleDelete = useCallback(() => {
    if (errorMessage) {
      handleClearAll();
      return;
    }

    if (isNewCalculation) {
      setDisplayValue("0");
      setExpression("");
      return;
    }

    if (expression.length <= 1) {
      setExpression("");
      setDisplayValue("0");
      setIsNewCalculation(true);
      return;
    }

    // Check if deleting a multi-char function name like "sin(", "sqrt(", "logBase("
    const funcMatch = expression.match(/([a-zA-Z]+|\^2|\^3|\^\(-1\))\($/);
    if (funcMatch) {
      const nextExpr = expression.slice(0, -funcMatch[0].length);
      setExpression(nextExpr);
      setDisplayValue(nextExpr || "0");
      return;
    }

    const nextExpr = expression.slice(0, -1);
    setExpression(nextExpr);
    setDisplayValue(nextExpr || "0");
  }, [errorMessage, isNewCalculation, expression, handleClearAll]);

  const handleAppend = useCallback(
    (token: string, displayToken?: string) => {
      setErrorMessage(null);
      const isOperator = ["+", "-", "*", "/", "%", "^"].includes(token);

      if (isNewCalculation) {
        if (isOperator) {
          // Continue calculating from current display value if valid number
          const prevNum = parseFloat(displayValue);
          const base = isNaN(prevNum) ? "0" : formatResult(prevNum);
          setExpression(base + token);
          setDisplayValue(base + (displayToken || token));
          setIsNewCalculation(false);
          return;
        } else {
          // Fresh calculation
          setExpression(token);
          setDisplayValue(displayToken || token);
          setIsNewCalculation(false);
          return;
        }
      }

      setExpression((prev) => prev + token);
      setDisplayValue((prev) => (prev === "0" && !isOperator ? (displayToken || token) : prev + (displayToken || token)));
    },
    [isNewCalculation, displayValue]
  );

  const handleFunction = useCallback(
    (fnName: string, displayPrefix?: string) => {
      setErrorMessage(null);
      const prefix = displayPrefix || `${fnName}(`;
      if (isNewCalculation) {
        setExpression(`${fnName}(`);
        setDisplayValue(prefix);
        setIsNewCalculation(false);
      } else {
        setExpression((prev) => `${prev}${fnName}(`);
        setDisplayValue((prev) => `${prev}${prefix}`);
      }
    },
    [isNewCalculation]
  );

  const handleEvaluate = useCallback(() => {
    if (!expression && !errorMessage) return;

    const result = evaluateExpression(expression, angleMode);
    if (result.success) {
      const formatted = formatResult(result.value);
      setHistory(displayValue);
      setDisplayValue(formatted);
      setExpression(formatted);
      setErrorMessage(null);
      setIsNewCalculation(true);
    } else {
      setErrorMessage(result.error || "Syntax Error");
      setDisplayValue(result.error || "Syntax Error");
      setIsNewCalculation(true);
    }
  }, [expression, errorMessage, angleMode, displayValue]);

  const handleToggleSign = useCallback(() => {
    if (errorMessage) return;
    try {
      const currentVal = parseFloat(displayValue);
      if (!isNaN(currentVal) && isNewCalculation) {
        const negated = -currentVal;
        const formatted = formatResult(negated);
        setDisplayValue(formatted);
        setExpression(formatted);
        return;
      }
    } catch {}
    handleAppend("(-1)*", "−");
  }, [errorMessage, displayValue, isNewCalculation, handleAppend]);

  // Memory functions
  const handleMemoryAdd = useCallback(() => {
    const val = parseFloat(displayValue);
    if (!isNaN(val)) setMemory((prev) => prev + val);
  }, [displayValue]);

  const handleMemorySub = useCallback(() => {
    const val = parseFloat(displayValue);
    if (!isNaN(val)) setMemory((prev) => prev - val);
  }, [displayValue]);

  const handleMemoryRecall = useCallback(() => {
    handleAppend(formatResult(memory));
  }, [memory, handleAppend]);

  const handleMemoryClear = useCallback(() => {
    setMemory(0);
  }, []);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in a textarea or text input (e.g. NAT input box)
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleAppend(e.key);
      } else if (e.key === ".") {
        e.preventDefault();
        handleAppend(".");
      } else if (e.key === "+") {
        e.preventDefault();
        handleAppend("+");
      } else if (e.key === "-") {
        e.preventDefault();
        handleAppend("-", "−");
      } else if (e.key === "*") {
        e.preventDefault();
        handleAppend("*", "×");
      } else if (e.key === "/") {
        e.preventDefault();
        handleAppend("/", "÷");
      } else if (e.key === "%") {
        e.preventDefault();
        handleAppend("%");
      } else if (e.key === "(" || e.key === ")") {
        e.preventDefault();
        handleAppend(e.key);
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        handleEvaluate();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleDelete();
      } else if (e.key === "c" || e.key === "C" || e.key === "Delete") {
        e.preventDefault();
        handleClearAll();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, handleAppend, handleEvaluate, handleDelete, handleClearAll]);

  return (
    <div
      ref={calculatorRef}
      role="region"
      aria-label="Scientific Calculator Panel"
      className="fixed top-[70px] sm:top-[76px] right-2 sm:right-6 md:right-8 z-50 w-[350px] sm:w-[370px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-88px)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-700/90 flex flex-col overflow-hidden font-sans ring-1 ring-slate-900/10 animate-in fade-in slide-in-from-top-2 duration-150"
    >
      {/* ---------------------------------------------------------------- */}
      {/* HEADER                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="px-4 py-2.5 bg-slate-50/90 dark:bg-slate-950/90 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
            </svg>
          </span>
          <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight uppercase">
            Scientific Calculator
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          {/* DEG / RAD Quick Indicator */}
          <button
            type="button"
            onClick={() => setAngleMode((m) => (m === "DEG" ? "RAD" : "DEG"))}
            aria-label={`Current angle mode: ${angleMode}. Click to switch.`}
            className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 transition-colors"
          >
            {angleMode}
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Calculator"
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-md transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* DISPLAY                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="p-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700 flex flex-col justify-end">
        {/* Top row: Memory badge & History */}
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1 min-h-[16px]">
          <div className="flex items-center gap-1">
            {memory !== 0 && (
              <span className="px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold text-[10px]" title={`Stored in memory: ${formatResult(memory)}`}>
                M
              </span>
            )}
            <span className="text-[10px] text-slate-400 font-semibold">{angleMode}</span>
          </div>
          <div className="overflow-x-auto whitespace-nowrap text-right max-w-[240px] text-slate-500 dark:text-slate-400">
            {history || (expression && isNewCalculation ? `${expression} =` : "")}
          </div>
        </div>

        {/* Bottom row: Primary Expression / Result display */}
        <div
          ref={displayRef}
          className={`overflow-x-auto whitespace-nowrap text-right font-mono font-bold tracking-tight text-slate-900 dark:text-slate-50 scrollbar-none py-0.5 ${
            errorMessage ? "text-red-600 dark:text-red-400 text-lg" : displayValue.length > 14 ? "text-xl" : "text-2xl"
          }`}
        >
          {displayValue}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* KEYPAD GRID (COMPACT & COMFORTABLE 5-COLUMN LAYOUT)             */}
      {/* ---------------------------------------------------------------- */}
      <div className="p-2.5 grid grid-cols-5 gap-1.5 bg-white dark:bg-slate-900 select-none overflow-y-auto max-h-[calc(92vh-150px)]">
        {/* Row 1: Memory Functions */}
        <button
          type="button"
          onClick={handleMemoryClear}
          aria-label="Memory Clear"
          title="Memory Clear (MC)"
          className={BTN_MEM}
        >
          MC
        </button>
        <button
          type="button"
          onClick={handleMemoryRecall}
          aria-label="Memory Recall"
          title="Memory Recall (MR)"
          className={BTN_MEM}
        >
          MR
        </button>
        <button
          type="button"
          onClick={handleMemoryAdd}
          aria-label="Memory Add"
          title="Memory Add (M+)"
          className={BTN_MEM}
        >
          M+
        </button>
        <button
          type="button"
          onClick={handleMemorySub}
          aria-label="Memory Subtract"
          title="Memory Subtract (M−)"
          className={BTN_MEM}
        >
          M−
        </button>
        <button
          type="button"
          onClick={() => setAngleMode((m) => (m === "DEG" ? "RAD" : "DEG"))}
          aria-label={`Toggle Angle Mode (${angleMode})`}
          title={`Toggle Angle Mode (Current: ${angleMode})`}
          className={`${BTN_ACCENT} text-[11px] h-7`}
        >
          {angleMode}
        </button>

        {/* Row 2: Standard Clear & Scientific Trigonometry */}
        <button
          type="button"
          onClick={handleClearAll}
          aria-label="Clear All"
          title="Clear All (C)"
          className={BTN_CLEAR}
        >
          C
        </button>
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Backspace / Delete"
          title="Backspace (⌫)"
          className={BTN_DEL}
        >
          ⌫
        </button>
        <button
          type="button"
          onClick={() => handleFunction("sin")}
          aria-label="Sine"
          title="Sine function (sin)"
          className={BTN_SCI}
        >
          sin
        </button>
        <button
          type="button"
          onClick={() => handleFunction("cos")}
          aria-label="Cosine"
          title="Cosine function (cos)"
          className={BTN_SCI}
        >
          cos
        </button>
        <button
          type="button"
          onClick={() => handleFunction("tan")}
          aria-label="Tangent"
          title="Tangent function (tan)"
          className={BTN_SCI}
        >
          tan
        </button>

        {/* Row 3: Inverse Trigonometry */}
        <button
          type="button"
          onClick={() => handleAppend("pi", "π")}
          aria-label="Pi constant"
          title="Pi (π ≈ 3.14159)"
          className={BTN_SCI}
        >
          π
        </button>
        <button
          type="button"
          onClick={() => handleAppend("e")}
          aria-label="Euler constant"
          title="Euler's number (e ≈ 2.71828)"
          className={BTN_SCI}
        >
          e
        </button>
        <button
          type="button"
          onClick={() => handleFunction("asin", "asin(")}
          aria-label="Inverse Sine"
          title="Arcsine (sin⁻¹)"
          className={BTN_SCI}
        >
          sin⁻¹
        </button>
        <button
          type="button"
          onClick={() => handleFunction("acos", "acos(")}
          aria-label="Inverse Cosine"
          title="Arccosine (cos⁻¹)"
          className={BTN_SCI}
        >
          cos⁻¹
        </button>
        <button
          type="button"
          onClick={() => handleFunction("atan", "atan(")}
          aria-label="Inverse Tangent"
          title="Arctangent (tan⁻¹)"
          className={BTN_SCI}
        >
          tan⁻¹
        </button>

        {/* Row 4: Hyperbolic Trigonometry */}
        <button
          type="button"
          onClick={() => handleFunction("sinh")}
          aria-label="Hyperbolic Sine"
          title="Hyperbolic Sine (sinh)"
          className={BTN_SCI}
        >
          sinh
        </button>
        <button
          type="button"
          onClick={() => handleFunction("cosh")}
          aria-label="Hyperbolic Cosine"
          title="Hyperbolic Cosine (cosh)"
          className={BTN_SCI}
        >
          cosh
        </button>
        <button
          type="button"
          onClick={() => handleFunction("tanh")}
          aria-label="Hyperbolic Tangent"
          title="Hyperbolic Tangent (tanh)"
          className={BTN_SCI}
        >
          tanh
        </button>
        <button
          type="button"
          onClick={() => handleFunction("ln")}
          aria-label="Natural Logarithm"
          title="Natural Log (ln base e)"
          className={BTN_SCI}
        >
          ln
        </button>
        <button
          type="button"
          onClick={() => handleFunction("log")}
          aria-label="Logarithm base 10"
          title="Log base 10 (log₁₀)"
          className={BTN_SCI}
        >
          log₁₀
        </button>

        {/* Row 5: Powers & Roots */}
        <button
          type="button"
          onClick={() => handleFunction("sqrt", "√(")}
          aria-label="Square Root"
          title="Square Root (√x)"
          className={BTN_SCI}
        >
          √x
        </button>
        <button
          type="button"
          onClick={() => handleFunction("cbrt", "∛(")}
          aria-label="Cube Root"
          title="Cube Root (∛x)"
          className={BTN_SCI}
        >
          ∛x
        </button>
        <button
          type="button"
          onClick={() => handleAppend("^2")}
          aria-label="Square"
          title="x Squared (x²)"
          className={BTN_SCI}
        >
          x²
        </button>
        <button
          type="button"
          onClick={() => handleAppend("^3")}
          aria-label="Cube"
          title="x Cubed (x³)"
          className={BTN_SCI}
        >
          x³
        </button>
        <button
          type="button"
          onClick={() => handleAppend("^")}
          aria-label="Power x to y"
          title="x to the power y (xʸ)"
          className={BTN_SCI}
        >
          xʸ
        </button>

        {/* Row 6: Reciprocal, Factorial, Modulo, Parentheses */}
        <button
          type="button"
          onClick={() => handleAppend("^(-1)")}
          aria-label="Reciprocal"
          title="Reciprocal (1/x)"
          className={BTN_SCI}
        >
          1/x
        </button>
        <button
          type="button"
          onClick={() => handleAppend("!")}
          aria-label="Factorial"
          title="Factorial (x!)"
          className={BTN_SCI}
        >
          n!
        </button>
        <button
          type="button"
          onClick={() => handleAppend("%")}
          aria-label="Modulo / Percentage"
          title="Modulo (% mod)"
          className={BTN_SCI}
        >
          mod
        </button>
        <button
          type="button"
          onClick={() => handleAppend("(")}
          aria-label="Open parenthesis"
          title="Open Parenthesis"
          className={`${BTN_OP} font-bold`}
        >
          (
        </button>
        <button
          type="button"
          onClick={() => handleAppend(")")}
          aria-label="Close parenthesis"
          title="Close Parenthesis"
          className={`${BTN_OP} font-bold`}
        >
          )
        </button>

        {/* Row 7: Digits 7, 8, 9, Divide, exp */}
        <button
          type="button"
          onClick={() => handleAppend("7")}
          aria-label="7"
          className={BTN_NUM}
        >
          7
        </button>
        <button
          type="button"
          onClick={() => handleAppend("8")}
          aria-label="8"
          className={BTN_NUM}
        >
          8
        </button>
        <button
          type="button"
          onClick={() => handleAppend("9")}
          aria-label="9"
          className={BTN_NUM}
        >
          9
        </button>
        <button
          type="button"
          onClick={() => handleAppend("/", "÷")}
          aria-label="Divide"
          title="Divide (÷)"
          className={`${BTN_OP} text-base font-bold`}
        >
          ÷
        </button>
        <button
          type="button"
          onClick={() => handleAppend("*10^", "×10^")}
          aria-label="Scientific Exponential notation"
          title="Scientific Exponential (×10ˣ)"
          className={BTN_SCI}
        >
          EXP
        </button>

        {/* Row 8: Digits 4, 5, 6, Multiply, exp(x) */}
        <button
          type="button"
          onClick={() => handleAppend("4")}
          aria-label="4"
          className={BTN_NUM}
        >
          4
        </button>
        <button
          type="button"
          onClick={() => handleAppend("5")}
          aria-label="5"
          className={BTN_NUM}
        >
          5
        </button>
        <button
          type="button"
          onClick={() => handleAppend("6")}
          aria-label="6"
          className={BTN_NUM}
        >
          6
        </button>
        <button
          type="button"
          onClick={() => handleAppend("*", "×")}
          aria-label="Multiply"
          title="Multiply (×)"
          className={`${BTN_OP} text-base font-bold`}
        >
          ×
        </button>
        <button
          type="button"
          onClick={() => handleFunction("exp")}
          aria-label="e to the power x"
          title="e to the power x (eˣ)"
          className={BTN_SCI}
        >
          eˣ
        </button>

        {/* Row 9: Digits 1, 2, 3, Subtract, Toggle Sign */}
        <button
          type="button"
          onClick={() => handleAppend("1")}
          aria-label="1"
          className={BTN_NUM}
        >
          1
        </button>
        <button
          type="button"
          onClick={() => handleAppend("2")}
          aria-label="2"
          className={BTN_NUM}
        >
          2
        </button>
        <button
          type="button"
          onClick={() => handleAppend("3")}
          aria-label="3"
          className={BTN_NUM}
        >
          3
        </button>
        <button
          type="button"
          onClick={() => handleAppend("-", "−")}
          aria-label="Subtract"
          title="Subtract (−)"
          className={`${BTN_OP} text-base font-bold`}
        >
          −
        </button>
        <button
          type="button"
          onClick={handleToggleSign}
          aria-label="Toggle Positive or Negative"
          title="Plus / Minus (+/-)"
          className={`${BTN_OP} text-xs font-bold`}
        >
          +/−
        </button>

        {/* Row 10: Zero, Decimal, Comma, Add, Equals */}
        <button
          type="button"
          onClick={() => handleAppend("0")}
          aria-label="0"
          className={BTN_NUM}
        >
          0
        </button>
        <button
          type="button"
          onClick={() => handleAppend(".")}
          aria-label="Decimal point"
          title="Decimal point (.)"
          className={`${BTN_NUM} font-bold text-base`}
        >
          .
        </button>
        <button
          type="button"
          onClick={() => handleAppend(",")}
          aria-label="Comma separator for multi-argument functions"
          title="Comma separator (,)"
          className={`${BTN_OP} font-bold`}
        >
          ,
        </button>
        <button
          type="button"
          onClick={() => handleAppend("+")}
          aria-label="Add"
          title="Add (+)"
          className={`${BTN_OP} text-base font-bold`}
        >
          +
        </button>
        <button
          type="button"
          onClick={handleEvaluate}
          aria-label="Evaluate Equals"
          title="Equals (= or Enter)"
          className={`${BTN_EQUALS}`}
        >
          =
        </button>
      </div>
    </div>
  );
}
