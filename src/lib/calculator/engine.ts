/**
 * ==============================================================================
 * GLOBAL SCIENTIFIC CALCULATOR — SAFE EXPRESSION EVALUATION ENGINE
 * ==============================================================================
 * A 100% safe, robust mathematical expression parser and evaluator.
 * NO eval(), NO new Function(), NO arbitrary code execution.
 *
 * Supports:
 * - Basic Arithmetic: +, -, *, /, %
 * - Operator Precedence & Parentheses ()
 * - Implicit Multiplication: 2(3), 3pi, 2sin(30)
 * - Exponentiation: x^y (right-associative)
 * - Factorial: x!
 * - Trigonometric: sin, cos, tan, asin, acos, atan with DEG/RAD modes
 * - Logarithmic: log (base 10), ln (base e), logBase(base, value)
 * - Roots & Powers: sqrt, cbrt, nroot(n, x), e^x, 10^x
 * - Constants: pi (π), e
 * - IEEE 754 precision normalization (avoids 0.30000000000000004)
 * ==============================================================================
 */

export type AngleMode = "DEG" | "RAD";

export interface EvaluationResult {
  success: boolean;
  value: number;
  formatted: string;
  error?: string;
}

// ------------------------------------------------------------------------------
// CONSTANTS & HELPERS
// ------------------------------------------------------------------------------
const PI = Math.PI;
const E = Math.E;
const EPSILON = 1e-12;

function degToRad(deg: number): number {
  return (deg * PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / PI;
}

function factorial(n: number): number {
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error("Factorial requires a non-negative integer");
  }
  if (n > 170) return Infinity;
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

/**
 * Normalizes floating point numbers to eliminate IEEE 754 precision anomalies
 * while preserving valid precision and handling scientific notation for extreme numbers.
 */
export function formatResult(num: number): string {
  if (isNaN(num)) return "Error";
  if (!isFinite(num)) return num > 0 ? "Infinity" : "-Infinity";

  // Check if value is essentially an integer
  if (Math.abs(num - Math.round(num)) < EPSILON) {
    return Math.round(num).toString();
  }

  // Remove tiny floating-point noise e.g., 0.1 + 0.2 -> 0.3
  const rounded = Number(num.toPrecision(12));
  if (Math.abs(rounded) < EPSILON && Math.abs(rounded) > 0) {
    return "0";
  }

  // Large or microscopic numbers use exponential formatting
  if (Math.abs(rounded) >= 1e14 || (Math.abs(rounded) < 1e-6 && rounded !== 0)) {
    return rounded.toExponential(6).replace(/\+?0*(\d+)$/, "$1");
  }

  return rounded.toString();
}

// ------------------------------------------------------------------------------
// TOKENIZER
// ------------------------------------------------------------------------------
type TokenType =
  | "NUMBER"
  | "IDENTIFIER"
  | "PLUS"
  | "MINUS"
  | "MULTIPLY"
  | "DIVIDE"
  | "MODULO"
  | "POWER"
  | "FACTORIAL"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "EOF";

interface Token {
  type: TokenType;
  value: string;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Number (digits and decimal point)
    if (/\d/.test(ch) || (ch === "." && i + 1 < len && /\d/.test(input[i + 1]))) {
      let numStr = "";
      while (i < len && (/\d/.test(input[i]) || input[i] === ".")) {
        numStr += input[i];
        i++;
      }
      tokens.push({ type: "NUMBER", value: numStr });
      continue;
    }

    // Identifiers (functions, constants: sin, cos, pi, e, etc.)
    if (/[a-zA-Zπ]/.test(ch)) {
      let idStr = "";
      while (i < len && /[a-zA-Z0-9π_]/.test(input[i])) {
        idStr += input[i];
        i++;
      }
      tokens.push({ type: "IDENTIFIER", value: idStr });
      continue;
    }

    // Operators
    switch (ch) {
      case "+":
        tokens.push({ type: "PLUS", value: "+" });
        i++;
        break;
      case "-":
      case "−": // unicode minus
        tokens.push({ type: "MINUS", value: "-" });
        i++;
        break;
      case "*":
      case "×":
      case "·":
        tokens.push({ type: "MULTIPLY", value: "*" });
        i++;
        break;
      case "/":
      case "÷":
        tokens.push({ type: "DIVIDE", value: "/" });
        i++;
        break;
      case "%":
        tokens.push({ type: "MODULO", value: "%" });
        i++;
        break;
      case "^":
        tokens.push({ type: "POWER", value: "^" });
        i++;
        break;
      case "!":
        tokens.push({ type: "FACTORIAL", value: "!" });
        i++;
        break;
      case "(":
        tokens.push({ type: "LPAREN", value: "(" });
        i++;
        break;
      case ")":
        tokens.push({ type: "RPAREN", value: ")" });
        i++;
        break;
      case ",":
        tokens.push({ type: "COMMA", value: "," });
        i++;
        break;
      default:
        throw new Error(`Unexpected character: "${ch}"`);
    }
  }

  // Insert implicit multiplication tokens where applicable:
  // e.g. NUMBER LPAREN -> NUMBER * LPAREN: 2(3) -> 2 * (3)
  // RPAREN LPAREN -> RPAREN * LPAREN: (2)(3) -> (2) * (3)
  // NUMBER IDENTIFIER -> NUMBER * IDENTIFIER: 2pi -> 2 * pi, 2sin(30) -> 2 * sin(30)
  // RPAREN IDENTIFIER -> RPAREN * IDENTIFIER: (2)pi -> (2) * pi
  // FACTORIAL NUMBER -> FACTORIAL * NUMBER: 5! 2 -> 5! * 2
  const enriched: Token[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const curr = tokens[k];
    enriched.push(curr);

    if (k + 1 < tokens.length) {
      const next = tokens[k + 1];
      const canEndFactor =
        curr.type === "NUMBER" ||
        curr.type === "RPAREN" ||
        curr.type === "FACTORIAL" ||
        (curr.type === "IDENTIFIER" && (curr.value === "pi" || curr.value === "π" || curr.value === "e"));

      const canStartFactor =
        next.type === "NUMBER" ||
        next.type === "LPAREN" ||
        next.type === "IDENTIFIER";

      if (canEndFactor && canStartFactor) {
        enriched.push({ type: "MULTIPLY", value: "*" });
      }
    }
  }

  enriched.push({ type: "EOF", value: "" });
  return enriched;
}

