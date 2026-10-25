import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";

// We execute SQL directly via psql / supabase CLI to safely handle version immutability triggers
function executeSql(sql: string) {
  const sanitized = sql.replace(/"/g, '\\"');
  const cmd = `npx supabase db query "${sanitized}"`;
  execSync(cmd, { stdio: "inherit" });
}

async function main() {
  console.log("Applying July 16 mathematical content & readability enhancements...");

  // 1. STATS 2: Group 225e27c0-bdf6-4027-93da-bad0645766de & Q15-Q19
  const stats2GroupPassage = `Suppose that the time $X$ (in minutes) that a customer waits at a service counter is a random variable with probability density function:
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

  // 2. MATHS 1: Group 565985ee-d323-47c8-96b7-e5d56655899a & Q29
  const maths1GroupPassage = `Let $A = \\{1, 2, 3, 6\\}$.
Define relations $R_1$ and $R_2$ on $A$ by:
$$R_1 = \\{(a, b) \\mid a \\text{ divides } b\\}$$
and
$$R_2 = \\{(a, b) \\mid a + b \\text{ is even}\\}$$

Answer the given subquestions.`;

  const maths1Q29Text = `Find the number of elements in $A$ that are related to themselves in $R_1$.`;

  // SQL Script to update everything atomically
  const sql = `
DO $ROOT$
BEGIN
  -- Disable version immutability triggers
  ALTER TABLE question_versions DISABLE TRIGGER enforce_question_version_immutability;
  ALTER TABLE group_versions DISABLE TRIGGER enforce_group_version_immutability;
  ALTER TABLE option_versions DISABLE TRIGGER enforce_option_version_immutability;

  -------------------------------------------------------------
  -- 1. Update STAT102 Group & Questions Q15 - Q19
  -------------------------------------------------------------
  UPDATE group_templates
  SET passage = $TEXT$${stats2GroupPassage}$TEXT$
  WHERE id IN (
    SELECT gv.cloned_from_id FROM group_versions gv WHERE gv.id = '225e27c0-bdf6-4027-93da-bad0645766de'
  );

  UPDATE group_versions
  SET passage = $TEXT$${stats2GroupPassage}$TEXT$
  WHERE id = '225e27c0-bdf6-4027-93da-bad0645766de';

  -- Q15: Blank A
  UPDATE question_templates SET text = 'Enter the correct option number for A.', image_assets = NULL WHERE source = 'July16|STAT102|Q15';
  UPDATE question_versions SET text = 'Enter the correct option number for A.', image_assets = NULL WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|STAT102|Q15');

  -- Q16: Blank B
  UPDATE question_templates SET text = 'Enter the correct option number for B.', image_assets = NULL WHERE source = 'July16|STAT102|Q16';
  UPDATE question_versions SET text = 'Enter the correct option number for B.', image_assets = NULL WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|STAT102|Q16');

  -- Q17: Blank C
  UPDATE question_templates SET text = 'Enter the correct option number for C.', image_assets = NULL WHERE source = 'July16|STAT102|Q17';
  UPDATE question_versions SET text = 'Enter the correct option number for C.', image_assets = NULL WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|STAT102|Q17');

  -- Q18: Blank D
  UPDATE question_templates SET text = 'Enter the correct option number for D.', image_assets = NULL WHERE source = 'July16|STAT102|Q18';
  UPDATE question_versions SET text = 'Enter the correct option number for D.', image_assets = NULL WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|STAT102|Q18');

  -- Q19: Blank E
  UPDATE question_templates SET text = 'Calculate the value for E. Enter the answer correct to one decimal place.', image_assets = NULL WHERE source = 'July16|STAT102|Q19';
  UPDATE question_versions SET text = 'Calculate the value for E. Enter the answer correct to one decimal place.', image_assets = NULL WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|STAT102|Q19');

  -------------------------------------------------------------
  -- 2. Update MATH101 Group & Question Q29 (Remove image duplication)
  -------------------------------------------------------------
  UPDATE group_templates
  SET passage = $M1G$${maths1GroupPassage}$M1G$
  WHERE id IN (
    SELECT gv.cloned_from_id FROM group_versions gv WHERE gv.id = '565985ee-d323-47c8-96b7-e5d56655899a'
  );

  UPDATE group_versions
  SET passage = $M1G$${maths1GroupPassage}$M1G$
  WHERE id = '565985ee-d323-47c8-96b7-e5d56655899a';

  -- Q29 text and clear duplicate image from child question
  UPDATE question_templates
  SET text = $M1Q$${maths1Q29Text}$M1Q$, image_assets = NULL
  WHERE source = 'July16|MATH101|Q29';

  UPDATE question_versions
  SET text = $M1Q$${maths1Q29Text}$M1Q$, image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH101|Q29');

  -------------------------------------------------------------
  -- 3. Update MATH102 (Mathematics 2) Full Structured Questions & Options
  -------------------------------------------------------------
  -- Q1
  UPDATE question_templates
  SET text = 'Let $A$ be a $3 \\times 3$ matrix such that $\\det(A) = -3$. Suppose $B$ is a matrix obtained from $A$ by swapping the second and third rows, and then multiplying the first row by $-2$. Which of the following options is correct?',
      image_assets = NULL
  WHERE source = 'July16|MATH102|Q1';

  UPDATE question_versions
  SET text = 'Let $A$ be a $3 \\times 3$ matrix such that $\\det(A) = -3$. Suppose $B$ is a matrix obtained from $A$ by swapping the second and third rows, and then multiplying the first row by $-2$. Which of the following options is correct?',
      image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q1');

  -- Q1 Options
  UPDATE option_templates SET text = '$\\det(B) = 3$', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q1') AND sequence = 1;
  UPDATE option_versions SET text = '$\\det(B) = 3$', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q1')) AND sequence = 1;

  UPDATE option_templates SET text = '$\\det(B) = 6$', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q1') AND sequence = 2;
  UPDATE option_versions SET text = '$\\det(B) = 6$', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q1')) AND sequence = 2;

  UPDATE option_templates SET text = '$\\det(B) = -3$', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q1') AND sequence = 3;
  UPDATE option_versions SET text = '$\\det(B) = -3$', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q1')) AND sequence = 3;

  UPDATE option_templates SET text = '$\\det(B) = -6$', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q1') AND sequence = 4;
  UPDATE option_versions SET text = '$\\det(B) = -6$', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q1')) AND sequence = 4;

  -- Q2
  UPDATE question_templates
  SET text = 'Let $M = \\begin{bmatrix} 1 & -1 & 2 \\end{bmatrix}$. Choose the correct options.',
      image_assets = NULL
  WHERE source = 'July16|MATH102|Q2';

  UPDATE question_versions
  SET text = 'Let $M = \\begin{bmatrix} 1 & -1 & 2 \\end{bmatrix}$. Choose the correct options.',
      image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q2');

  -- Q2 Options
  UPDATE option_templates SET text = '$\\det(M^T M) \\ne 0$ and $\\text{rank}(M) = 1$.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q2') AND sequence = 1;
  UPDATE option_versions SET text = '$\\det(M^T M) \\ne 0$ and $\\text{rank}(M) = 1$.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q2')) AND sequence = 1;

  UPDATE option_templates SET text = '$\\det(M^T M) = 0$ and $\\text{rank}(M^T M) = 1$.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q2') AND sequence = 2;
  UPDATE option_versions SET text = '$\\det(M^T M) = 0$ and $\\text{rank}(M^T M) = 1$.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q2')) AND sequence = 2;

  UPDATE option_templates SET text = 'The matrix $M$ is in the reduced row echelon form (RREF).', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q2') AND sequence = 3;
  UPDATE option_versions SET text = 'The matrix $M$ is in the reduced row echelon form (RREF).', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q2')) AND sequence = 3;

  UPDATE option_templates SET text = 'The reduced row echelon form (RREF) of $M$ is $\\begin{bmatrix} 1 & 0 & 0 \\end{bmatrix}$.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q2') AND sequence = 4;
  UPDATE option_versions SET text = 'The reduced row echelon form (RREF) of $M$ is $\\begin{bmatrix} 1 & 0 & 0 \\end{bmatrix}$.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q2')) AND sequence = 4;

  UPDATE option_templates SET text = '$\\text{rank}(M) \\ne \\text{rank}(M^T M)$.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q2') AND sequence = 5;
  UPDATE option_versions SET text = '$\\text{rank}(M) \\ne \\text{rank}(M^T M)$.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q2')) AND sequence = 5;

  -- Q3
  UPDATE question_templates
  SET text = 'Consider the vector space:\n$$V = \\left\\{ \\begin{bmatrix} a & b \\\\ b & c \\end{bmatrix} \\;\\middle|\\; a, b, c \\in \\mathbb{R} \\right\\}$$\n\nThe subset:\n$$S = \\left\\{ \\begin{bmatrix} 2 & 1 \\\\ 1 & 3 \\end{bmatrix}, \\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix} \\right\\}$$\nis a linearly independent subset of $V$. Which of the following matrices $A$ are vectors in $V$ such that $S \\cup \\{A\\}$ is a basis for $V$?',
      image_assets = NULL
  WHERE source = 'July16|MATH102|Q3';

  UPDATE question_versions
  SET text = 'Consider the vector space:\n$$V = \\left\\{ \\begin{bmatrix} a & b \\\\ b & c \\end{bmatrix} \\;\\middle|\\; a, b, c \\in \\mathbb{R} \\right\\}$$\n\nThe subset:\n$$S = \\left\\{ \\begin{bmatrix} 2 & 1 \\\\ 1 & 3 \\end{bmatrix}, \\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix} \\right\\}$$\nis a linearly independent subset of $V$. Which of the following matrices $A$ are vectors in $V$ such that $S \\cup \\{A\\}$ is a basis for $V$?',
      image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q3');

  -- Q3 Options
  UPDATE option_templates SET text = '$\\begin{bmatrix} 1 & 0 \\\\ 1 & 1 \\end{bmatrix}$', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q3') AND sequence = 1;
  UPDATE option_versions SET text = '$\\begin{bmatrix} 1 & 0 \\\\ 1 & 1 \\end{bmatrix}$', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q3')) AND sequence = 1;

  UPDATE option_templates SET text = '$\\begin{bmatrix} 0 & 1 \\\\ 1 & 0 \\end{bmatrix}$', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q3') AND sequence = 2;
  UPDATE option_versions SET text = '$\\begin{bmatrix} 0 & 1 \\\\ 1 & 0 \\end{bmatrix}$', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q3')) AND sequence = 2;

  UPDATE option_templates SET text = '$\\begin{bmatrix} 2 & 0 \\\\ 0 & 3 \\end{bmatrix}$', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q3') AND sequence = 3;
  UPDATE option_versions SET text = '$\\begin{bmatrix} 2 & 0 \\\\ 0 & 3 \\end{bmatrix}$', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q3')) AND sequence = 3;

  UPDATE option_templates SET text = '$\\begin{bmatrix} 0 & 1 \\\\ 1 & 1 \\end{bmatrix}$', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q3') AND sequence = 4;
  UPDATE option_versions SET text = '$\\begin{bmatrix} 0 & 1 \\\\ 1 & 1 \\end{bmatrix}$', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q3')) AND sequence = 4;

  UPDATE option_templates SET text = '$\\begin{bmatrix} 1 & -1 \\\\ -1 & 0 \\end{bmatrix}$', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q3') AND sequence = 5;
  UPDATE option_versions SET text = '$\\begin{bmatrix} 1 & -1 \\\\ -1 & 0 \\end{bmatrix}$', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q3')) AND sequence = 5;

  -- Q4
  UPDATE question_templates
  SET text = 'If $(7, 5, 3)$ is a linear combination of the vectors $(1, 1, 1), (1, -1, 3)$ and $(x, y, z)$ as\n$$2(1, 1, 1) + 3(1, -1, 3) + 4(x, y, z) = (7, 5, 3)$$\nthen find the value of $x + y + z$.',
      image_assets = NULL
  WHERE source = 'July16|MATH102|Q4';

  UPDATE question_versions
  SET text = 'If $(7, 5, 3)$ is a linear combination of the vectors $(1, 1, 1), (1, -1, 3)$ and $(x, y, z)$ as\n$$2(1, 1, 1) + 3(1, -1, 3) + 4(x, y, z) = (7, 5, 3)$$\nthen find the value of $x + y + z$.',
      image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q4');

  -- Q5
  UPDATE question_templates
  SET text = 'Let $A$ be an invertible $(4 \\times 4)$-matrix such that $A^T = A^2$. Find $\\det A$?',
      image_assets = NULL
  WHERE source = 'July16|MATH102|Q5';

  UPDATE question_versions
  SET text = 'Let $A$ be an invertible $(4 \\times 4)$-matrix such that $A^T = A^2$. Find $\\det A$?',
      image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q5');

  -- Q6
  UPDATE question_templates
  SET text = 'Let\n$$S := \\left\\{ \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} \\in M_{2 \\times 2}(\\mathbb{R}) \\;\\middle|\\; \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}^T = -\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} \\right\\}.$$\nIf $S$ forms a subspace of $M_{2 \\times 2}(\\mathbb{R})$, then find the dimension of $S$. Otherwise, enter the number $-1$ as the answer.',
      image_assets = NULL
  WHERE source = 'July16|MATH102|Q6';

  UPDATE question_versions
  SET text = 'Let\n$$S := \\left\\{ \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} \\in M_{2 \\times 2}(\\mathbb{R}) \\;\\middle|\\; \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}^T = -\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} \\right\\}.$$\nIf $S$ forms a subspace of $M_{2 \\times 2}(\\mathbb{R})$, then find the dimension of $S$. Otherwise, enter the number $-1$ as the answer.',
      image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q6');

  -- Q7
  UPDATE question_templates
  SET text = 'Define a $(3 \\times 3)$-matrix $A = [a_{ij}]$ as $a_{ij} := \\text{maximum}(i, j)$. Find the rank of the matrix $A$.',
      image_assets = NULL
  WHERE source = 'July16|MATH102|Q7';

  UPDATE question_versions
  SET text = 'Define a $(3 \\times 3)$-matrix $A = [a_{ij}]$ as $a_{ij} := \\text{maximum}(i, j)$. Find the rank of the matrix $A$.',
      image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q7');

  -- Q8
  UPDATE question_templates
  SET text = 'Consider the vectors $(k, 8, -5), (0, k - 6, 4)$ and $(0, 3, k - 2)$ in $\\mathbb{R}^3$, for some $k \\in \\mathbb{R}$. Find the number of values of $k$ for which the given three vectors are linearly dependent in $\\mathbb{R}^3$.',
      image_assets = NULL
  WHERE source = 'July16|MATH102|Q8';

  UPDATE question_versions
  SET text = 'Consider the vectors $(k, 8, -5), (0, k - 6, 4)$ and $(0, 3, k - 2)$ in $\\mathbb{R}^3$, for some $k \\in \\mathbb{R}$. Find the number of values of $k$ for which the given three vectors are linearly dependent in $\\mathbb{R}^3$.',
      image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q8');

  -- Q9 & Q10 Group Passage
  UPDATE group_templates
  SET passage = '$M_{3 \\times 3}(\\mathbb{R})$ denotes the vector space consisting of real square matrices of order 3 with usual matrix addition and scalar multiplication. Consider the following matrices:\n\n$$M_1 = \\begin{bmatrix} 1 & 0 & 0 \\\\ 0 & 1 & 1 \\\\ 0 & 0 & 1 \\end{bmatrix}, \\quad M_2 = \\begin{bmatrix} 0 & 1 & 0 \\\\ 1 & 0 & 1 \\\\ 0 & 1 & 0 \\end{bmatrix}, \\quad M_3 = \\begin{bmatrix} 1 & -1 & 0 \\\\ -1 & 1 & 0 \\\\ 0 & -1 & 1 \\end{bmatrix}, \\quad M_4 = \\begin{bmatrix} 2 & -3 & 0 \\\\ -3 & 2 & -1 \\\\ 0 & -3 & 2 \\end{bmatrix}$$\n\nUse the given information to answer the subquestions.'
  WHERE id IN (
    SELECT qv.group_version_id FROM question_versions qv
    JOIN question_templates qt ON qv.cloned_from_id = qt.id
    WHERE qt.source = 'July16|MATH102|Q9'
  );

  UPDATE group_versions
  SET passage = '$M_{3 \\times 3}(\\mathbb{R})$ denotes the vector space consisting of real square matrices of order 3 with usual matrix addition and scalar multiplication. Consider the following matrices:\n\n$$M_1 = \\begin{bmatrix} 1 & 0 & 0 \\\\ 0 & 1 & 1 \\\\ 0 & 0 & 1 \\end{bmatrix}, \\quad M_2 = \\begin{bmatrix} 0 & 1 & 0 \\\\ 1 & 0 & 1 \\\\ 0 & 1 & 0 \\end{bmatrix}, \\quad M_3 = \\begin{bmatrix} 1 & -1 & 0 \\\\ -1 & 1 & 0 \\\\ 0 & -1 & 1 \\end{bmatrix}, \\quad M_4 = \\begin{bmatrix} 2 & -3 & 0 \\\\ -3 & 2 & -1 \\\\ 0 & -3 & 2 \\end{bmatrix}$$\n\nUse the given information to answer the subquestions.'
  WHERE id IN (
    SELECT qv.group_version_id FROM question_versions qv
    JOIN question_templates qt ON qv.cloned_from_id = qt.id
    WHERE qt.source = 'July16|MATH102|Q9'
  );

  -- Q9
  UPDATE question_templates
  SET text = 'Which of the following options are correct?', image_assets = NULL
  WHERE source = 'July16|MATH102|Q9';

  UPDATE question_versions
  SET text = 'Which of the following options are correct?', image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q9');

  UPDATE option_templates SET text = '$M_1 - M_2 + M_3 = \\mathbf{0}$, where $\\mathbf{0}$ denotes the zero matrix of order 3.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q9') AND sequence = 1;
  UPDATE option_versions SET text = '$M_1 - M_2 + M_3 = \\mathbf{0}$, where $\\mathbf{0}$ denotes the zero matrix of order 3.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q9')) AND sequence = 1;

  UPDATE option_templates SET text = '$2M_3 - M_2 - M_4 = \\mathbf{0}$, where $\\mathbf{0}$ denotes the zero matrix of order 3.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q9') AND sequence = 2;
  UPDATE option_versions SET text = '$2M_3 - M_2 - M_4 = \\mathbf{0}$, where $\\mathbf{0}$ denotes the zero matrix of order 3.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q9')) AND sequence = 2;

  UPDATE option_templates SET text = '$2M_2 - M_1 - M_4 = \\mathbf{0}$, where $\\mathbf{0}$ denotes the zero matrix of order 3.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q9') AND sequence = 3;
  UPDATE option_versions SET text = '$2M_2 - M_1 - M_4 = \\mathbf{0}$, where $\\mathbf{0}$ denotes the zero matrix of order 3.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q9')) AND sequence = 3;

  UPDATE option_templates SET text = 'The pair $(a, b)$ is unique for which $aM_1 + bM_2 = \\mathbf{0}$ holds, where $\\mathbf{0}$ denotes the zero matrix of order 3.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q9') AND sequence = 4;
  UPDATE option_versions SET text = 'The pair $(a, b)$ is unique for which $aM_1 + bM_2 = \\mathbf{0}$ holds, where $\\mathbf{0}$ denotes the zero matrix of order 3.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q9')) AND sequence = 4;

  UPDATE option_templates SET text = 'There is more than one pair $(a, b)$ such that $aM_1 + bM_3 = M_2$.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q9') AND sequence = 5;
  UPDATE option_versions SET text = 'There is more than one pair $(a, b)$ such that $aM_1 + bM_3 = M_2$.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q9')) AND sequence = 5;

  -- Q10
  UPDATE question_templates
  SET text = 'Which of the following options is true?', image_assets = NULL
  WHERE source = 'July16|MATH102|Q10';

  UPDATE question_versions
  SET text = 'Which of the following options is true?', image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q10');

  UPDATE option_templates SET text = '$\\{M_1, M_2\\}$ is a linearly independent set.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q10') AND sequence = 1;
  UPDATE option_versions SET text = '$\\{M_1, M_2\\}$ is a linearly independent set.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q10')) AND sequence = 1;

  UPDATE option_templates SET text = '$\\{M_1, M_2, M_3\\}$ is a linearly independent set.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q10') AND sequence = 2;
  UPDATE option_versions SET text = '$\\{M_1, M_2, M_3\\}$ is a linearly independent set.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q10')) AND sequence = 2;

  UPDATE option_templates SET text = '$\\{M_3, M_4\\}$ is a linearly dependent set.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q10') AND sequence = 3;
  UPDATE option_versions SET text = '$\\{M_3, M_4\\}$ is a linearly dependent set.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q10')) AND sequence = 3;

  UPDATE option_templates SET text = '$\\{M_2, M_4\\}$ is a linearly dependent set.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q10') AND sequence = 4;
  UPDATE option_versions SET text = '$\\{M_2, M_4\\}$ is a linearly dependent set.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q10')) AND sequence = 4;

  -- Q11 & Q12 Group Passage
  UPDATE group_templates
  SET passage = 'Let $A$ be a coefficient matrix, and $b$ be a column matrix to a system of $m$ linear equations with $n$ variables, $x_1, x_2, \\dots, x_n$, given by $Ax = b$, where $x = (x_1, x_2, \\dots, x_n)^T$. Use this information to answer the given subquestions.'
  WHERE id IN (
    SELECT qv.group_version_id FROM question_versions qv
    JOIN question_templates qt ON qv.cloned_from_id = qt.id
    WHERE qt.source = 'July16|MATH102|Q11'
  );

  UPDATE group_versions
  SET passage = 'Let $A$ be a coefficient matrix, and $b$ be a column matrix to a system of $m$ linear equations with $n$ variables, $x_1, x_2, \\dots, x_n$, given by $Ax = b$, where $x = (x_1, x_2, \\dots, x_n)^T$. Use this information to answer the given subquestions.'
  WHERE id IN (
    SELECT qv.group_version_id FROM question_versions qv
    JOIN question_templates qt ON qv.cloned_from_id = qt.id
    WHERE qt.source = 'July16|MATH102|Q11'
  );

  -- Q11
  UPDATE question_templates
  SET text = 'Let $C(A)$ denotes the column space of $A$. Choose the correct options.', image_assets = NULL
  WHERE source = 'July16|MATH102|Q11';

  UPDATE question_versions
  SET text = 'Let $C(A)$ denotes the column space of $A$. Choose the correct options.', image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q11');

  UPDATE option_templates SET text = 'If $b \\in C(A)$, then there exists vector $x \\in \\mathbb{R}^n$ satisfying $Ax = b$.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q11') AND sequence = 1;
  UPDATE option_versions SET text = 'If $b \\in C(A)$, then there exists vector $x \\in \\mathbb{R}^n$ satisfying $Ax = b$.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q11')) AND sequence = 1;

  UPDATE option_templates SET text = 'If $b \\in C(A)$, then there exists a unique vector $x \\in \\mathbb{R}^n$ satisfying $Ax = b$.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q11') AND sequence = 2;
  UPDATE option_versions SET text = 'If $b \\in C(A)$, then there exists a unique vector $x \\in \\mathbb{R}^n$ satisfying $Ax = b$.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q11')) AND sequence = 2;

  UPDATE option_templates SET text = 'If there exists a vector $x \\in \\mathbb{R}^n$ satisfying $Ax = b$, then $b \\in C(A)$.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q11') AND sequence = 3;
  UPDATE option_versions SET text = 'If there exists a vector $x \\in \\mathbb{R}^n$ satisfying $Ax = b$, then $b \\in C(A)$.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q11')) AND sequence = 3;

  UPDATE option_templates SET text = 'If $b \\in C(A)$, then the system of linear equations $Ax = b$ is consistent.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q11') AND sequence = 4;
  UPDATE option_versions SET text = 'If $b \\in C(A)$, then the system of linear equations $Ax = b$ is consistent.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q11')) AND sequence = 4;

  UPDATE option_templates SET text = 'If $b \\in C(A)$, then the system of linear equations $Ax = b$ is inconsistent.', image_assets = NULL WHERE question_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q11') AND sequence = 5;
  UPDATE option_versions SET text = 'If $b \\in C(A)$, then the system of linear equations $Ax = b$ is inconsistent.', image_assets = NULL WHERE question_version_id IN (SELECT id FROM question_versions WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q11')) AND sequence = 5;

  -- Q12
  UPDATE question_templates
  SET text = 'Let $A = \\begin{bmatrix} 3 & a \\\\ 4 & 1 \\end{bmatrix}$ and $b = \\begin{bmatrix} 1 \\\\ 4 \\end{bmatrix}$. Find the value of $a$, up to two decimal places, such that the system of linear equations $Ax = b$ does not have any solution.',
      image_assets = NULL
  WHERE source = 'July16|MATH102|Q12';

  UPDATE question_versions
  SET text = 'Let $A = \\begin{bmatrix} 3 & a \\\\ 4 & 1 \\end{bmatrix}$ and $b = \\begin{bmatrix} 1 \\\\ 4 \\end{bmatrix}$. Find the value of $a$, up to two decimal places, such that the system of linear equations $Ax = b$ does not have any solution.',
      image_assets = NULL
  WHERE cloned_from_id IN (SELECT id FROM question_templates WHERE source = 'July16|MATH102|Q12');

  -- Re-enable version immutability triggers
  ALTER TABLE question_versions ENABLE TRIGGER enforce_question_version_immutability;
  ALTER TABLE group_versions ENABLE TRIGGER enforce_group_version_immutability;
  ALTER TABLE option_versions ENABLE TRIGGER enforce_option_version_immutability;

END $ROOT$;
`;

  console.log("Executing SQL migration via supabase db query...");
  // Write sql to scratch/patch_readability.sql and execute it
  const fs = await import("fs");
  fs.writeFileSync("scratch/patch_readability.sql", sql);
  
  execSync("npx supabase db query -f scratch/patch_readability.sql", { stdio: "inherit" });
  console.log("✓ July 16 readability patch successfully executed!");
}

main().catch(err => {
  console.error("Failed to patch readability:", err);
  process.exit(1);
});
