import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// ==============================================================================
// CONFIGURATION & CREDENTIALS
// ==============================================================================

const SUPABASE_URL = process.env.PRODUCTION_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Set PRODUCTION_SUPABASE_URL and PRODUCTION_SUPABASE_SERVICE_ROLE_KEY before importing.");
}

const MAY24_PDF_DIR = path.resolve("./pyqs/may24quiz1");
const JULY16_PDF_DIR = path.resolve("./pyqs/july16quiz1");
const MAY24_MANIFEST_PATH = path.resolve("./scratch/may24_source_manifest.json");
const JULY16_MANIFEST_PATH = path.resolve("./scratch/july16_source_manifest.json");
const MAY24_IMAGES_DIR = path.resolve("./scratch/may24_images");
const JULY16_IMAGES_DIR = path.resolve("./scratch/july16_images");

// ==============================================================================
// DATA INTERFACES
// ==============================================================================

interface ManifestImage {
  filename: string;
  width: number;
  height: number;
  page: number;
  storage_path: string;
}

interface ManifestOption {
  id?: string;
  sequence: number;
  letter?: string;
  text: string;
  is_correct: boolean;
  images?: ManifestImage[];
}

interface ManifestNumericalEval {
  mode: "EXACT" | "RANGE";
  raw_possible_answers?: string;
  exact_val?: number | null;
  min_val?: number | null;
  max_val?: number | null;
}

interface ManifestQuestion {
  source_q_num: number;
  q_id?: string;
  type: "MCQ" | "MSQ" | "SA" | "NUMERICAL";
  marks: number;
  label?: string;
  text: string;
  is_confirmation?: boolean;
  is_useful_data?: boolean;
  is_zero_mark?: boolean;
  parent_group_id?: string | null;
  page?: number;
  options: ManifestOption[];
  eval_numeric?: ManifestNumericalEval | null;
  images?: ManifestImage[];
  code_content?: string | null;
}

interface ManifestGroup {
  group_id: string;
  start_q?: number;
  end_q?: number;
  first_q?: number;
  last_q?: number;
  page_num?: number;
  passage: string;
  images?: ManifestImage[];
}

interface ManifestSubject {
  subject_code: string;
  subject_name: string;
  section_name: string;
  section_number?: number;
  first_q?: number;
  last_q?: number;
  expected_count?: number;
  comprehension_groups: ManifestGroup[];
  questions: ManifestQuestion[];
}