// ------------------------------------------------------------------------------
// PARSER & EVALUATOR (RECURSIVE DESCENT)
// ------------------------------------------------------------------------------
class Parser {
  private tokens: Token[];
  private pos = 0;
  private angleMode: AngleMode;

  constructor(tokens: Token[], angleMode: AngleMode = "DEG") {
    this.tokens = tokens;
    this.angleMode = angleMode;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(expected?: TokenType): Token {
    const t = this.peek();
    if (expected && t.type !== expected) {
      throw new Error(`Syntax Error: Expected ${expected} but found ${t.type} ("${t.value}")`);
    }
    this.pos++;
    return t;
  }

  public parse(): number {
    const res = this.parseExpression();
    if (this.peek().type !== "EOF") {
      throw new Error(`Syntax Error: Unexpected extra input near "${this.peek().value}"`);
    }
    return res;
  }

  // expression = term ( ( "+" | "-" ) term )*
  private parseExpression(): number {
    let val = this.parseTerm();

    while (this.peek().type === "PLUS" || this.peek().type === "MINUS") {
      const op = this.consume().type;
      const right = this.parseTerm();
      if (op === "PLUS") {
        val += right;
      } else {
        val -= right;
      }
    }

    return val;
  }

  // term = power ( ( "*" | "/" | "%" ) power )*
  private parseTerm(): number {
    let val = this.parsePower();

    while (
      this.peek().type === "MULTIPLY" ||
      this.peek().type === "DIVIDE" ||
      this.peek().type === "MODULO"
    ) {
      const op = this.consume().type;
      const right = this.parsePower();

      if (op === "MULTIPLY") {
        val *= right;
      } else if (op === "DIVIDE") {
        if (Math.abs(right) < 1e-15) {
          throw new Error("Math Error: Division by zero");
        }
        val /= right;
      } else if (op === "MODULO") {
        if (Math.abs(right) < 1e-15) {
          throw new Error("Math Error: Division by zero");
        }
        val = val % right;
      }
    }

    return val;
  }

  // power = unary ( "^" power )?  -- right associative
  private parsePower(): number {
    const left = this.parseUnary();

    if (this.peek().type === "POWER") {
      this.consume();
      const right = this.parsePower(); // right-associative recursion

      if (left < 0 && !Number.isInteger(right)) {
        throw new Error("Math Error: Negative base with non-integer exponent");
      }
      if (left === 0 && right < 0) {
        throw new Error("Math Error: Division by zero");
      }
      return Math.pow(left, right);
    }

    return left;
  }

  // unary = ( "+" | "-" ) unary | postfix
  private parseUnary(): number {
    if (this.peek().type === "PLUS") {
      this.consume();
      return this.parseUnary();
    }
    if (this.peek().type === "MINUS") {
      this.consume();
      return -this.parseUnary();
    }
    return this.parsePostfix();
  }

  // postfix = primary ( "!" )*
  private parsePostfix(): number {
    let val = this.parsePrimary();

    while (this.peek().type === "FACTORIAL") {
      this.consume();
      val = factorial(val);
    }

    return val;
  }

  // primary = NUMBER | IDENTIFIER | "(" expression ")"
  private parsePrimary(): number {
    const token = this.peek();

    // 1. Number literal
    if (token.type === "NUMBER") {
      this.consume();
      const num = parseFloat(token.value);
      if (isNaN(num)) throw new Error(`Invalid number: "${token.value}"`);
      return num;
    }

    // 2. Parentheses
    if (token.type === "LPAREN") {
      this.consume("LPAREN");
      const val = this.parseExpression();
      this.consume("RPAREN");
      return val;
    }

    // 3. Identifier (constant or function call)
    if (token.type === "IDENTIFIER") {
      const id = this.consume("IDENTIFIER").value.toLowerCase();

      // Check constants
      if (id === "pi" || id === "π") return PI;
      if (id === "e") return E;

      // Function calls must be followed by (
      if (this.peek().type !== "LPAREN") {
        throw new Error(`Unknown identifier or missing parentheses for function: "${id}"`);
      }

      this.consume("LPAREN");
      const args: number[] = [];
      if (this.peek().type !== "RPAREN") {
        args.push(this.parseExpression());
        while (this.peek().type === "COMMA") {
          this.consume("COMMA");
          args.push(this.parseExpression());
        }
      }
      this.consume("RPAREN");

      return this.evaluateFunction(id, args);
    }

    throw new Error(`Syntax Error: Unexpected token "${token.value || token.type}"`);
  }

  private evaluateFunction(name: string, args: number[]): number {
    switch (name) {
      // ----------------------------------------------------------------------
      // Trigonometric Functions
      // ----------------------------------------------------------------------
      case "sin": {
        if (args.length !== 1) throw new Error("sin() requires 1 argument");
        const x = args[0];
        if (this.angleMode === "DEG") {
          const mod360 = ((x % 360) + 360) % 360;
          if (mod360 === 0 || mod360 === 180) return 0;
          if (mod360 === 90) return 1;
          if (mod360 === 270) return -1;
          if (mod360 === 30 || mod360 === 150) return 0.5;
          if (mod360 === 210 || mod360 === 330) return -0.5;
          return Math.sin(degToRad(x));
        }
        return Math.sin(x);
      }

      case "cos": {
        if (args.length !== 1) throw new Error("cos() requires 1 argument");
        const x = args[0];
        if (this.angleMode === "DEG") {
          const mod360 = ((x % 360) + 360) % 360;
          if (mod360 === 90 || mod360 === 270) return 0;
          if (mod360 === 0) return 1;
          if (mod360 === 180) return -1;
          if (mod360 === 60 || mod360 === 300) return 0.5;
          if (mod360 === 120 || mod360 === 240) return -0.5;
          return Math.cos(degToRad(x));
        }
        return Math.cos(x);
      }

      case "tan": {
        if (args.length !== 1) throw new Error("tan() requires 1 argument");
        const x = args[0];
        if (this.angleMode === "DEG") {
          const mod180 = ((x % 180) + 180) % 180;
          if (mod180 === 90) throw new Error("Math Error: tan(90°) is undefined");
          if (mod180 === 0) return 0;
          if (mod180 === 45) return 1;
          if (mod180 === 135) return -1;
          return Math.tan(degToRad(x));
        }
        // In radians, check cos(x) != 0
        if (Math.abs(Math.cos(x)) < EPSILON) {
          throw new Error("Math Error: tan() is undefined");
        }
        return Math.tan(x);
      }

      // Inverse Trigonometric Functions
      case "asin":
      case "arcsin": {
        if (args.length !== 1) throw new Error("asin() requires 1 argument");
        const x = args[0];
        if (x < -1 || x > 1) throw new Error("Math Error: asin domain is [-1, 1]");
        const rad = Math.asin(x);
        return this.angleMode === "DEG" ? radToDeg(rad) : rad;
      }

      case "acos":
      case "arccos": {
        if (args.length !== 1) throw new Error("acos() requires 1 argument");
        const x = args[0];
        if (x < -1 || x > 1) throw new Error("Math Error: acos domain is [-1, 1]");
        const rad = Math.acos(x);
        return this.angleMode === "DEG" ? radToDeg(rad) : rad;
      }

      case "atan":
      case "arctan": {
        if (args.length !== 1) throw new Error("atan() requires 1 argument");
        const x = args[0];
        const rad = Math.atan(x);
        return this.angleMode === "DEG" ? radToDeg(rad) : rad;
      }

      // ----------------------------------------------------------------------
      // Powers & Roots
      // ----------------------------------------------------------------------
      case "sqrt": {
        if (args.length !== 1) throw new Error("sqrt() requires 1 argument");
        if (args[0] < 0) throw new Error("Math Error: Cannot compute square root of negative number");
        return Math.sqrt(args[0]);
      }

      case "cbrt": {
        if (args.length !== 1) throw new Error("cbrt() requires 1 argument");
        return Math.cbrt(args[0]);
      }

      // nroot(n, x) -> nth root of x: nroot(3, 27) = 3
      case "nroot": {
        if (args.length !== 2) throw new Error("nroot(n, x) requires 2 arguments: root degree n and radicand x");
        const n = args[0];
        const x = args[1];
        if (Math.abs(n) < EPSILON) throw new Error("Math Error: 0th root is undefined");
        if (x < 0) {
          if (Number.isInteger(n) && Math.abs(n) % 2 === 1) {
            return -Math.pow(-x, 1 / n);
          }
          throw new Error("Math Error: Even root of negative number");
        }
        return Math.pow(x, 1 / n);
      }

      case "sqr":
      case "square": {
        if (args.length !== 1) throw new Error("square() requires 1 argument");
        return args[0] * args[0];
      }

      case "cube": {
        if (args.length !== 1) throw new Error("cube() requires 1 argument");
        return args[0] * args[0] * args[0];
      }

      case "recip":
      case "inv": {
        if (args.length !== 1) throw new Error("1/x requires 1 argument");
        if (Math.abs(args[0]) < EPSILON) throw new Error("Math Error: Division by zero");
        return 1 / args[0];
      }

      // ----------------------------------------------------------------------
      // Logarithmic & Exponential
      // ----------------------------------------------------------------------
      case "log":
      case "log10": {
        if (args.length !== 1) throw new Error("log() requires 1 argument");
        if (args[0] <= 0) throw new Error("Math Error: log requires positive argument");
        return Math.log10(args[0]);
      }

      case "ln": {
        if (args.length !== 1) throw new Error("ln() requires 1 argument");
        if (args[0] <= 0) throw new Error("Math Error: ln requires positive argument");
        return Math.log(args[0]);
      }

      // logBase(base, value) -> log base 2 of 8 = 3
      case "logbase": {
        if (args.length !== 2) throw new Error("logBase(base, value) requires 2 arguments");
        const base = args[0];
        const value = args[1];
        if (base <= 0 || Math.abs(base - 1) < EPSILON) {
          throw new Error("Math Error: Logarithm base must be positive and != 1");
        }
        if (value <= 0) {
          throw new Error("Math Error: Logarithm value must be positive");
        }
        return Math.log(value) / Math.log(base);
      }

      case "exp": {
        if (args.length !== 1) throw new Error("exp() requires 1 argument");
        return Math.exp(args[0]);
      }

      case "abs": {
        if (args.length !== 1) throw new Error("abs() requires 1 argument");
        return Math.abs(args[0]);
      }

      case "fact": {
        if (args.length !== 1) throw new Error("fact() requires 1 argument");
        return factorial(args[0]);
      }

      default:
        throw new Error(`Unknown function: "${name}()"`);
    }
  }
}

// ------------------------------------------------------------------------------
// PUBLIC API EVALUATION WRAPPER
// ------------------------------------------------------------------------------
export function evaluateExpression(expression: string, angleMode: AngleMode = "DEG"): EvaluationResult {
  const trimmed = expression.trim();
  if (!trimmed) {
    return {
      success: true,
      value: 0,
      formatted: "0",
    };
  }

  try {
    const tokens = tokenize(trimmed);
    const parser = new Parser(tokens, angleMode);
    const value = parser.parse();

    return {
      success: true,
      value,
      formatted: formatResult(value),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid Expression";
    return {
      success: false,
      value: NaN,
      formatted: msg.startsWith("Math Error") ? "Math Error" : "Syntax Error",
      error: msg,
    };
  }
}