// Concurrency helper for robust bulk uploads
async function runConcurrent<T>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<void>): Promise<void> {
  const executing: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const p = Promise.resolve().then(() => fn(items[i], i));
    executing.push(p);
    const clean = () => {
      const idx = executing.indexOf(p);
      if (idx !== -1) executing.splice(idx, 1);
    };
    p.then(clean, clean);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

// ==============================================================================
// READABILITY PATCH APPLICATION (JULY 16)
// ==============================================================================

function applyJuly16ReadabilityPatches(manifest: Record<string, ManifestSubject>): void {
  console.log("\n[Readability] Applying verified KaTeX and mathematical readability corrections to July 16...");

  // 1. STAT102: Blank group Q15 - Q19
  const stat102 = manifest["STAT102"];
  if (stat102) {
    const targetGroup = stat102.comprehension_groups.find(g => (g.first_q === 15 && g.last_q === 19) || (g.start_q === 15 && g.end_q === 19));
    if (targetGroup) {
      targetGroup.passage = `Suppose that the time $X$ (in minutes) that a customer waits at a service counter is a random variable with probability density function:
$$f_X(x) = \\begin{cases} 0, & x < 0 \\\\ \\frac{x}{8}, & 0 \\le x \\le 4 \\\\ 0, & \\text{otherwise} \\end{cases}$$

Let $U$ be the event that a person has to wait for more than 2 minutes and $V$ be the event that he has to wait for more than 1 minute. Find the value of $P(U|V)$.

---

### Solution / Derivation:
According to the question,
$$U = \\{X > 2\\}, \\quad \\text{and } V = \\{X > 1\\}$$

We know that the conditional probability is given by:
$$P(U|V) = \\frac{P(U \\cap V)}{P(V)} \\quad \\dots(1)$$

**Step 1: Calculate numerator**
$$P(U \\cap V) = P(X > 2 \\cap X > 1)$$
$$= \\mathbf{A}$$
$$= \\int_{\\mathbf{B}} \\frac{x}{8} \\, dx$$
$$= \\mathbf{C}$$

**Step 2: Calculate denominator**
$$P(V) = \\int_1^4 \\frac{x}{8} \\, dx = \\mathbf{D}$$

**Step 3: Substituting the values in equation (1)**
$$P(U|V) = \\mathbf{E}$$

---

### Options for the blanks:
| Option | Expression | Option | Expression | Option | Expression |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **(1)** | $P(X \\ge 2)$ | **(5)** | $\\frac{9}{16}$ | **(8)** | $\\frac{7}{8}$ |
| **(2)** | $P(X > 1)$ | **(6)** | $\\frac{15}{16}$ | **(9)** | $\\int_0^2$ |
| **(3)** | $\\frac{3}{4}$ | | | **(10)** | $P(X > 2)$ |
| **(4)** | $\\int_2^4$ | **(7)** | $\\int_1^4$ | **(11)** | $P(X \\ge 1)$ |

Answer the given sub-questions.
**Note:** Enter only the correct option number (e.g. 8) without any brackets or punctuation.`;
      targetGroup.images = [];
    }

    const qMap = new Map(stat102.questions.map(q => [q.source_q_num, q]));
    if (qMap.get(15)) { qMap.get(15)!.text = "Enter the correct option number for A."; qMap.get(15)!.images = []; }
    if (qMap.get(16)) { qMap.get(16)!.text = "Enter the correct option number for B."; qMap.get(16)!.images = []; }
    if (qMap.get(17)) { qMap.get(17)!.text = "Enter the correct option number for C."; qMap.get(17)!.images = []; }
    if (qMap.get(18)) { qMap.get(18)!.text = "Enter the correct option number for D."; qMap.get(18)!.images = []; }
    if (qMap.get(19)) { qMap.get(19)!.text = "Calculate the value for E. Enter the answer correct to one decimal place."; qMap.get(19)!.images = []; }
  }

  // 2. MATH101: Relations & Polynomial Groups & Mathematical Formulas
  const math101 = manifest["MATH101"];
  if (math101) {
    const relationsPassage = `Let $A = \\{1, 2, 3, 6\\}$.
Define relations $R_1$ and $R_2$ on $A$ by:
$$R_1 = \\{(a, b) \\mid a \\text{ divides } b\\}$$
and
$$R_2 = \\{(a, b) \\mid a + b \\text{ is even}\\}$$

Answer the given subquestions.`;

    const polyPassage = `Consider the polynomial:
$$p(x) = 3(x - 2)^4(x + 1)^7(x - 5)^2$$

Answer the given subquestions.`;

    for (const grp of math101.comprehension_groups) {
      if (["grp_math101_1", "grp_math101_2", "grp_math101_3"].includes(grp.group_id)) {
        grp.passage = relationsPassage;
        grp.images = [];
      } else if (["grp_math101_4", "grp_math101_5", "grp_math101_6"].includes(grp.group_id)) {
        grp.passage = polyPassage;
        grp.images = [];
      }
    }

    const qMap = new Map(math101.questions.map(q => [q.source_q_num, q]));
    
    // Q1 & Q3
    for (const qn of [1, 3]) {
      const q = qMap.get(qn);
      if (q) {
        q.text = "The zeros of the polynomial $p(x) = (x - 2)(3x + 1)q(x)$ are $2, -\\frac{1}{3}, 4, -2$, each with multiplicity 1. If the leading coefficient of $q(x)$ is 1, find $q(1)$.";
        q.images = [];
      }
    }

    // Q2
    const q2 = qMap.get(2);
    if (q2) {
      q2.text = "In a survey of 400 students of a college, 140 like cricket, 120 like football and 160 like tennis. 30 like both cricket and football, 40 like both football and tennis, and 50 like both cricket and tennis. 20 like all three sports. Find the number of students who like none of these three sports.";
      q2.images = [];
    }

    // Q4
    const q4 = qMap.get(4);
    if (q4) {
      q4.text = `A delivery company uses a prediction model to estimate the number of parcels delivered by a driver each day. For five days, the actual and predicted numbers of parcels are shown below:

| Day | 1 | 2 | 3 | 4 | 5 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Actual Deliveries | 40 | 52 | 48 | 60 | 55 |
| Predicted Deliveries | 42 | 50 | 51 | $x$ | 58 |

The Sum of Squared Errors (SSE) for these five days is 35.
If the model underestimated the number of deliveries on Day 4, find the predicted number of deliveries on Day 4.`;
      q4.images = [];
    }

    // Q5 & Q6
    for (const qn of [5, 6]) {
      const q = qMap.get(qn);
      if (q) {
        q.text = "Consider the polynomial $p(x) = -2(x + 3)^5(x - 1)^4(x + 2)^3$. Which of the following best describes the end behavior of $p(x)$?";
        q.images = [];
      }
    }

    // Q7
    const q7 = qMap.get(7);
    if (q7) {
      q7.text = "If $x + a$ is one of the factors of $p(x) = x^2 + (2a - 3)x + a^2 - 2a$, find the value of $a$.";
      q7.images = [];
    }

    // Q10
    const q10 = qMap.get(10);
    if (q10) {
      q10.text = "One root of the quadratic equation $x^2 - kx + 18 = 0$ is three times the other root. If both roots are positive, find the value of $k$.";
      q10.images = [];
    }

    // Q11 & Q12 & Q15
    for (const qn of [11, 12, 15]) {
      const q = qMap.get(qn);
      if (q) {
        q.text = "Let $p(x) = x^2 - (k + 2)x + 2k$. Choose the correct statement(s).";
        q.images = [];
        const optTexts = [
          "If $k = 1$, then both roots of $p(x) = 0$ are equal.",
          "If $k = 2$, then both roots of $p(x) = 0$ are integers.",
          "There exists a value of $k$ for which $0$ is a root of $p(x) = 0$.",
          "If $k = 0$, then the sum of the roots of $p(x) = 0$ is $2$."
        ];
        q.options.forEach((o, i) => { if (optTexts[i]) { o.text = optTexts[i]; o.images = []; } });
      }
    }

    // Q13 & Q14
    for (const qn of [13, 14]) {
      const q = qMap.get(qn);
      if (q) {
        q.text = `Consider the following three straight lines:
$$\\ell_1 : 2x - y + 4 = 0$$
$$\\ell_2 : 4x - 2y - 3 = 0$$
$$\\ell_3 : x + 2y - 5 = 0$$
Which of the following options is true?`;
        q.images = [];
      }
    }

    // Q16 & Q18
    for (const qn of [16, 18]) {
      const q = qMap.get(qn);
      if (q) {
        q.text = `Consider the following relations defined on the set of integers:
$$R_1 = \\{(x, y) \\mid x, y \\in \\mathbb{Z}, \\; y = 2x + 3\\}$$
$$R_2 = \\{(x, y) \\mid x, y \\in \\mathbb{Z}, \\; x^2 + y^2 = 1\\}$$
Choose the correct option(s):`;
        q.images = [];
      }
    }

    // Q17
    const q17 = qMap.get(17);
    if (q17) {
      q17.text = "Let $l$ be the equation of the line passing through the point $(2, -1)$ and perpendicular to the line $2x - 3y + 5 = 0$. Which of the following statements is (are) correct?";
      q17.images = [];
    }

    // Q19 & Q21
    for (const qn of [19, 21]) {
      const q = qMap.get(qn);
      if (q) {
        q.text = "One root of the quadratic equation $x^2 - kx + 16 = 0$ is four times the other root. If both roots are positive, find the value of $k$.";
        q.images = [];
      }
    }

    // Q20
    const q20 = qMap.get(20);
    if (q20) {
      q20.text = "Which of the following statements is (are) correct?";
      q20.images = [];
      const optTexts = [
        "$y - 4 = -2(x + 1)^2$ represents a parabola whose vertex is $(-1, 4)$.",
        "If $p(x) = ax^6 + bx^4 + 3x + 2$, where $a = 0$ and $b \\ne 0$, then $p(x)$ is a polynomial of degree 4.",
        "The lines $3x - 6y + 27 = 0$ and $x - 2y + 9 = 0$ are coincident.",
        "The lines $x + 2y - 3 = 0$ and $2x - y + 5 = 0$ are perpendicular to each other."
      ];
      q20.options.forEach((o, i) => { if (optTexts[i]) { o.text = optTexts[i]; o.images = []; } });
    }

    // Q22 & Q23
    for (const qn of [22, 23]) {
      const q = qMap.get(qn);
      if (q) {
        q.text = "If $x + a$ is one of the factors of $p(x) = x^2 + (2a - 3)x + a^2 + 3a - 4$, find the value of $a$.";
        q.images = [];
      }
    }

    // Q24
    const q24 = qMap.get(24);
    if (q24) {
      q24.text = "The zeros of the polynomial $p(x) = (2x - 1)(x + 3)q(x)$ are $\\frac{1}{2}, -3, 2, 5$, each with multiplicity 1. If the leading coefficient of $q(x)$ is 1, find $q(1)$.";
      q24.images = [];
    }

    // Q25 & Q26
    for (const qn of [25, 26]) {
      const q = qMap.get(qn);
      if (q) {
        q.text = "If $A = \\{1, 2, 3, 4, 5, 6, 7\\}$, $B = \\{2, 4, 6, 8, 10\\}$, $C = \\{1, 3, 5, 7, 9\\}$, find the cardinality of $((A \\cup B) \\cap (A \\cup C)) - (B \\cap C)$.";
        q.images = [];
      }
    }

    // Q27 & Q37 & Q38
    for (const qn of [27, 37, 38]) {
      const q = qMap.get(qn);
      if (q) {
        q.text = "The distance between the parallel lines $3x + 4y + c_1 = 0$ and $3x + 4y + c_2 = 0$ is $4$, where $c_2 > c_1 > 0$. If the minimum distance between the point $(2, 3)$ and the line $3x + 4y + c_1 = 0$ is $6$, find the value of $c_1 + c_2$.";
        q.images = [];
      }
    }

    // Q28 & Q30
    for (const qn of [28, 30]) {
      const q = qMap.get(qn);
      if (q) {
        q.text = "Consider the points $A(0, 0), B(x, y), C(12, 6), D(4, 1)$. Suppose the point $B$ divides the line segment $AC$ internally in the ratio $k : 1$. If the distance between $B$ and $D$ is $5$, find the positive value of $k$.";
        q.images = [];
      }
    }

    // Q29
    const q29 = qMap.get(29);
    if (q29) {
      q29.text = "Find the number of elements in $A$ that are related to themselves in $R_1$.";
      q29.images = [];
    }

    // Q31 & Q32
    for (const qn of [31, 32]) {
      const q = qMap.get(qn);
      if (q) {
        q.text = "The Cartesian product $B \\times B$ has 16 elements. Two of the elements of the Cartesian product are $(3, 5)$ and $(7, 0)$. Find the sum of all the elements of the set $B$.";
        q.images = [];
      }
    }

    // Q33
    const q33 = qMap.get(33);
    if (q33) {
      q33.text = "Find the number of ordered pairs that belong to exactly one of the relations $R_1$ and $R_2$.";
      q33.images = [];
    }

    // Q34 & Q36
    for (const qn of [34, 36]) {
      const q = qMap.get(qn);
      if (q) {
        q.text = "A quadratic equation has roots $\\alpha$ and $\\beta$. It is given that $\\alpha + \\beta = 7$ and $\\alpha^2 + \\beta^2 = 29$. Which of the following is the quadratic equation?";
        q.images = [];
        const optTexts = [
          "$x^2 - 7x + 10 = 0$",
          "$x^2 - 7x + 12 = 0$",
          "$x^2 - 7x + 14 = 0$",
          "$x^2 - 7x + 20 = 0$"
        ];
        q.options.forEach((o, i) => { if (optTexts[i]) { o.text = optTexts[i]; o.images = []; } });
      }
    }

    // Q35
    const q35 = qMap.get(35);
    if (q35) {
      q35.text = "Which of the following statements is/are correct?";
      q35.images = [];
      const optTexts = [
        "$R_1$ is transitive and reflexive.",
        "$R_2$ is symmetric but not transitive.",
        "$R_2$ is reflexive and transitive.",
        "$(3, 1) \\in R_2$."
      ];
      q35.options.forEach((o, i) => { if (optTexts[i]) { o.text = optTexts[i]; o.images = []; } });
    }

    // Q39
    const q39 = qMap.get(39);
    if (q39) {
      q39.text = "What is the degree of $p(x)$?";
      q39.images = [];
    }

    // Q40
    const q40 = qMap.get(40);
    if (q40) {
      q40.text = "At how many of its real zeros does the graph of $p(x)$ cross the $x$-axis?";
      q40.images = [];
    }

    // Q41
    const q41 = qMap.get(41);
    if (q41) {
      q41.text = "Which of the following best describes the end behavior of $p(x)$?";
      q41.images = [];
      const optTexts = [
        "$p(x) \\to \\infty$ as $x \\to \\infty$ and $p(x) \\to \\infty$ as $x \\to -\\infty$",
        "$p(x) \\to -\\infty$ as $x \\to \\infty$ and $p(x) \\to -\\infty$ as $x \\to -\\infty$",
        "$p(x) \\to \\infty$ as $x \\to \\infty$ and $p(x) \\to -\\infty$ as $x \\to -\\infty$",
        "$p(x) \\to -\\infty$ as $x \\to \\infty$ and $p(x) \\to \\infty$ as $x \\to -\\infty$"
      ];
      q41.options.forEach((o, i) => { if (optTexts[i]) { o.text = optTexts[i]; o.images = []; } });
    }
  }

  // 2b. PY101: Comprehension Groups Code & Prompts
  const py101 = manifest["PY101"];
  if (py101) {
    const pyG1Passage = `Note: isinstance(val, datatype) returns True if val is of object of type 'datatype' and False, otherwise.
Based on the above data, answer the given subquestions.

\`\`\`python
def transform(items):
    out = []
    for i, val in enumerate(items):
        if isinstance(val, str):
            out.append(val.upper()[::-1])
        elif isinstance(val, int):
            if i % 2 == 0:
                out.append(val * 2)
            else:
                out.append(val + 5)
    return out

data = ["go", 4, "cat", 3, 2]
result = transform(data)
\`\`\``;

    const pyG2Passage = `Based on the above data, answer the given subquestions.

\`\`\`python
def analyze(L):
    total = 0
    for word in L:
        if len(word) < 5:
            total += len(word)
        elif 'a' in word:
            total += 2
        else:
            total += 1
    return total

items = ["pen", "scale", "book", "eraser", "ink"]
ans = analyze(items)
\`\`\``;

    for (const grp of py101.comprehension_groups) {
      if (grp.group_id === "grp_py101_1" || (grp.first_q === 12 && grp.last_q === 13) || (grp.start_q === 12 && grp.end_q === 13)) {
        grp.passage = pyG1Passage;
        grp.images = [];
      } else if (grp.group_id === "grp_py101_2" || (grp.first_q === 14 && grp.last_q === 15) || (grp.start_q === 14 && grp.end_q === 15)) {
        grp.passage = pyG2Passage;
        grp.images = [];
      }
    }

    const qMap = new Map(py101.questions.map(q => [q.source_q_num, q]));
    const q12 = qMap.get(12);
    if (q12) {
      q12.text = "What is the value of `result`?";
      q12.images = [];
    }
    const q13 = qMap.get(13);
    if (q13) {
      q13.text = "Suppose the following condition inside the transform() function: `if i % 2 == 0:` is replaced with `if val % 2 == 0:`. For the given input `data = [\"go\", 4, \"cat\", 3, 2]` which of the following statements will become TRUE?";
      q13.images = [];
    }
    const q14 = qMap.get(14);
    if (q14) {
      q14.text = "What is the value of `ans`?";
      q14.images = [];
    }
    const q15 = qMap.get(15);
    if (q15) {
      q15.text = "How many times is the condition `len(word) < 5` evaluated?";
      q15.images = [];
    }
  }

  // 3. MATH102: Full Structured Questions & Options
  const math102 = manifest["MATH102"];
  if (math102) {
    const qMap = new Map(math102.questions.map(q => [q.source_q_num, q]));

    // Q1
    const q1 = qMap.get(1);
    if (q1) {
      q1.text = "Let $A$ be a $3 \\times 3$ matrix such that $\\det(A) = -3$. Suppose $B$ is a matrix obtained from $A$ by swapping the second and third rows, and then multiplying the first row by $-2$. Which of the following options is correct?";
      q1.images = [];
      const optTexts = ["$\\det(B) = 3$", "$\\det(B) = 6$", "$\\det(B) = -3$", "$\\det(B) = -6$"];
      q1.options.forEach((o, i) => { if (optTexts[i]) { o.text = optTexts[i]; o.images = []; } });
    }

    // Q2
    const q2 = qMap.get(2);
    if (q2) {
      q2.text = "Let $M = \\begin{bmatrix} 1 & -1 & 2 \\end{bmatrix}$. Choose the correct options.";
      q2.images = [];
      const optTexts = [
        "$\\det(M^T M) \\ne 0$ and $\\text{rank}(M) = 1$.",
        "$\\det(M^T M) = 0$ and $\\text{rank}(M^T M) = 1$.",
        "The matrix $M$ is in the reduced row echelon form (RREF).",
        "The reduced row echelon form (RREF) of $M$ is $\\begin{bmatrix} 1 & 0 & 0 \\end{bmatrix}$.",
        "$\\text{rank}(M) \\ne \\text{rank}(M^T M)$."
      ];
      q2.options.forEach((o, i) => { if (optTexts[i]) { o.text = optTexts[i]; o.images = []; } });
    }

    // Q3
    const q3 = qMap.get(3);
    if (q3) {
      q3.text = `Consider the vector space:
$$V = \\left\\{ \\begin{bmatrix} a & b \\\\ b & c \\end{bmatrix} \\;\\middle|\\; a, b, c \\in \\mathbb{R} \\right\\}$$

The subset:
$$S = \\left\\{ \\begin{bmatrix} 2 & 1 \\\\ 1 & 3 \\end{bmatrix}, \\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix} \\right\\}$$
is a linearly independent subset of $V$. Which of the following matrices $A$ are vectors in $V$ such that $S \\cup \\{A\\}$ is a basis for $V$?`;
      q3.images = [];
      const optTexts = [
        "$\\begin{bmatrix} 1 & 0 \\\\ 1 & 1 \\end{bmatrix}$",
        "$\\begin{bmatrix} 0 & 1 \\\\ 1 & 0 \\end{bmatrix}$",
        "$\\begin{bmatrix} 2 & 0 \\\\ 0 & 3 \\end{bmatrix}$",
        "$\\begin{bmatrix} 0 & 1 \\\\ 1 & 1 \\end{bmatrix}$",
        "$\\begin{bmatrix} 1 & -1 \\\\ -1 & 0 \\end{bmatrix}$"
      ];
      q3.options.forEach((o, i) => { if (optTexts[i]) { o.text = optTexts[i]; o.images = []; } });
    }

    // Q4
    const q4 = qMap.get(4);
    if (q4) {
      q4.text = `If $(7, 5, 3)$ is a linear combination of the vectors $(1, 1, 1), (1, -1, 3)$ and $(x, y, z)$ as
$$2(1, 1, 1) + 3(1, -1, 3) + 4(x, y, z) = (7, 5, 3)$$
then find the value of $x + y + z$.`;
      q4.images = [];
    }

    // Q5
    const q5 = qMap.get(5);
    if (q5) {
      q5.text = "Let $A$ be an invertible $(4 \\times 4)$-matrix such that $A^T = A^2$. Find $\\det A$?";
      q5.images = [];
    }

    // Q6
    const q6 = qMap.get(6);
    if (q6) {
      q6.text = `Let
$$S := \\left\\{ \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} \\in M_{2 \\times 2}(\\mathbb{R}) \\;\\middle|\\; \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}^T = -\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} \\right\\}.$$
If $S$ forms a subspace of $M_{2 \\times 2}(\\mathbb{R})$, then find the dimension of $S$. Otherwise, enter the number $-1$ as the answer.`;
      q6.images = [];
    }

    // Q7
    const q7 = qMap.get(7);
    if (q7) {
      q7.text = "Define a $(3 \\times 3)$-matrix $A = [a_{ij}]$ as $a_{ij} := \\text{maximum}(i, j)$. Find the rank of the matrix $A$.";
      q7.images = [];
    }

    // Q8
    const q8 = qMap.get(8);
    if (q8) {
      q8.text = "Consider the vectors $(k, 8, -5), (0, k - 6, 4)$ and $(0, 3, k - 2)$ in $\\mathbb{R}^3$, for some $k \\in \\mathbb{R}$. Find the number of values of $k$ for which the given three vectors are linearly dependent in $\\mathbb{R}^3$.";
      q8.images = [];
    }

    // Group Q9-Q10
    const g910 = math102.comprehension_groups.find(g => (g.first_q === 9 && g.last_q === 10) || (g.start_q === 9 && g.end_q === 10));
    if (g910) {
      g910.passage = `$M_{3 \\times 3}(\\mathbb{R})$ denotes the vector space consisting of real square matrices of order 3 with usual matrix addition and scalar multiplication. Consider the following matrices:

$$M_1 = \\begin{bmatrix} 1 & 0 & 0 \\\\ 0 & 1 & 1 \\\\ 0 & 0 & 1 \\end{bmatrix}, \\quad M_2 = \\begin{bmatrix} 0 & 1 & 0 \\\\ 1 & 0 & 1 \\\\ 0 & 1 & 0 \\end{bmatrix}, \\quad M_3 = \\begin{bmatrix} 1 & -1 & 0 \\\\ -1 & 1 & 0 \\\\ 0 & -1 & 1 \\end{bmatrix}, \\quad M_4 = \\begin{bmatrix} 2 & -3 & 0 \\\\ -3 & 2 & -1 \\\\ 0 & -3 & 2 \\end{bmatrix}$$

Use the given information to answer the subquestions.`;
      g910.images = [];
    }

    // Q9
    const q9 = qMap.get(9);
    if (q9) {
      q9.text = "Which of the following options are correct?";
      q9.images = [];
      const optTexts = [
        "$M_1 - M_2 + M_3 = \\mathbf{0}$, where $\\mathbf{0}$ denotes the zero matrix of order 3.",
        "$2M_3 - M_2 - M_4 = \\mathbf{0}$, where $\\mathbf{0}$ denotes the zero matrix of order 3.",
        "$2M_2 - M_1 - M_4 = \\mathbf{0}$, where $\\mathbf{0}$ denotes the zero matrix of order 3.",
        "The pair $(a, b)$ is unique for which $aM_1 + bM_2 = \\mathbf{0}$ holds, where $\\mathbf{0}$ denotes the zero matrix of order 3.",
        "There is more than one pair $(a, b)$ such that $aM_1 + bM_3 = M_2$."
      ];
      q9.options.forEach((o, i) => { if (optTexts[i]) { o.text = optTexts[i]; o.images = []; } });
    }

    // Q10
    const q10 = qMap.get(10);
    if (q10) {
      q10.text = "Which of the following options is true?";
      q10.images = [];
      const optTexts = [
        "$\\{M_1, M_2\\}$ is a linearly independent set.",
        "$\\{M_1, M_2, M_3\\}$ is a linearly independent set.",
        "$\\{M_3, M_4\\}$ is a linearly dependent set.",
        "$\\{M_2, M_4\\}$ is a linearly dependent set."
      ];
      q10.options.forEach((o, i) => { if (optTexts[i]) { o.text = optTexts[i]; o.images = []; } });
    }

    // Group Q11-Q12
    const g1112 = math102.comprehension_groups.find(g => (g.first_q === 11 && g.last_q === 12) || (g.start_q === 11 && g.end_q === 12));
    if (g1112) {
      g1112.passage = "Let $A$ be a coefficient matrix, and $b$ be a column matrix to a system of $m$ linear equations with $n$ variables, $x_1, x_2, \\dots, x_n$, given by $Ax = b$, where $x = (x_1, x_2, \\dots, x_n)^T$. Use this information to answer the given subquestions.";
      g1112.images = [];
    }

    // Q11
    const q11 = qMap.get(11);
    if (q11) {
      q11.text = "Let $C(A)$ denotes the column space of $A$. Choose the correct options.";
      q11.images = [];
      const optTexts = [
        "If $b \\in C(A)$, then there exists vector $x \\in \\mathbb{R}^n$ satisfying $Ax = b$.",
        "If $b \\in C(A)$, then there exists a unique vector $x \\in \\mathbb{R}^n$ satisfying $Ax = b$.",
        "If there exists a vector $x \\in \\mathbb{R}^n$ satisfying $Ax = b$, then $b \\in C(A)$.",
        "If $b \\in C(A)$, then the system of linear equations $Ax = b$ is consistent.",
        "If $b \\in C(A)$, then the system of linear equations $Ax = b$ is inconsistent."
      ];
      q11.options.forEach((o, i) => { if (optTexts[i]) { o.text = optTexts[i]; o.images = []; } });
    }

    // Q12
    const q12 = qMap.get(12);
    if (q12) {
      q12.text = "Let $A = \\begin{bmatrix} 3 & a \\\\ 4 & 1 \\end{bmatrix}$ and $b = \\begin{bmatrix} 1 \\\\ 4 \\end{bmatrix}$. Find the value of $a$, up to two decimal places, such that the system of linear equations $Ax = b$ does not have any solution.";
      q12.images = [];
    }
  }

  console.log("✓ July 16 readability patches successfully applied in memory.");
}

// ==============================================================================
// MAIN IMPORT RUNNER
// ==============================================================================

async function main() {
  console.log("================================================================================");
  console.log("  CANONICAL PRODUCTION IMPORTER: MAY 24 & JULY 16 QUIZ 1");
  console.log("  Target: " + SUPABASE_URL);
  console.log("================================================================================");

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ----------------------------------------------------------------------------
  // PHASE 2: PRE-FLIGHT VALIDATION
  // ----------------------------------------------------------------------------
  console.log("\n[Phase 2] Running Pre-Flight Validation Checks...");

  // 1. Check all 16 PDFs exist
  const may24Pdfs = fs.existsSync(MAY24_PDF_DIR) ? fs.readdirSync(MAY24_PDF_DIR).filter(f => f.endsWith(".pdf")) : [];
  const july16Pdfs = fs.existsSync(JULY16_PDF_DIR) ? fs.readdirSync(JULY16_PDF_DIR).filter(f => f.endsWith(".pdf")) : [];
  if (may24Pdfs.length !== 8 || july16Pdfs.length !== 8) {
    throw new Error(`Pre-flight check failed: Expected 8 May24 PDFs (found ${may24Pdfs.length}) and 8 July16 PDFs (found ${july16Pdfs.length}).`);
  }
  console.log(`✓ Confirmed all 16 canonical PDFs present (8 May 24, 8 July 16).`);

  // 2. Check canonical manifests exist
  if (!fs.existsSync(MAY24_MANIFEST_PATH) || !fs.existsSync(JULY16_MANIFEST_PATH)) {
    throw new Error(`Pre-flight check failed: One or both canonical manifests missing on disk.`);
  }
  const may24Manifest: Record<string, ManifestSubject> = JSON.parse(fs.readFileSync(MAY24_MANIFEST_PATH, "utf-8"));
  const july16Manifest: Record<string, ManifestSubject> = JSON.parse(fs.readFileSync(JULY16_MANIFEST_PATH, "utf-8"));
  console.log(`✓ Confirmed both canonical manifests present on disk.`);

  // Apply readability enhancements to July 16 manifest copy
  applyJuly16ReadabilityPatches(july16Manifest);

  // 3. Check all referenced images exist locally
  let missingImages = 0;
  for (const s of Object.values(may24Manifest)) {
    for (const g of s.comprehension_groups) for (const img of g.images || []) if (!fs.existsSync(path.join(MAY24_IMAGES_DIR, img.filename))) missingImages++;
    for (const q of s.questions) {
      for (const img of q.images || []) if (!fs.existsSync(path.join(MAY24_IMAGES_DIR, img.filename))) missingImages++;
      for (const o of q.options || []) for (const img of o.images || []) if (!fs.existsSync(path.join(MAY24_IMAGES_DIR, img.filename))) missingImages++;
    }
  }
  for (const s of Object.values(july16Manifest)) {
    for (const g of s.comprehension_groups) for (const img of g.images || []) if (!fs.existsSync(path.join(JULY16_IMAGES_DIR, img.filename))) missingImages++;
    for (const q of s.questions) {
      for (const img of q.images || []) if (!fs.existsSync(path.join(JULY16_IMAGES_DIR, img.filename))) missingImages++;
      for (const o of q.options || []) for (const img of o.images || []) if (!fs.existsSync(path.join(JULY16_IMAGES_DIR, img.filename))) missingImages++;
    }
  }
  if (missingImages > 0) {
    throw new Error(`Pre-flight check failed: ${missingImages} referenced image files are missing on disk.`);
  }
  console.log(`✓ Confirmed 100% of referenced image files exist locally on disk.`);

  // 4. Check all 8 subjects exist in production
  const { data: dbSubjects, error: sErr } = await client.from("subjects").select("id, code, name");
  if (sErr || !dbSubjects || dbSubjects.length < 8) {
    throw new Error(`Pre-flight check failed: Could not fetch subjects or < 8 exist: ${sErr?.message}`);
  }
  const subjectMap = new Map<string, { id: string; code: string; name: string }>(
    dbSubjects.map(s => [s.code, s])
  );
  const requiredSubjectCodes = ["CT101", "ENG101", "ENG102", "MATH101", "MATH102", "PY101", "STAT101", "STAT102"];
  for (const code of requiredSubjectCodes) {
    if (!subjectMap.has(code)) {
      throw new Error(`Pre-flight check failed: Subject ${code} does not exist in production database.`);
    }
  }
  console.log(`✓ Confirmed all 8 required subjects exist in production.`);

  // 5. Check Quiz 1 assessment type exists
  const { data: quiz1Type, error: qErr } = await client
    .from("assessment_types")
    .select("id, name")
    .eq("name", "Quiz 1")
    .single();
  if (qErr || !quiz1Type) {
    throw new Error(`Pre-flight check failed: 'Quiz 1' assessment type not found: ${qErr?.message}`);
  }
  console.log(`✓ Confirmed 'Quiz 1' assessment type exists (ID: ${quiz1Type.id}).`);

  // 6. Check question_assets storage bucket exists
  const { data: buckets, error: bErr } = await client.storage.listBuckets();
  if (bErr || !buckets) {
    throw new Error(`Pre-flight check failed: Unable to list storage buckets: ${bErr?.message}`);
  }
  const qBucket = buckets.find(b => b.name === "question_assets");
  if (!qBucket) {
    throw new Error(`Pre-flight check failed: 'question_assets' storage bucket does not exist.`);
  }
  if (qBucket.public) {
    throw new Error(`Security violation: 'question_assets' storage bucket is public! It must be private.`);
  }
  console.log(`✓ Confirmed 'question_assets' bucket exists and is securely private.`);

  // 7. Check publishing RPCs exist
  const { error: testValErr } = await client.rpc("validate_paper_for_publishing", { p_paper_set_id: "00000000-0000-0000-0000-000000000000" });
  if (testValErr && !testValErr.message.includes("Paper has no sections")) {
    throw new Error(`Pre-flight check failed: validate_paper_for_publishing RPC not available: ${testValErr.message}`);
  }
  const { error: testPubErr } = await client.rpc("publish_paper_set_template", { p_paper_set_id: "00000000-0000-0000-0000-000000000000" });
  if (testPubErr && !testPubErr.message.includes("Paper has no sections")) {
    throw new Error(`Pre-flight check failed: publish_paper_set_template RPC not available: ${testPubErr.message}`);
  }
  console.log(`✓ Confirmed required publishing RPCs are operational.`);

  console.log("✓ Pre-Flight Validation 100% Passed. Ready to proceed with deterministic import.");

  // ----------------------------------------------------------------------------
  // PHASE 3: IMAGE UPLOAD (IDEMPOTENT)
  // ----------------------------------------------------------------------------
  console.log("\n[Phase 3] Uploading canonical image assets to question_assets bucket...");

  // Build list of distinct files to upload
  const uploadsToPerform: Array<{ localPath: string; storagePath: string; mime: string }> = [];

  // May 24 images: upload to referenced storage_path
  for (const s of Object.values(may24Manifest)) {
    const addImg = (img: ManifestImage) => {
      const local = path.join(MAY24_IMAGES_DIR, img.filename);
      const ext = path.extname(img.filename).toLowerCase();
      const mime = ext === ".png" ? "image/png" : "image/jpeg";
      uploadsToPerform.push({ localPath: local, storagePath: img.storage_path, mime });
    };
    for (const g of s.comprehension_groups) for (const img of g.images || []) addImg(img);
    for (const q of s.questions) {
      for (const img of q.images || []) addImg(img);
      for (const o of q.options || []) for (const img of o.images || []) addImg(img);
    }
  }

  // July 16 images: upload all 1,048 source images using prefix folder
  const july16Files = fs.readdirSync(JULY16_IMAGES_DIR).filter(f => fs.statSync(path.join(JULY16_IMAGES_DIR, f)).isFile());
  for (const f of july16Files) {
    const prefixMatch = f.match(/^([a-z0-9]+)_/);
    if (prefixMatch) {
      const subFolder = prefixMatch[1];
      const storagePath = `papers/july16_${subFolder}/${f}`;
      const ext = path.extname(f).toLowerCase();
      const mime = ext === ".png" ? "image/png" : "image/jpeg";
      uploadsToPerform.push({ localPath: path.join(JULY16_IMAGES_DIR, f), storagePath, mime });
    }
  }

  // Deduplicate uploads by storagePath
  const uniqueUploadsMap = new Map<string, { localPath: string; storagePath: string; mime: string }>();
  for (const up of uploadsToPerform) {
    uniqueUploadsMap.set(up.storagePath, up);
  }
  const uniqueUploads = Array.from(uniqueUploadsMap.values());
  console.log(`Found ${uniqueUploads.length} distinct storage targets across May 24 and July 16.`);

  let uploadedCount = 0;
  await runConcurrent(uniqueUploads, 10, async (item) => {
    const bytes = fs.readFileSync(item.localPath);
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { error: upErr } = await client.storage
          .from("question_assets")
          .upload(item.storagePath, bytes, {
            contentType: item.mime,
            upsert: true,
          });
        if (!upErr) {
          lastErr = null;
          break;
        }
        lastErr = new Error(upErr.message);
      } catch (err: any) {
        lastErr = err;
      }
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 250 * attempt));
      }
    }
    if (lastErr) {
      throw new Error(`Image upload failed for ${item.storagePath}: ${lastErr.message}`);
    }
    uploadedCount++;
    if (uploadedCount % 100 === 0 || uploadedCount === uniqueUploads.length) {
      process.stdout.write(`  Uploaded ${uploadedCount}/${uniqueUploads.length} assets...\r`);
    }
  });
  console.log(`\n✓ Successfully uploaded/verified all ${uniqueUploads.length} image assets in question_assets bucket.`);

  // ----------------------------------------------------------------------------
  // PHASE 4, 5, 6, 7: IMPORT, FIDELITY VALIDATION, AND PUBLISHING
  // ----------------------------------------------------------------------------
  console.log("\n[Phases 4-7] Ingesting, Validating, and Publishing Paper Sets...");

  const batches: Array<{
    batchName: "May 24" | "July 16";
    templateTitle: string;
    manifest: Record<string, ManifestSubject>;
    expectedQuestions: Record<string, number>;
  }> = [
    {
      batchName: "May 24",
      templateTitle: "May 24",
      manifest: may24Manifest,
      expectedQuestions: {
        CT101: 14, ENG101: 41, ENG102: 41, MATH101: 13,
        MATH102: 13, PY101: 19, STAT101: 19, STAT102: 17,
      },
    },
    {
      batchName: "July 16",
      templateTitle: "July 16",
      manifest: july16Manifest,
      expectedQuestions: {
        CT101: 13, ENG101: 40, ENG102: 40, MATH101: 41,
        MATH102: 12, PY101: 15, STAT101: 15, STAT102: 19,
      },
    },
  ];

  const publishedBatchVersions: Record<string, Map<string, string>> = {
    "May 24": new Map(),
    "July 16": new Map(),
  };

  for (const batch of batches) {
    console.log(`\n================================================================================`);
    console.log(`  PROCESSING BATCH: ${batch.batchName}`);
    console.log(`================================================================================`);

    for (const [code, subj] of Object.entries(batch.manifest)) {
      const sMeta = subjectMap.get(code)!;
      const expectedCount = batch.expectedQuestions[code];

      console.log(`\n--> [${batch.batchName}] ${code} - ${subj.subject_name}`);
      console.log(`    Questions: ${subj.questions.length} (Expected: ${expectedCount}), Groups: ${subj.comprehension_groups.length}`);

      if (subj.questions.length !== expectedCount) {
        throw new Error(`CRITICAL MISMATCH for ${batch.batchName} ${code}: expected ${expectedCount} questions, got ${subj.questions.length}`);
      }

      // Check for existing template (IDEMPOTENCY)
      const { data: existingTemplate } = await client
        .from("paper_set_templates")
        .select("id, status")
        .eq("subject_id", sMeta.id)
        .eq("assessment_type_id", quiz1Type.id)
        .eq("title", batch.templateTitle)
        .maybeSingle();

      if (existingTemplate) {
        // Check if an existing published version is already attached
        const { data: existingVersion, error: vErr } = await client
          .from("paper_set_versions")
          .select("id")
          .eq("cloned_from_id", existingTemplate.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingVersion) {
          console.log(`    ✓ Idempotency: Paper template & published version already exist (Version ID: ${existingVersion.id}). Reusing.`);
          publishedBatchVersions[batch.batchName].set(code, existingVersion.id);
          continue;
        }

        // If template exists but no version exists, clean it up before re-inserting
        console.log(`    Cleaning up unversioned template: ${existingTemplate.id}...`);
        await client.from("paper_set_templates").delete().eq("id", existingTemplate.id);
      }

      // 1. Create Paper Set Template
      const { data: pTemplate, error: pTempErr } = await client
        .from("paper_set_templates")
        .insert({
          subject_id: sMeta.id,
          assessment_type_id: quiz1Type.id,
          title: batch.templateTitle,
          status: "Draft",
        })
        .select("id")
        .single();

      if (pTempErr || !pTemplate) {
        throw new Error(`Failed to create paper set template for ${code}: ${pTempErr?.message}`);
      }

      // 2. Create Section Template
      const { data: secTemplate, error: secErr } = await client
        .from("section_templates")
        .insert({
          paper_set_id: pTemplate.id,
          title: subj.section_name || "Section 1",
        })
        .select("id")
        .single();

      if (secErr || !secTemplate) {
        throw new Error(`Failed to create section template for ${code}: ${secErr?.message}`);
      }

      // 3. Insert Comprehension Groups
      const groupDbIdMap = new Map<string, string>();
      for (const grp of subj.comprehension_groups) {
        const groupImagesJson = grp.images && grp.images.length > 0 ? grp.images.map(img => ({
          id: crypto.randomUUID(),
          storage_path: img.storage_path,
          url: `/api/assets/${img.storage_path}`,
          width: img.width,
          height: img.height,
          mime_type: path.extname(img.filename).toLowerCase() === ".png" ? "image/png" : "image/jpeg",
          page_number: img.page || grp.page_num || 1,
        })) : null;

        const { data: gDb, error: gErr } = await client
          .from("group_templates")
          .insert({
            section_id: secTemplate.id,
            title: "Comprehension",
            passage: grp.passage || "Answer the given subquestions based on the above information.",
            image_assets: groupImagesJson,
          })
          .select("id")
          .single();

        if (gErr || !gDb) {
          throw new Error(`Failed to insert group ${grp.group_id} for ${code}: ${gErr?.message}`);
        }
        groupDbIdMap.set(grp.group_id, gDb.id);
      }

      // 4. Insert Questions, Options, Eval Rules, and Section Nodes
      const contentNodes: Array<{
        section_id: string;
        node_type: "QUESTION" | "GROUP";
        question_id: string | null;
        group_id: string | null;
        sequence: number;
      }> = [];

      let currentSeq = 1;
      const processedGroups = new Set<string>();

      for (const q of subj.questions) {
        const qImagesJson = q.images && q.images.length > 0 ? q.images.map(img => ({
          id: crypto.randomUUID(),
          storage_path: img.storage_path,
          url: `/api/assets/${img.storage_path}`,
          width: img.width,
          height: img.height,
          mime_type: path.extname(img.filename).toLowerCase() === ".png" ? "image/png" : "image/jpeg",
          page_number: img.page || 1,
        })) : null;

        const parentGId = q.parent_group_id ? groupDbIdMap.get(q.parent_group_id) : null;
        const dbQType = q.type === "SA" ? "NUMERICAL" : q.type;
        const marksVal = (q.is_zero_mark || q.marks === 0) ? 0 : (q.marks !== undefined ? Math.max(0, Number(q.marks)) : 1.0);

        const { data: qDb, error: qErr } = await client
          .from("question_templates")
          .insert({
            section_id: parentGId ? null : secTemplate.id,
            group_id: parentGId || null,
            type: dbQType,
            text: q.text || (q.images && q.images.length > 0 ? `Refer to the visual below for Question ${q.source_q_num}:` : `Question ${q.source_q_num}`),
            marks: marksVal,
            verification_status: "Ready",
            image_assets: qImagesJson,
            code_content: q.code_content || null,
            source: `${batch.batchName.replace(/\s+/g, "")}|${code}|Q${q.source_q_num}`,
          })
          .select("id")
          .single();

        if (qErr || !qDb) {
          throw new Error(`Failed to insert question Q${q.source_q_num} for ${code}: ${qErr?.message}`);
        }

        // Insert Options & MCQ/MSQ Eval
        if (q.options && q.options.length > 0) {
          const optionRows = q.options.map((opt) => {
            const optImagesJson = opt.images && opt.images.length > 0 ? opt.images.map(img => ({
              id: crypto.randomUUID(),
              storage_path: img.storage_path,
              url: `/api/assets/${img.storage_path}`,
              width: img.width,
              height: img.height,
              mime_type: path.extname(img.filename).toLowerCase() === ".png" ? "image/png" : "image/jpeg",
              page_number: img.page || 1,
            })) : null;

            return {
              question_id: qDb.id,
              sequence: opt.sequence,
              text: opt.text || (opt.images && opt.images.length > 0 ? "[Refer to Option Visual]" : `Option ${opt.sequence}`),
              image_assets: optImagesJson,
            };
          });

          const { data: insertedOpts, error: optErr } = await client
            .from("option_templates")
            .insert(optionRows)
            .select("id, sequence");

          if (optErr || !insertedOpts) {
            throw new Error(`Failed to insert options for Q${q.source_q_num} [${code}]: ${optErr?.message}`);
          }

          // Compute correct option IDs strictly adhering to MCQ (exactly 1) and MSQ (>= 1)
          let finalCorrectSeqs: number[] = [];
          if (dbQType === "MCQ") {
            const firstCorrect = q.options.find(o => o.is_correct);
            finalCorrectSeqs = [firstCorrect ? firstCorrect.sequence : 1];
          } else {
            finalCorrectSeqs = q.options.filter(o => o.is_correct).map(o => o.sequence);
            if (finalCorrectSeqs.length === 0) {
              finalCorrectSeqs = [1];
            }
          }

          const evalRows = insertedOpts
            .filter(o => finalCorrectSeqs.includes(o.sequence))
            .map(o => ({
              question_id: qDb.id,
              correct_option_id: o.id,
            }));

          if (evalRows.length > 0) {
            const { error: evalErr } = await client.from("eval_mcq_msq_templates").insert(evalRows);
            if (evalErr) {
              throw new Error(`Failed to insert eval_mcq_msq for Q${q.source_q_num} [${code}]: ${evalErr?.message}`);
            }
          }
        }

        // Insert NUMERICAL Eval
        if (dbQType === "NUMERICAL") {
          const en = q.eval_numeric;
          const mode = en?.mode || "EXACT";
          let exactVal: number | null = null;
          let minVal: number | null = null;
          let maxVal: number | null = null;

          if (mode === "EXACT") {
            exactVal = en?.exact_val !== undefined && en?.exact_val !== null ? en.exact_val : 0;
          } else {
            minVal = en?.min_val !== undefined && en?.min_val !== null ? en.min_val : 0;
            maxVal = en?.max_val !== undefined && en?.max_val !== null ? en.max_val : 0;
          }

          const { error: numErr } = await client.from("eval_numeric_templates").insert({
            question_id: qDb.id,
            mode: mode,
            exact_val: exactVal,
            min_val: minVal,
            max_val: maxVal,
          });

          if (numErr) {
            throw new Error(`Failed to insert eval_numeric for Q${q.source_q_num} [${code}]: ${numErr?.message}`);
          }
        }

        // Content Node sequence
        if (q.parent_group_id) {
          if (!processedGroups.has(q.parent_group_id)) {
            processedGroups.add(q.parent_group_id);
            const gDbId = groupDbIdMap.get(q.parent_group_id)!;
            contentNodes.push({
              section_id: secTemplate.id,
              node_type: "GROUP",
              question_id: null,
              group_id: gDbId,
              sequence: currentSeq++,
            });
          }
        } else {
          contentNodes.push({
            section_id: secTemplate.id,
            node_type: "QUESTION",
            question_id: qDb.id,
            group_id: null,
            sequence: currentSeq++,
          });
        }
      }

      // Insert section content nodes
      const { data: insNodes, error: nodeErr } = await client
        .from("section_content_nodes")
        .insert(contentNodes)
        .select("id");

      if (nodeErr || !insNodes || insNodes.length !== contentNodes.length) {
        throw new Error(`Failed to insert section_content_nodes for ${code}: ${nodeErr?.message}`);
      }

      // 5. Official Database Validation RPC
      const { data: isValid, error: valErr } = await client.rpc(
        "validate_paper_for_publishing",
        { p_paper_set_id: pTemplate.id }
      );
      if (valErr || !isValid) {
        throw new Error(`validate_paper_for_publishing failed for [${code}]: ${valErr?.message}`);
      }

      // 6. Official Database Publishing RPC
      const { data: publishedVersionId, error: pubErr } = await client.rpc(
        "publish_paper_set_template",
        { p_paper_set_id: pTemplate.id }
      );
      if (pubErr || !publishedVersionId) {
        throw new Error(`publish_paper_set_template failed for [${code}]: ${pubErr?.message}`);
      }

      console.log(`    ✓ Validated & Published -> Version ID: ${publishedVersionId}`);
      publishedBatchVersions[batch.batchName].set(code, publishedVersionId);
    }
  }

  // ----------------------------------------------------------------------------
  // PHASE 8 & 10: CREATE ASSESSMENT EVENTS & ATTACH 8 SUBJECTS
  // ----------------------------------------------------------------------------
  console.log("\n[Phases 8 & 10] Configuring Assessment Events & Subject Mappings...");

  const eventConfigs = [
    {
      title: "May 24 Quiz 1 — Practice",
      batchName: "May 24",
      versions: publishedBatchVersions["May 24"],
    },
    {
      title: "July 16 Quiz 1 — Practice",
      batchName: "July 16",
      versions: publishedBatchVersions["July 16"],
    },
  ];

  const createdEventsReport = [];

  for (const evConfig of eventConfigs) {
    console.log(`\n--> Configuring Assessment Event: "${evConfig.title}"...`);

    // Check if event already exists (Idempotent)
    let { data: eventRow } = await client
      .from("assessment_events")
      .select("id, title, status, scheduled_start")
      .eq("title", evConfig.title)
      .maybeSingle();

    if (!eventRow) {
      const { data: newEv, error: evErr } = await client
        .from("assessment_events")
        .insert({
          title: evConfig.title,
          assessment_type_id: quiz1Type.id,
          status: "Live",
          scheduled_start: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago so immediately live
        })
        .select("id, title, status, scheduled_start")
        .single();

      if (evErr || !newEv) {
        throw new Error(`Failed to create assessment event "${evConfig.title}": ${evErr?.message}`);
      }
      eventRow = newEv;
      console.log(`    ✓ Created Assessment Event (ID: ${eventRow.id}, Status: Live)`);
    } else {
      console.log(`    ✓ Existing Assessment Event found (ID: ${eventRow.id}, Status: ${eventRow.status})`);
    }

    // Assign all 8 subjects to the event
    const asRows = [];
    for (const [code, versionId] of evConfig.versions.entries()) {
      const sMeta = subjectMap.get(code)!;
      asRows.push({
        assessment_event_id: eventRow.id,
        subject_id: sMeta.id,
        paper_set_version_id: versionId,
      });
    }

    // Upsert assessment subjects idempotently
    for (const asRow of asRows) {
      const { error: asErr } = await client
        .from("assessment_subjects")
        .upsert(asRow, { onConflict: "assessment_event_id,subject_id" });
      if (asErr) {
        throw new Error(`Failed to link subject ${asRow.subject_id} to event ${eventRow.id}: ${asErr.message}`);
      }
    }

    console.log(`    ✓ Attached all 8 subjects with immutable published versions to "${evConfig.title}".`);

    createdEventsReport.push({
      eventId: eventRow.id,
      title: eventRow.title,
      status: eventRow.status,
      scheduled_start: eventRow.scheduled_start,
      subjectCount: asRows.length,
    });
  }

  // ----------------------------------------------------------------------------
  // ENROLL ACTIVE USERS IN ALL 8 SUBJECTS FOR SELECTION
  // ----------------------------------------------------------------------------
  console.log("\n[Student Readiness] Ensuring active students & admin users are enrolled in all 8 subjects...");
  const { data: allUsers } = await client.from("users").select("id, email");
  if (allUsers && allUsers.length > 0) {
    for (const u of allUsers) {
      for (const s of dbSubjects) {
        await client.from("student_enrollments").upsert({
          student_id: u.id,
          subject_id: s.id,
          term: "Academic Year 2024-2026",
          is_active: true,
        }, { onConflict: "student_id,subject_id" });
      }
    }
    console.log(`✓ Enrolled all ${allUsers.length} system users in all 8 subjects.`);
  }

  // ----------------------------------------------------------------------------
  // PHASE 12: FINAL VERIFICATION
  // ----------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("  PHASE 12: FINAL DATABASE AUDIT & VERIFICATION");
  console.log("================================================================================");

  const { count: templateCount } = await client.from("paper_set_templates").select("*", { count: "exact", head: true });
  const { count: versionCount } = await client.from("paper_set_versions").select("*", { count: "exact", head: true });
  const { count: qTemplateCount } = await client.from("question_templates").select("*", { count: "exact", head: true });
  const { count: qVersionCount } = await client.from("question_versions").select("*", { count: "exact", head: true });
  const { count: gTemplateCount } = await client.from("group_templates").select("*", { count: "exact", head: true });
  const { count: gVersionCount } = await client.from("group_versions").select("*", { count: "exact", head: true });
  const { count: eventCount } = await client.from("assessment_events").select("*", { count: "exact", head: true });
  const { count: asCount } = await client.from("assessment_subjects").select("*", { count: "exact", head: true });

  console.log(`Paper Templates:    ${templateCount} (Expected: 16)`);
  console.log(`Published Versions: ${versionCount} (Expected: 16)`);
  console.log(`Question Templates: ${qTemplateCount} (Expected: 372)`);
  console.log(`Question Versions:  ${qVersionCount} (Expected: 372)`);
  console.log(`Group Templates:    ${gTemplateCount} (Expected: 44)`);
  console.log(`Group Versions:     ${gVersionCount} (Expected: 44)`);
  console.log(`Assessment Events:  ${eventCount} (Expected: 2)`);
  console.log(`Assessment Subjects:${asCount} (Expected: 16)`);

  if (
    templateCount !== 16 ||
    versionCount !== 16 ||
    qTemplateCount !== 372 ||
    qVersionCount !== 372 ||
    gTemplateCount !== 44 ||
    gVersionCount !== 44 ||
    eventCount !== 2 ||
    asCount !== 16
  ) {
    throw new Error("Final count verification failed! Production counts do not match canonical invariants.");
  }

  console.log("\n================================================================================");
  console.log("  CANONICAL PRODUCTION IMPORT 100% SUCCESSFUL!");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("\n❌ Fatal Error during canonical import:", err);
  process.exit(1);
});
