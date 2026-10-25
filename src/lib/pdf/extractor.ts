import zlib from "zlib";
import { getCanonicalSubject } from "./subjectMatcher";

export type ExtractedQuestionType = "MCQ" | "MSQ" | "NUMERICAL";
export type ExtractedVerificationStatus =
  | "Ready"
  | "Needs Review"
  | "Missing Image"
  | "Code Needs Review"
  | "Answer Needs Review"
  | "Extraction Warning";

export interface ExtractedOption {
  text: string;
  sequence: number;
  is_correct: boolean;
  images?: ExtractedPdfImage[];
  image_assets?: unknown | null;
}

export interface ExtractedNumericalEval {
  mode: "EXACT" | "RANGE";
  exact_val?: number | null;
  min_val?: number | null;
  max_val?: number | null;
}

export interface ExtractedPdfImage {
  id?: string;
  image_bytes: Buffer;
  width: number;
  height: number;
  mime_type: string;
  page_number: number;
  object_id: number;
  xobject_name: string;
  transformation_matrix?: number[];
  storage_path?: string;
}

export interface ExtractedQuestion {
  question_number?: number;
  type: ExtractedQuestionType;
  text: string;
  marks: number;
  verification_status: ExtractedVerificationStatus;
  code_content?: { language: string; content: string } | null;
  image_assets?: unknown | null;
  images?: ExtractedPdfImage[];
  options: ExtractedOption[];
  eval_numeric?: ExtractedNumericalEval | null;
  warning_message?: string;
  is_confirmation?: boolean;
  is_useful_data?: boolean;
  source_subject?: string;
}

export interface ExtractedGroup {
  title: string;
  passage: string;
  code_content?: { language: string; content: string } | null;
  image_assets?: unknown | null;
  images?: ExtractedPdfImage[];
  questions: ExtractedQuestion[];
  subject_name?: string;
  source_subject?: string;
}

export type ExtractedSectionItem =
  | { type: "QUESTION"; question: ExtractedQuestion }
  | { type: "GROUP"; group: ExtractedGroup };

export interface ExtractedSection {
  title: string;
  subject_name?: string;
  subject_raw?: string;
  subject_code?: string;
  source_subject?: string;
  section_number?: number;
  questions: ExtractedQuestion[];
  groups: ExtractedGroup[];
  items?: ExtractedSectionItem[];
  reference_material?: unknown | null;
  reference_material_images?: ExtractedPdfImage[];
}

export interface ExtractedPaperResult {
  title?: string;
  detected_subjects?: string[];
  sections: ExtractedSection[];
  total_questions: number;
  has_warnings: boolean;
  warnings: string[];
  extracted_images?: ExtractedPdfImage[];
  reference_material?: unknown | null;
}

interface CMap {
  [hexCode: string]: string;
}

function parseCMapStream(cmapStr: string): CMap {
  const map: CMap = {};

  // 1. Parse beginbfrange
  const bfrangeRegex = /(\d+)\s+beginbfrange([\s\S]*?)endbfrange/g;
  let rangeBlock: RegExpExecArray | null;
  while ((rangeBlock = bfrangeRegex.exec(cmapStr)) !== null) {
    const lines = rangeBlock[2].trim().split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Format B: <start> <end> [ <dest1> <dest2> ... ]
      const arrayMatch = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/.exec(trimmed);
      if (arrayMatch) {
        const start = parseInt(arrayMatch[1], 16);
        const hexTokens = [...arrayMatch[3].matchAll(/<([0-9a-fA-F]+)>/g)].map((m) => m[1]);
        for (let i = 0; i < hexTokens.length; i++) {
          const code = start + i;
          const key = code.toString(16).padStart(arrayMatch[1].length, "0").toLowerCase();
          map[key] = decodeHexToUnicodeString(hexTokens[i]);
        }
        continue;
      }

      // Format A: <start> <end> <destStart>
      const directMatch = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/.exec(trimmed);
      if (directMatch) {
        const start = parseInt(directMatch[1], 16);
        const end = parseInt(directMatch[2], 16);
        let dest = parseInt(directMatch[3], 16);
        for (let code = start; code <= end; code++) {
          const key = code.toString(16).padStart(directMatch[1].length, "0").toLowerCase();
          map[key] = String.fromCodePoint(dest);
          dest++;
        }
      }
    }
  }

  // 2. Parse beginbfchar
  const bfcharRegex = /(\d+)\s+beginbfchar([\s\S]*?)endbfchar/g;
  let charBlock: RegExpExecArray | null;
  while ((charBlock = bfcharRegex.exec(cmapStr)) !== null) {
    const lines = charBlock[2].trim().split(/\r?\n/);
    for (const line of lines) {
      const match = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/.exec(line.trim());
      if (match) {
        const key = match[1].toLowerCase();
        map[key] = decodeHexToUnicodeString(match[2]);
      }
    }
  }

  return map;
}

function decodeHexToUnicodeString(hex: string): string {
  let res = "";
  if (hex.length % 4 === 0) {
    for (let i = 0; i < hex.length; i += 4) {
      res += String.fromCharCode(parseInt(hex.substring(i, i + 4), 16));
    }
  } else {
    for (let i = 0; i < hex.length; i += 2) {
      res += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
    }
  }
  return res;
}

function decodeHexWithCMap(hex: string, cmap: CMap): string {
  let res = "";
  if (hex.length >= 4) {
    for (let i = 0; i < hex.length; i += 4) {
      const glyph = hex.substring(i, i + 4).toLowerCase();
      if (cmap[glyph] !== undefined) {
        res += cmap[glyph];
      } else {
        const code = parseInt(glyph, 16);
        if (code >= 32 && code <= 126) {
          res += String.fromCharCode(code);
        }
      }
    }
  } else {
    for (let i = 0; i < hex.length; i += 2) {
      const glyph = hex.substring(i, i + 2).toLowerCase();
      if (cmap[glyph] !== undefined) {
        res += cmap[glyph];
      } else {
        res += String.fromCharCode(parseInt(glyph, 16));
      }
    }
  }
  return res;
}

/**
 * Parses raw PDF buffer and extracts text streams, tracking visual answer indicators.
 */
export function extractRawTextFromPdf(buffer: Buffer): {
  rawText: string;
  hasImages: boolean;
  imagesMap: Map<number, ExtractedPdfImage>;
  extractedImages: ExtractedPdfImage[];
} {
  const str = buffer.toString("latin1");

  // Validate PDF header
  if (!str.startsWith("%PDF-")) {
    throw new Error("Invalid PDF file: Missing %PDF header specification.");
  }

  // Check if PDF contains raster images
  const hasImages = /\/Subtype\s*\/Image\b/.test(str);

  // 1. Build unified CMap from all /ToUnicode objects
  const unifiedCMap: CMap = {};
  const toUnicodeMatches = [...str.matchAll(/\/ToUnicode\s+(\d+)\s+(\d+)\s+R/g)];

  for (const m of toUnicodeMatches) {
    const objNum = m[1];
    const objRegex = new RegExp(`${objNum}\\s+0\\s+obj([\\s\\S]*?)endobj`, "g");
    const oMatch = objRegex.exec(str);
    if (oMatch) {
      const sMatch = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/.exec(oMatch[1]);
      if (sMatch) {
        try {
          const inflated = zlib.inflateSync(Buffer.from(sMatch[1], "binary")).toString("utf8");
          const cmap = parseCMapStream(inflated);
          Object.assign(unifiedCMap, cmap);
        } catch {
          try {
            const inflated = zlib.inflateRawSync(Buffer.from(sMatch[1], "binary")).toString("utf8");
            const cmap = parseCMapStream(inflated);
            Object.assign(unifiedCMap, cmap);
          } catch {}
        }
      }
    }
  }

  // 1.5 Dynamically discover checkmark icon image object numbers and content images
  // In TCS iON examination PDFs:
  // - Checkmark icon: 16x16 raster image with SMask transparency mask dictionary (/SMask \d+ 0 R)
  // - Red cross icon: 16x16 raster image without SMask (uses CalRGB)
  // - Question / formula figures: DCTDecode (JPEG) or have larger dimensions (> 16x16)
  const checkImageObjNums = new Set<number>();
  const contentImageObjs = new Map<
    number,
    {
      object_id: number;
      width: number;
      height: number;
      mime_type: string;
      image_bytes: Buffer;
    }
  >();

  const objRegex = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g;
  let objMatch: RegExpExecArray | null;
  while ((objMatch = objRegex.exec(str)) !== null) {
    const objNum = parseInt(objMatch[1], 10);
    const body = objMatch[2];
    if (body.includes("/Subtype/Image") || body.includes("/Subtype /Image")) {
      const is16x16 = /\/Width\s+16\b/.test(body) && /\/Height\s+16\b/.test(body);
      const hasSMask = /\/SMask\s+\d+\s+0\s+R/.test(body);
      if (is16x16 && hasSMask) {
        checkImageObjNums.add(objNum);
        continue;
      }
      if (is16x16) {
        // Red cross icon - exclude from content images
        continue;
      }

      // Content image: check if it's DCTDecode or generic
      const isDCT = /\/Filter\s*\/DCTDecode\b/.test(body);
      const wMatch = /\/Width\s+(\d+)/.exec(body);
      const hMatch = /\/Height\s+(\d+)/.exec(body);
      const sMatch = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/.exec(body);

      if (wMatch && hMatch && sMatch) {
        const width = parseInt(wMatch[1], 10);
        const height = parseInt(hMatch[1], 10);
        const rawBytes = Buffer.from(sMatch[1], "binary");
        contentImageObjs.set(objNum, {
          object_id: objNum,
          width,
          height,
          mime_type: isDCT ? "image/jpeg" : "application/octet-stream",
          image_bytes: rawBytes,
        });
      }
    }
  }

  // 2. Discover page objects and content streams in page order
  interface PageStreamInfo {
    content: string;
    xobjMap: Record<string, number>;
    pageNumber: number;
  }
  const pageStreams: PageStreamInfo[] = [];

  const rootPagesMatch = /\/Type\s*\/Pages[\s\S]*?\/Kids\s*\[([\s\S]*?)\]/.exec(str);
  const pageObjNums: number[] = [];
  if (rootPagesMatch) {
    for (const m of rootPagesMatch[1].matchAll(/(\d+)\s+0\s+R/g)) {
      pageObjNums.push(parseInt(m[1], 10));
    }
  }
  if (pageObjNums.length === 0) {
    const pageRegex = /(\d+)\s+0\s+obj[\s\S]*?\/Type\s*\/Page\b/g;
    for (const m of str.matchAll(pageRegex)) {
      pageObjNums.push(parseInt(m[1], 10));
    }
  }

  for (let pIdx = 0; pIdx < pageObjNums.length; pIdx++) {
    const pNum = pageObjNums[pIdx];
    const pageNumber = pIdx + 1;
    const pMatch = new RegExp(`${pNum}\\s+0\\s+obj([\\s\\S]*?)endobj`).exec(str);
    if (!pMatch) continue;
    const pageBody = pMatch[1];
    const xobjMap: Record<string, number> = {};
    const xobjBlock = /\/XObject\s*<<([\s\S]*?)>>/.exec(pageBody);
    if (xobjBlock) {
      for (const xm of xobjBlock[1].matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
        xobjMap[xm[1]] = parseInt(xm[2], 10);
      }
    }

    const cMatch = /\/Contents\s+(?:(\d+)\s+0\s+R|\[([\s\S]*?)\])/.exec(pageBody);
    const contentObjNums: number[] = [];
    if (cMatch) {
      if (cMatch[1]) {
        contentObjNums.push(parseInt(cMatch[1], 10));
      } else if (cMatch[2]) {
        for (const cm of cMatch[2].matchAll(/(\d+)\s+0\s+R/g)) {
          contentObjNums.push(parseInt(cm[1], 10));
        }
      }
    }

    for (const cNum of contentObjNums) {
      const cObj = new RegExp(`${cNum}\\s+0\\s+obj([\\s\\S]*?)endobj`).exec(str);
      if (!cObj) continue;
      const sMatch = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/.exec(cObj[1]);
      if (!sMatch) continue;
      const raw = Buffer.from(sMatch[1], "binary");
      let content = "";
      try {
        content = zlib.inflateSync(raw).toString("latin1");
      } catch {
        try {
          content = zlib.inflateRawSync(raw).toString("latin1");
        } catch {}
      }
      if (content) pageStreams.push({ content, xobjMap, pageNumber });
    }
  }

  // Fallback: If page tree produced no streams, scan raw content streams directly
  if (pageStreams.length === 0) {
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = streamRegex.exec(str)) !== null) {
      const raw = Buffer.from(sMatch[1], "binary");
      let content = "";
      try {
        content = zlib.inflateSync(raw).toString("latin1");
      } catch {
        try {
          content = zlib.inflateRawSync(raw).toString("latin1");
        } catch {
          continue;
        }
      }
      if (content.includes("BT") || content.includes("Tj") || content.includes("TJ")) {
        pageStreams.push({ content, xobjMap: {}, pageNumber: 1 });
      }
    }
  }

  // 3. Extract text lines while tracking visual answer-key indicators and embedded images
  const textLines: string[] = [];
  const imagesMap = new Map<number, ExtractedPdfImage>();
  const allExtractedImages: ExtractedPdfImage[] = [];
  let inOptionsBlock = false;

  for (const { content, xobjMap, pageNumber } of pageStreams) {
    if (!content.includes("BT") && !content.includes("Tj") && !content.includes("TJ")) {
      continue;
    }

    const opRegex = /(?:\((.*?)\)\s*(?:Tj|'|")|<([0-9a-fA-F]+)>\s*(?:Tj|'|")|\[([\s\S]*?)\]\s*TJ|([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+rg|(\/[A-Za-z0-9]+)\s+Do|([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+cm)/g;
    let opMatch: RegExpExecArray | null;

    let isGreen = false;
    let hasCheck = false;
    let currentMatrix: number[] | undefined;

    while ((opMatch = opRegex.exec(content)) !== null) {
      if (opMatch[8] !== undefined) {
        // Transformation matrix: a b c d e f cm
        currentMatrix = [
          parseFloat(opMatch[8]),
          parseFloat(opMatch[9]),
          parseFloat(opMatch[10]),
          parseFloat(opMatch[11]),
          parseFloat(opMatch[12]),
          parseFloat(opMatch[13]),
        ];
      } else if (opMatch[4] !== undefined) {
        // RGB non-stroking color
        const r = parseFloat(opMatch[4]);
        const g = parseFloat(opMatch[5]);
        const b = parseFloat(opMatch[6]);
        isGreen = g > 0.4 && r < 0.25 && b < 0.25;
      } else if (opMatch[7] !== undefined) {
        // XObject Do invocation
        const xname = opMatch[7].replace("/", "");
        const targetObjNum = xobjMap[xname];
        const isCheckIcon =
          (targetObjNum !== undefined && checkImageObjNums.has(targetObjNum)) ||
          /(?:check|tick)/i.test(xname);
        if (isCheckIcon) {
          // If the preceding option in textLines was already marked [KEY_CORRECT] (e.g. rendered in green),
          // this check icon is its trailing indicator; do not set hasCheck for the next option.
          let lastOptAlreadyCorrect = false;
          for (let li = textLines.length - 1; li >= 0; li--) {
            const line = textLines[li];
            if (/^\d{5,}\./.test(line) || /^[A-D][\.\)]/.test(line)) {
              if (line.includes("[KEY_CORRECT]")) {
                lastOptAlreadyCorrect = true;
              }
              break;
            }
            if (/^Options\s*:/i.test(line) || /^Question Number/i.test(line)) {
              break;
            }
          }
          if (!lastOptAlreadyCorrect) {
            hasCheck = true;
          }
        } else if (targetObjNum !== undefined && contentImageObjs.has(targetObjNum)) {
          const imgData = contentImageObjs.get(targetObjNum)!;
          const pdfImage: ExtractedPdfImage = {
            object_id: targetObjNum,
            xobject_name: xname,
            width: imgData.width,
            height: imgData.height,
            mime_type: imgData.mime_type,
            page_number: pageNumber,
            transformation_matrix: currentMatrix ? [...currentMatrix] : undefined,
            image_bytes: imgData.image_bytes,
          };
          imagesMap.set(targetObjNum, pdfImage);
          if (!allExtractedImages.some((im) => im.object_id === targetObjNum)) {
            allExtractedImages.push(pdfImage);
          }
          textLines.push(`[EMBEDDED_IMAGE:${targetObjNum}]`);
        }
      } else {
        // Text operator
        let text = "";
        if (opMatch[1] !== undefined) {
          text = decodePdfString(opMatch[1]);
        } else if (opMatch[2] !== undefined) {
          text = decodeHexWithCMap(opMatch[2], unifiedCMap);
        } else if (opMatch[3] !== undefined) {
          const arrContent = opMatch[3];
          const tokenRegex = /\((.*?)\)|<([0-9a-fA-F]+)>|(-?\d+(?:\.\d+)?)/g;
          let tokMatch: RegExpExecArray | null;
          while ((tokMatch = tokenRegex.exec(arrContent)) !== null) {
            if (tokMatch[1] !== undefined) {
              text += decodePdfString(tokMatch[1]);
            } else if (tokMatch[2] !== undefined) {
              text += decodeHexWithCMap(tokMatch[2], unifiedCMap);
            } else if (tokMatch[3] !== undefined) {
              const spacing = parseFloat(tokMatch[3]);
              if (spacing < -150) {
                text += " ";
              }
            }
          }
        }

        const trimmed = text.trim();
        if (!trimmed) continue;

        if (/^Options\s*:/i.test(trimmed)) {
          inOptionsBlock = true;
          textLines.push(trimmed);
        } else if (
          /^Question Number\s*:/i.test(trimmed) ||
          /^Question Type\s*:\s*COMPREHENSION/i.test(trimmed) ||
          /^Section (?:Id|Number)\s*:/i.test(trimmed) ||
          /^Sub-Section Number\s*:/i.test(trimmed)
        ) {
          inOptionsBlock = false;
          textLines.push(trimmed);
        } else if (inOptionsBlock) {
          const isOptId = /^\d{5,}\./.test(trimmed) || /^[A-D][\.\)]/.test(trimmed) || /^\([A-D]\)/.test(trimmed);
          if (isOptId && (isGreen || hasCheck)) {
            textLines.push(`${trimmed} [KEY_CORRECT]`);
          } else {
            textLines.push(trimmed);
          }
        } else {
          const isStandardOpt = /^[A-D][\.\)]\s+/.test(trimmed) || /^\([A-D]\)\s*/.test(trimmed);
          if (isStandardOpt && (isGreen || hasCheck)) {
            textLines.push(`${trimmed} [KEY_CORRECT]`);
          } else {
            textLines.push(trimmed);
          }
        }

        hasCheck = false;
      }
    }
  }

  const rawText = textLines.join("\n");
  return { rawText, hasImages, imagesMap, extractedImages: allExtractedImages };
}

function decodePdfString(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

/**
 * Specialized parser for IITM / TCS iON examination PDF format.
 */
function parseTcsIonPaper(
  rawText: string,
  hasPdfImages = false,
  imagesMap?: Map<number, ExtractedPdfImage>
): ExtractedPaperResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const sections: ExtractedSection[] = [];
  const warnings: string[] = [];

  let currentSection: ExtractedSection = {
    title: "Section 1",
    subject_name: undefined,
    questions: [],
    groups: [],
    items: [],
  };

  function parseTcsOptions(optionLines: string[]): ExtractedOption[] {
    const options: ExtractedOption[] = [];
    let currentOptText: string[] = [];
    let currentOptIsCorrect = false;
    let hasOpenOption = false;

    function flushOption() {
      if (hasOpenOption && (currentOptText.length > 0 || currentOptImages.length > 0 || currentOptId)) {
        const cleanText = currentOptText
          .join(" ")
          .replace(/\[KEY_CORRECT\]/g, "")
          .trim();

        for (const m of cleanText.matchAll(/\[EMBEDDED_IMAGE:(\d+)\]/g)) {
          const objId = parseInt(m[1], 10);
          const img = imagesMap?.get(objId);
          if (img && !currentOptImages.some((ci) => ci.object_id === objId)) {
            currentOptImages.push(img);
          }
        }

        const textWithoutImg = cleanText.replace(/\[EMBEDDED_IMAGE:\d+\]/g, "").trim();
        const finalText = textWithoutImg || (currentOptImages.length > 0 ? "[Image]" : "");

        options.push({
          sequence: options.length + 1,
          text: finalText,
          is_correct: currentOptIsCorrect,
          images: currentOptImages.length > 0 ? currentOptImages : undefined,
        });
        currentOptText = [];
        currentOptIsCorrect = false;
        currentOptImages = [];
        currentOptId = "";
        hasOpenOption = false;
      }
    }

    let currentOptId = "";
    let currentOptImages: ExtractedPdfImage[] = [];

    for (const line of optionLines) {
      const isCorrectLine = line.includes("[KEY_CORRECT]");
      const cleanLine = line.replace(/\[KEY_CORRECT\]/g, "").trim();

      for (const m of line.matchAll(/\[EMBEDDED_IMAGE:(\d+)\]/g)) {
        const objId = parseInt(m[1], 10);
        const img = imagesMap?.get(objId);
        if (img && !currentOptImages.some((ci) => ci.object_id === objId)) {
          currentOptImages.push(img);
        }
      }

      const optMatch = /^\s*(?:\d+\.\s*)?(\d{10,})\.\s*(.*)/.exec(cleanLine);
      if (optMatch) {
        flushOption();
        hasOpenOption = true;
        currentOptId = optMatch[1];
        if (isCorrectLine) {
          currentOptIsCorrect = true;
        }
        const textAfterId = optMatch[2].trim();
        if (textAfterId) currentOptText.push(textAfterId);
      } else if (/^\d{5,}\.\s*$/.test(cleanLine) || /^\d{5,}\.\s+/.test(cleanLine)) {
        flushOption();
        hasOpenOption = true;
        if (isCorrectLine) {
          currentOptIsCorrect = true;
        }
        const textAfterId = cleanLine.replace(/^\d{5,}\.\s*/, "").trim();
        if (textAfterId) currentOptText.push(textAfterId);
      } else if (/^[A-D][\.\)]\s+/.test(cleanLine) || /^\([A-D]\)\s*/.test(cleanLine)) {
        flushOption();
        hasOpenOption = true;
        if (isCorrectLine) {
          currentOptIsCorrect = true;
        }
        const text = cleanLine.replace(/^[A-D][\.\)]\s*|^\([A-D]\)\s*/, "").trim();
        if (text) currentOptText.push(text);
      } else {
        if (!hasOpenOption) {
          hasOpenOption = true;
        }
        if (isCorrectLine) {
          currentOptIsCorrect = true;
        }
        if (cleanLine) {
          currentOptText.push(cleanLine);
        }
      }
    }
    flushOption();
    return options;
  }

  function isTcsBoundary(line: string): boolean {
    return (
      /^Question Number\s*:/i.test(line) ||
      /Question Type\s*:\s*COMPREHENSION/i.test(line) ||
      /^Section (?:Id|Number)\s*:/i.test(line) ||
      /^Sub-Section Number\s*:/i.test(line)
    );
  }

  function parseSingleTcsQuestion(): ExtractedQuestion | null {
    if (i >= lines.length) return null;
    const headerLine = lines[i];
    const qNumMatch = /Question Number\s*:\s*(\d+)/i.exec(headerLine);
    const qTypeMatch = /Question Type\s*:\s*(MCQ|MSQ|NUMERICAL|NAT|SA)/i.exec(headerLine);

    const questionNumber = qNumMatch ? parseInt(qNumMatch[1], 10) : undefined;
    const rawType = qTypeMatch ? qTypeMatch[1].toUpperCase() : "MCQ";
    let qType: ExtractedQuestionType = "MCQ";
    if (rawType === "MSQ") qType = "MSQ";
    else if (rawType === "NUMERICAL" || rawType === "NAT" || rawType === "SA") qType = "NUMERICAL";

    i++;
    let marks = 1.0;
    let marksFound = false;
    let marksNeedReview = false;

    const textLines: string[] = [];
    const optionLines: string[] = [];
    const possibleAnswers: string[] = [];
    let answersType = "";
    let inOptions = false;
    let inPossibleAnswers = false;

    while (i < lines.length) {
      const curLine = lines[i];

      if (isTcsBoundary(curLine)) {
        break;
      }

      if (/^Sem\d+\s+[A-Za-z0-9]+/i.test(curLine) && i + 1 < lines.length && /^Section Id\s*:/i.test(lines[i + 1])) {
        break;
      }

      const cMarksMatch = /(?:Correct\s+)?Marks\s*:\s*([0-9]*\.?[0-9]+)/i.exec(curLine);
      if (cMarksMatch && !/^(?:Section|Group|Negative)/i.test(curLine)) {
        const val = parseFloat(cMarksMatch[1]);
        if (!isNaN(val)) {
          marks = val;
          marksFound = true;
          if (val <= 0) {
            marksNeedReview = true;
          }
        }
        i++;
        continue;
      }

      if (/^Negative Marks\s*:/i.test(curLine)) {
        i++;
        continue;
      }

      if (/^Options\s*:/i.test(curLine)) {
        inOptions = true;
        i++;
        continue;
      }

      if (/^Response Type\s*:/i.test(curLine)) {
        i++;
        continue;
      }

      if (/^Answers Type\s*:/i.test(curLine)) {
        if (curLine.includes(":") && curLine.split(":")[1].trim()) {
          answersType = curLine.split(":")[1].trim();
        } else if (i + 1 < lines.length && !lines[i + 1].includes(":")) {
          answersType = lines[i + 1].trim();
          i++;
        }
        i++;
        continue;
      }

      if (/^Possible Answers\s*:/i.test(curLine)) {
        inPossibleAnswers = true;
        const afterColon = curLine.split(":")[1]?.trim();
        if (afterColon) {
          possibleAnswers.push(afterColon);
        }
        i++;
        continue;
      }

      if (inPossibleAnswers) {
        if (!curLine.includes(":")) {
          possibleAnswers.push(curLine);
          i++;
          continue;
        } else {
          inPossibleAnswers = false;
        }
      }

      if (
        /^Evaluation Required/i.test(curLine) ||
        /^Show Word Count/i.test(curLine) ||
        /^Text Areas\s*:/i.test(curLine) ||
        /^Question Label\s*:/i.test(curLine) ||
        /^Question Shuffling/i.test(curLine) ||
        /^Sub-Section/i.test(curLine)
      ) {
        i++;
        continue;
      }

      if (inOptions) {
        optionLines.push(curLine);
      } else {
        textLines.push(curLine.replace(/\[KEY_CORRECT\]/g, "").trim());
      }
      i++;
    }

    const allQText = textLines.join(" ");
    const isConfirmationPrompt =
      /ARE YOU SURE YOU HAVE TO WRITE EXAM FOR THIS SUBJECT/i.test(allQText) ||
      /THIS IS QUESTION PAPER FOR THE SUBJECT/i.test(allQText);

    const isUsefulData =
      /Useful Data has been mentioned above/i.test(allQText) ||
      /This data attachment is just for a reference/i.test(allQText) ||
      /Instructions has been mentioned above/i.test(allQText) ||
      optionLines.some((l) => /Useful Data has been mentioned above|Instructions has been mentioned above/i.test(l));

    // Question body images belong ONLY to textLines (not options!)
    const questionImages: ExtractedPdfImage[] = [];
    for (const m of allQText.matchAll(/\[EMBEDDED_IMAGE:(\d+)\]/g)) {
      const objId = parseInt(m[1], 10);
      const img = imagesMap?.get(objId);
      if (img && !questionImages.some((qi) => qi.object_id === objId)) {
        questionImages.push(img);
      }
    }

    const hasMeaningfulContent =
      textLines.some((l) => l.trim().length > 0) ||
      optionLines.some((l) => l.trim().length > 0) ||
      questionImages.length > 0;

    // Administrative confirmation prompts and boundary stubs:
    // 1. Matches confirmation prompt text ("THIS IS QUESTION PAPER...", "ARE YOU SURE...")
    // 2. Or is an administrative stub with no question text/options/images (e.g. truncated transition boundary at EOF)
    // 3. Or has non-positive marks (marks <= 0) and is not Useful Data
    const isConfirmation =
      isConfirmationPrompt ||
      (!isUsefulData && (marks <= 0 || !marksFound)) ||
      (!hasMeaningfulContent && !isUsefulData);

    // Parse options with individual option image associations
    const options = parseTcsOptions(optionLines);
    if (isConfirmation && options.length === 0) {
      options.push(
        { text: "YES", sequence: 1, is_correct: true },
        { text: "NO", sequence: 2, is_correct: false }
      );
    }

    let cleanText = textLines.join(" ").replace(/\[EMBEDDED_IMAGE:\d+\]/g, "").trim();
    if (!cleanText) {
      if (questionImages.length > 0) {
        cleanText = "[Refer to attached figure / code snippet]";
      } else {
        cleanText = `Question ${questionNumber || ""}`;
      }
    }

    // Numerical evaluation parsing for SA
    let evalNumeric: ExtractedNumericalEval | null = null;
    if (qType === "NUMERICAL") {
      let mode: "EXACT" | "RANGE" = "EXACT";
      if (/Range/i.test(answersType)) {
        mode = "RANGE";
      }

      if (mode === "EXACT") {
        let val: number | null = null;
        for (const ans of possibleAnswers) {
          const parts = ans.split(/[\/\s,]+/);
          for (const p of parts) {
            const m = /^([-+]?[0-9]+(?:\.[0-9]+)?)$/.exec(p.trim());
            if (m) {
              val = parseFloat(m[1]);
              break;
            }
          }
          if (val !== null) break;
        }
        if (val !== null && !isNaN(val)) {
          evalNumeric = { mode: "EXACT", exact_val: val };
        }
      } else {
        let minVal: number | null = null;
        let maxVal: number | null = null;
        for (const ans of possibleAnswers) {
          const m = /([-+]?[0-9]+(?:\.[0-9]+)?)\s*(?:to|-)\s*([-+]?[0-9]+(?:\.[0-9]+)?)/i.exec(ans);
          if (m) {
            minVal = parseFloat(m[1]);
            maxVal = parseFloat(m[2]);
            break;
          }
        }
        if (minVal !== null && maxVal !== null && !isNaN(minVal) && !isNaN(maxVal)) {
          evalNumeric = { mode: "RANGE", min_val: minVal, max_val: maxVal };
        }
      }
    }

    const correctOptions = options.filter((opt) => opt.is_correct);
    const hasEmptyOptions = options.some(
      (opt) => (!opt.text || opt.text.trim() === "") && (!opt.images || opt.images.length === 0)
    );

    const mentionsImage =
      /figure|diagram|image|graph|chart|circuit|table below/i.test(cleanText) ||
      /\[Image\b/i.test(cleanText);
    const isMissingImage = hasPdfImages && mentionsImage && questionImages.length === 0;

    let verificationStatus: ExtractedVerificationStatus = "Answer Needs Review";
    let warningMessage: string | undefined = marksNeedReview
      ? "Original marks was 0 in source PDF; review marks."
      : undefined;

    if (qType === "NUMERICAL") {
      if (
        evalNumeric &&
        (evalNumeric.exact_val !== null ||
          (evalNumeric.min_val !== null && evalNumeric.max_val !== null && evalNumeric.min_val !== undefined && evalNumeric.max_val !== undefined))
      ) {
        verificationStatus = "Ready";
      } else {
        verificationStatus = "Answer Needs Review";
        warningMessage = "Numerical evaluation answer key not found in source PDF. Manual review required.";
      }
    } else if (hasEmptyOptions || options.length === 0) {
      verificationStatus = "Extraction Warning";
      warningMessage =
        "Option content contains visual symbols or stress patterns that could not be extracted as text. Refer to the source PDF.";
    } else if (isMissingImage) {
      verificationStatus = "Missing Image";
    } else if (qType === "MCQ") {
      if (correctOptions.length === 1) {
        verificationStatus = "Ready";
      } else if (correctOptions.length > 1) {
        // Disambiguate if an empty option was tagged due to visual checkmark proximity
        const validOptionsWithAnswer = correctOptions.filter(
          (o) => (o.text && o.text.trim() !== "") || (o.images && o.images.length > 0)
        );
        if (validOptionsWithAnswer.length === 1) {
          for (const opt of options) {
            if ((!opt.text || opt.text.trim() === "") && (!opt.images || opt.images.length === 0)) {
              opt.is_correct = false;
            }
          }
          verificationStatus = "Ready";
        } else {
          verificationStatus = "Answer Needs Review";
          warningMessage = "Multiple options marked correct in source for MCQ. Manual review required.";
        }
      } else {
        verificationStatus = "Answer Needs Review";
      }
    } else if (qType === "MSQ") {
      if (correctOptions.length >= 1) {
        verificationStatus = "Ready";
      } else {
        verificationStatus = "Answer Needs Review";
      }
    }

    return {
      question_number: questionNumber,
      type: qType,
      text: cleanText,
      marks: marks,
      verification_status: verificationStatus,
      images: questionImages.length > 0 ? questionImages : undefined,
      image_assets: null,
      options: options,
      eval_numeric: evalNumeric,
      code_content: null,
      warning_message: warningMessage,
      is_confirmation: isConfirmation,
      is_useful_data: isUsefulData,
    };
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 1. Detect Section Header: e.g. "Sem1 English1" followed by "Section Id :" or "Section Number :"
    if (/^Section Id\s*:/i.test(line) || /^Section Number\s*:/i.test(line)) {
      let sectionSubject = "";
      for (let k = i - 1; k >= Math.max(0, i - 4); k--) {
        const prev = lines[k];
        if (
          prev &&
          !prev.includes(":") &&
          !/^\d+$/.test(prev) &&
          prev.length < 60 &&
          !/Options|Sub questions/i.test(prev)
        ) {
          sectionSubject = prev.trim();
          break;
        }
      }

      let secNum = "";
      for (let j = Math.max(0, i - 2); j < Math.min(lines.length, i + 6); j++) {
        const numMatch = /Section Number\s*:\s*(\d+)/i.exec(lines[j]);
        if (numMatch) {
          secNum = numMatch[1];
          break;
        } else if (/Section Number\s*:/i.test(lines[j]) && j + 1 < lines.length && /^\d+$/.test(lines[j + 1])) {
          secNum = lines[j + 1];
          break;
        }
      }

      const canonical = getCanonicalSubject(sectionSubject);
      const fullTitle = secNum && sectionSubject
        ? `Section ${secNum}: ${sectionSubject}`
        : sectionSubject || (secNum ? `Section ${secNum}` : "Section 1");

      if (currentSection.questions.length > 0 || currentSection.groups.length > 0 || currentSection.reference_material) {
        if (!currentSection.subject_name) {
          const numVal = secNum ? parseInt(secNum, 10) : 0;
          if (numVal > 1) {
            const prevSecNum = numVal - 1;
            let prevSubjRaw = "";
            if (sectionSubject.startsWith("Sem1") || prevSecNum <= 4) {
              if (prevSecNum === 1) prevSubjRaw = "Sem1 CT";
              else if (prevSecNum === 2) prevSubjRaw = "Sem1 English1";
              else if (prevSecNum === 3) prevSubjRaw = "Sem1 Maths1";
            } else if (sectionSubject.startsWith("Sem2") || prevSecNum > 4) {
              if (prevSecNum === 5) prevSubjRaw = "Sem2 English2";
              else if (prevSecNum === 6) prevSubjRaw = "Sem2 Maths2";
              else if (prevSecNum === 7) prevSubjRaw = "Sem2 Statistics2";
            }
            const prevCanonical = prevSubjRaw ? getCanonicalSubject(prevSubjRaw) : null;
            currentSection.title = prevSubjRaw ? `Section ${prevSecNum}: ${prevSubjRaw} (Preceding)` : `Section ${prevSecNum} (Preceding)`;
            currentSection.subject_name = prevCanonical?.canonicalName || prevSubjRaw || "Pre-Section Content";
            currentSection.subject_raw = prevSubjRaw || "Preceding Subject";
            currentSection.subject_code = prevCanonical?.canonicalCode;
            currentSection.section_number = prevSecNum;
            for (const q of currentSection.questions) {
              q.source_subject = currentSection.subject_name;
            }
          }
        }
        sections.push(currentSection);
      }
      currentSection = {
        title: fullTitle,
        subject_name: canonical?.canonicalName || sectionSubject || "Section 1",
        subject_raw: sectionSubject,
        subject_code: canonical?.canonicalCode,
        section_number: secNum ? parseInt(secNum, 10) : undefined,
        questions: [],
        groups: [],
        items: [],
      };
      i++;
      continue;
    }

    // 2. Detect Comprehension Group: "Question Type : COMPREHENSION"
    if (/Question Type\s*:\s*COMPREHENSION/i.test(line)) {
      let groupQNumbers = "";
      const qNumMatch = /Question Numbers\s*:\s*(\([^\)]+\)|[^\n]+)/i.exec(line);
      if (!qNumMatch) {
        for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
          const m = /Question Numbers\s*:\s*(\([^\)]+\)|[^\n]+)/i.exec(lines[j]);
          if (m) {
            groupQNumbers = m[1].trim();
            break;
          }
        }
      } else {
        groupQNumbers = qNumMatch[1].trim();
      }

      let endQNum = 0;
      if (groupQNumbers) {
        const rangeMatch = groupQNumbers.match(/\(?(\d+)\s*(?:to|-)\s*(\d+)\)?/i);
        if (rangeMatch) {
          endQNum = parseInt(rangeMatch[2], 10);
        }
      }

      i++;
      const passageLines: string[] = [];
      while (i < lines.length && !/^Sub questions/i.test(lines[i]) && !/^Question Number\s*:/i.test(lines[i])) {
        const pLine = lines[i];
        if (
          !/^Allowed\s*:/i.test(pLine) &&
          !/^Group Comprehension/i.test(pLine) &&
          !/^Question Numbers\s*:/i.test(pLine) &&
          !/^Question Label\s*:/i.test(pLine) &&
          !/^Read the following passage/i.test(pLine) &&
          pLine !== "."
        ) {
          passageLines.push(pLine);
        }
        i++;
      }

      const groupImages: ExtractedPdfImage[] = [];
      const rawPassage = passageLines.join("\n").trim();
      for (const m of rawPassage.matchAll(/\[EMBEDDED_IMAGE:(\d+)\]/g)) {
        const objId = parseInt(m[1], 10);
        const img = imagesMap?.get(objId);
        if (img && !groupImages.some((gi) => gi.object_id === objId)) {
          groupImages.push(img);
        }
      }
      const passage = rawPassage.replace(/\[EMBEDDED_IMAGE:\d+\]/g, "").trim();

      let normGroupTitle = "Comprehension Passage";
      if (groupQNumbers) {
        const rangeMatch = groupQNumbers.match(/\(?(\d+)\s*(?:to|-)\s*(\d+)\)?/i);
        if (rangeMatch) {
          normGroupTitle = `Comprehension (${rangeMatch[1]}–${rangeMatch[2]})`;
        } else {
          normGroupTitle = `Comprehension ${groupQNumbers}`;
        }
      }

      const currentGroup: ExtractedGroup = {
        title: normGroupTitle,
        passage: passage,
        images: groupImages.length > 0 ? groupImages : undefined,
        image_assets: null,
        questions: [],
      };

      if (i < lines.length && /^Sub questions/i.test(lines[i])) {
        i++;
      }

      while (i < lines.length) {
        if (/^Section (?:Id|Number)\s*:/i.test(lines[i])) {
          break;
        }
        if (/Question Type\s*:\s*COMPREHENSION/i.test(lines[i])) {
          break;
        }
        if (/^Question Number\s*:/i.test(lines[i])) {
          const checkNumMatch = /^Question Number\s*:\s*(\d+)/i.exec(lines[i]);
          if (checkNumMatch && endQNum > 0 && parseInt(checkNumMatch[1], 10) > endQNum) {
            break;
          }
          const q = parseSingleTcsQuestion();
          if (q) {
            if (q.is_useful_data) {
              currentSection.reference_material = {
                title: "Useful Data / Reference Material",
                sections: [
                  {
                    title: "Reference Data",
                    items: [],
                  },
                ],
              };
              currentSection.reference_material_images = q.images;
            }
            q.source_subject = currentSection.subject_name;
            currentGroup.questions.push(q);
          }
        } else {
          i++;
        }
      }

      if (currentGroup.questions.length > 0 || currentGroup.passage) {
        currentGroup.subject_name = currentSection.subject_name;
        for (const gq of currentGroup.questions) {
          gq.source_subject = currentSection.subject_name;
        }
        currentSection.groups.push(currentGroup);
        if (!currentSection.items) currentSection.items = [];
        currentSection.items.push({ type: "GROUP", group: currentGroup });
      }
      continue;
    }

    // 3. Detect Standalone Question: "Question Number : <N>"
    if (/^Question Number\s*:/i.test(line)) {
      const q = parseSingleTcsQuestion();
        if (q) {
          if (q.is_useful_data) {
            currentSection.reference_material = {
              title: "Useful Data / Reference Material",
              sections: [
                {
                  title: "Reference Data",
                  items: [],
                },
              ],
            };
            currentSection.reference_material_images = q.images;
          }
          q.source_subject = currentSection.subject_name;
          currentSection.questions.push(q);
          if (!currentSection.items) currentSection.items = [];
          currentSection.items.push({ type: "QUESTION", question: q });
        }
      continue;
    }

    i++;
  }

  if (currentSection.questions.length > 0 || currentSection.groups.length > 0 || currentSection.reference_material) {
    sections.push(currentSection);
  }

  const nonEmptySections = sections.filter(
    (s) => s.questions.length > 0 || s.groups.length > 0 || s.reference_material
  );

  let totalQuestions = 0;
  for (const s of nonEmptySections) {
    totalQuestions += s.questions.length;
    for (const g of s.groups) {
      totalQuestions += g.questions.length;
    }
  }

  const detectedSubjects = Array.from(
    new Set(
      nonEmptySections
        .filter((s) => s.questions.length > 0 || s.groups.length > 0 || s.reference_material)
        .map((s) => s.subject_name || s.title)
        .filter(Boolean) as string[]
    )
  );

  return {
    sections: nonEmptySections,
    detected_subjects: detectedSubjects,
    total_questions: totalQuestions,
    has_warnings: totalQuestions === 0 || warnings.length > 0,
    warnings,
    extracted_images: Array.from(imagesMap?.values() || []),
  };
}

/**
 * Parses structured sections, groups, and questions from text.
 */
export function parsePaperStructure(
  rawText: string,
  hasPdfImages = false,
  imagesMap?: Map<number, ExtractedPdfImage>
): ExtractedPaperResult {
  // Check if rawText is in TCS iON / IITM format
  const isTcsIon = /Question Number\s*:\s*\d+|Question Id\s*:\s*\d+/i.test(rawText);
  if (isTcsIon) {
    return parseTcsIonPaper(rawText, hasPdfImages, imagesMap);
  }

  return parseStandardPaper(rawText, hasPdfImages, imagesMap);
}

function parseStandardPaper(
  rawText: string,
  hasPdfImages = false,
  imagesMap?: Map<number, ExtractedPdfImage>
): ExtractedPaperResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const sections: ExtractedSection[] = [];
  const warnings: string[] = [];

  // Default section
  let currentSection: ExtractedSection = {
    title: "Section 1",
    questions: [],
    groups: [],
    items: [],
  };
  sections.push(currentSection);

  // Split lines into section chunks or parse line by line
  let i = 0;
  let currentGroup: ExtractedGroup | null = null;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Detect Section Header
    const sectionMatch = line.match(/^(?:SECTION|Section|PART|Part)\s+([A-Za-z0-9]+)[:\s\-]*(.*)$/i);
    if (sectionMatch && !line.toLowerCase().includes("question")) {
      const secTitle = line;
      if (currentSection.questions.length === 0 && currentSection.groups.length === 0 && sections.length === 1) {
        currentSection.title = secTitle;
      } else {
        currentSection = {
          title: secTitle,
          questions: [],
          groups: [],
          items: [],
        };
        sections.push(currentSection);
      }
      currentGroup = null;
      i++;
      continue;
    }

    // 2. Detect Question Group / Comprehension Passage
    const groupMatch = line.match(
      /^(?:Common\s+Data|Comprehension|Passage|Questions?\s+\d+\s*(?:to|-)\s*\d+)[:\s\-]*(.*)$/i
    );
    if (groupMatch) {
      const groupTitle = line;
      let passage = "";
      i++;
      // Consume passage lines until we hit a question
      while (i < lines.length && !isQuestionStart(lines[i])) {
        passage += (passage ? "\n" : "") + lines[i];
        i++;
      }

      // Check if passage contains code
      const { codeContent, cleanText } = extractCodeSnippet(passage);

      const groupImages: ExtractedPdfImage[] = [];
      for (const m of passage.matchAll(/\[EMBEDDED_IMAGE:(\d+)\]/g)) {
        const objId = parseInt(m[1], 10);
        const img = imagesMap?.get(objId);
        if (img && !groupImages.some((gi) => gi.object_id === objId)) {
          groupImages.push(img);
        }
      }
      const passageWithoutMarkers = (cleanText || passage).replace(/\[EMBEDDED_IMAGE:\d+\]/g, "").trim();

      currentGroup = {
        title: groupTitle,
        passage: passageWithoutMarkers,
        code_content: codeContent,
        images: groupImages.length > 0 ? groupImages : undefined,
        image_assets: null,
        questions: [],
      };
      currentSection.groups.push(currentGroup);
      if (!currentSection.items) currentSection.items = [];
      currentSection.items.push({ type: "GROUP", group: currentGroup });
      continue;
    }

    // 3. Detect Question Start
    if (isQuestionStart(line)) {
      const questionLines: string[] = [line];
      i++;
      while (i < lines.length && !isQuestionStart(lines[i]) && !isSectionOrGroupStart(lines[i])) {
        questionLines.push(lines[i]);
        i++;
      }

      const q = parseSingleQuestion(questionLines.join("\n"), hasPdfImages, imagesMap);
      if (currentGroup) {
        currentGroup.questions.push(q);
      } else {
        currentSection.questions.push(q);
        if (!currentSection.items) currentSection.items = [];
        currentSection.items.push({ type: "QUESTION", question: q });
      }
      continue;
    }

    i++;
  }

  // Count total questions
  let totalQuestions = 0;
  for (const sec of sections) {
    totalQuestions += sec.questions.length;
    for (const grp of sec.groups) {
      totalQuestions += grp.questions.length;
    }
  }

  // Remove empty initial section if another named section was created
  const filteredSections = sections.filter(
    (s) => s.questions.length > 0 || s.groups.length > 0
  );

  const effectiveSections = filteredSections.length > 0 ? filteredSections : sections;
  for (const s of effectiveSections) {
    if (!s.subject_name) {
      const canonical = getCanonicalSubject(s.title);
      s.subject_name = canonical?.canonicalName || s.title;
      s.subject_code = canonical?.canonicalCode;
      for (const q of s.questions) {
        if (!q.source_subject) q.source_subject = s.subject_name;
      }
      for (const g of s.groups) {
        if (!g.subject_name) g.subject_name = s.subject_name;
        for (const gq of g.questions) {
          if (!gq.source_subject) gq.source_subject = s.subject_name;
        }
      }
    }
  }

  const detectedSubjects = Array.from(
    new Set(
      effectiveSections
        .map((s) => s.subject_name || s.title)
        .filter(Boolean) as string[]
    )
  );

  return {
    sections: effectiveSections,
    detected_subjects: detectedSubjects,
    total_questions: totalQuestions,
    has_warnings: warnings.length > 0,
    warnings,
    extracted_images: Array.from(imagesMap?.values() || []),
  };
}

function isQuestionStart(line: string): boolean {
  return /^(?:Q(?:uestion)?\s*\.?\s*\d+|^\d+[\.\)])\b/i.test(line);
}

function isSectionOrGroupStart(line: string): boolean {
  return (
    /^(?:SECTION|Section|PART|Part)\s+([A-Za-z0-9]+)[:\s\-]*/i.test(line) ||
    /^(?:Common\s+Data|Comprehension|Passage|Questions?\s+\d+\s*(?:to|-)\s*\d+)[:\s\-]*/i.test(line)
  );
}

/**
 * Parses a single question's full text block into structured question object.
 */
export function parseSingleQuestion(
  rawBlock: string,
  hasPdfImages = false,
  imagesMap?: Map<number, ExtractedPdfImage>
): ExtractedQuestion {
  const lines = rawBlock.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // Extract Question Number
  let qNum: number | undefined;
  const numMatch = lines[0].match(/^(?:Q(?:uestion)?\s*\.?\s*(\d+)|(\d+)[\.\)])/i);
  if (numMatch) {
    qNum = parseInt(numMatch[1] || numMatch[2], 10);
  }

  // Extract Marks
  let marks = 1.0;
  const marksMatch = rawBlock.match(/\[(?:Marks?:\s*)?(\d+(?:\.\d+)?)\s*(?:Marks?)?\]|\((?:Marks?:\s*)?(\d+(?:\.\d+)?)\s*(?:Marks?)?\)/i);
  if (marksMatch) {
    marks = parseFloat(marksMatch[1] || marksMatch[2]);
  }

  // Detect Question Type
  let type: ExtractedQuestionType = "MCQ";
  const isMsqExplicit =
    /\[MSQ\]|\(MSQ\)|Multiple\s+Select|Select\s+all\s+that\s+apply|more\s+than\s+one\s+option\s+may\s+be\s+correct/i.test(
      rawBlock
    );
  const isNumericalExplicit =
    /\[NUMERICAL\]|\(NUMERICAL\)|\[NAT\]|\(NAT\)|Numerical\s+Answer/i.test(rawBlock);

  if (isMsqExplicit) {
    type = "MSQ";
  } else if (isNumericalExplicit) {
    type = "NUMERICAL";
  }

  // Collect images associated with this question
  const questionImages: ExtractedPdfImage[] = [];
  for (const m of rawBlock.matchAll(/\[EMBEDDED_IMAGE:(\d+)\]/g)) {
    const objId = parseInt(m[1], 10);
    const img = imagesMap?.get(objId);
    if (img && !questionImages.some((qi) => qi.object_id === objId)) {
      questionImages.push(img);
    }
  }

  // Check for image references in text
  const mentionsImage =
    /\b(?:figure|diagram|chart|graph|image|illustration)\s*\d*|\bas\s+shown\s+in\s+(?:the\s+)?(?:figure|diagram)/i.test(
      rawBlock
    );
  const isMissingImage =
    (mentionsImage || (hasPdfImages && /diagram|figure/i.test(rawBlock))) &&
    questionImages.length === 0;

  // Extract Code Block
  const { codeContent, cleanText } = extractCodeSnippet(rawBlock);

  // Extract Explicit Answer Key if present
  // Patterns:
  // "Answer: B" or "Answer: (B)" or "Key: B"
  // "Answer: A, B, D" or "Key: A, C"
  // "Answer: 42" or "Answer: 3.14 to 3.16"
  const answerKeyMatch = cleanText.match(
    /(?:Answer|Key|Correct\s+Option)\s*[:=\-]\s*([^\n\r]+)/i
  );
  let explicitAnswerStr: string | null = null;
  if (answerKeyMatch) {
    explicitAnswerStr = answerKeyMatch[1].trim();
  }

  // Strip Answer Key, Marks tag, and internal pipeline markers from question text
  let textWithoutAnswer = cleanText
    .replace(/\[KEY_CORRECT\]/g, "")
    .replace(/\[EMBEDDED_IMAGE:\d+\]/g, "")
    .replace(/(?:Answer|Key|Correct\s+Option)\s*[:=\-]\s*[^\n\r]+/gi, "")
    .replace(/\[(?:Marks?:\s*)?\d+(?:\.\d+)?\s*(?:Marks?)?\]|\((?:Marks?:\s*)?\d+(?:\.\d+)?\s*(?:Marks?)?\)/gi, "")
    .replace(/\[MSQ\]|\(MSQ\)|\[NUMERICAL\]|\(NUMERICAL\)|\[NAT\]|\(NAT\)/gi, "");

  // Remove leading Q1. / 1. from text
  textWithoutAnswer = textWithoutAnswer.replace(/^(?:Q(?:uestion)?\s*\.?\s*\d+|^\d+[\.\)])\s*/i, "").trim();

  // If not explicitly Numerical, check for options
  const extractedOptions: ExtractedOption[] = [];

  if (type !== "NUMERICAL") {
    // Regex for options: (A) ... or A. ...
    // Matches option lines: (A) Option Text
    const optionRegex = /(?:^|\n)\s*(?:\(([A-Da-d])\)|([A-Da-d])[\.\)])\s*([^\n]+)/g;
    let optMatch: RegExpExecArray | null;

    const matchedLetters = new Set<string>();
    while ((optMatch = optionRegex.exec(cleanText)) !== null) {
      const letter = (optMatch[1] || optMatch[2]).toUpperCase();
      let optText = optMatch[3].trim();
      const isCorrect = optText.includes("[KEY_CORRECT]");
      optText = optText.replace(/\[KEY_CORRECT\]/g, "").trim();

      if (!matchedLetters.has(letter)) {
        matchedLetters.add(letter);
        const seq = letter.charCodeAt(0) - 64; // A=1, B=2, C=3, D=4
        extractedOptions.push({
          text: optText,
          sequence: seq,
          is_correct: isCorrect,
        });
      }
    }

    // Sort options by sequence
    extractedOptions.sort((a, b) => a.sequence - b.sequence);

    // If options were found, remove them from question text
    if (extractedOptions.length >= 2) {
      const firstOptIndex = textWithoutAnswer.search(/(?:^|\n)\s*(?:\([A-Da-d]\)|[A-Da-d][\.\)])\s*/);
      if (firstOptIndex !== -1) {
        textWithoutAnswer = textWithoutAnswer.substring(0, firstOptIndex).trim();
      }
    } else if (!isNumericalExplicit && extractedOptions.length === 0) {
      // No options found and no MSQ tags -> question might be Numerical
      const asksForNumber =
        /\b(?:calculate|find the value|what is the value|determine the value|enter the numerical|in integer|round off to)\b/i.test(
          textWithoutAnswer
        );
      if (asksForNumber) {
        type = "NUMERICAL";
      }
    }
  }

  // Handle Numerical Evaluation Config
  let evalNumeric: ExtractedNumericalEval | null = null;
  if (type === "NUMERICAL") {
    if (explicitAnswerStr) {
      // Check for Range: "3.14 to 3.16" or "[3.14, 3.16]"
      const rangeMatch = explicitAnswerStr.match(
        /\[?\s*(-?\d+(?:\.\d+)?)\s*(?:to|-|,)\s*(-?\d+(?:\.\d+)?)\s*\]?/i
      );
      if (rangeMatch) {
        const minVal = parseFloat(rangeMatch[1]);
        const maxVal = parseFloat(rangeMatch[2]);
        evalNumeric = {
          mode: "RANGE",
          min_val: minVal,
          max_val: maxVal,
        };
      } else {
        const exactVal = parseFloat(explicitAnswerStr);
        if (!isNaN(exactVal)) {
          evalNumeric = {
            mode: "EXACT",
            exact_val: exactVal,
          };
        }
      }
    }
  }

  // Map Explicit Answer Key to Options
  let hasValidAnswer = extractedOptions.some((o) => o.is_correct);
  if (explicitAnswerStr) {
    if (type === "MCQ") {
      const singleLetterMatch = explicitAnswerStr.match(/\b([A-D])\b/i);
      if (singleLetterMatch) {
        const letter = singleLetterMatch[1].toUpperCase();
        const seq = letter.charCodeAt(0) - 64;
        const targetOpt = extractedOptions.find((o) => o.sequence === seq);
        if (targetOpt) {
          targetOpt.is_correct = true;
          hasValidAnswer = true;
        }
      }
    } else if (type === "MSQ") {
      // Multiple letters: "A, B, D" or "A+B+D" or "A B D"
      const letters = Array.from(explicitAnswerStr.matchAll(/\b([A-D])\b/gi)).map((m) =>
        m[1].toUpperCase()
      );
      if (letters.length > 0) {
        for (const l of letters) {
          const seq = l.charCodeAt(0) - 64;
          const targetOpt = extractedOptions.find((o) => o.sequence === seq);
          if (targetOpt) {
            targetOpt.is_correct = true;
          }
        }
        if (extractedOptions.some((o) => o.is_correct)) {
          hasValidAnswer = true;
        }
      }
    } else if (type === "NUMERICAL" && evalNumeric) {
      if (evalNumeric.mode === "EXACT" && evalNumeric.exact_val !== undefined && evalNumeric.exact_val !== null) {
        hasValidAnswer = true;
      } else if (
        evalNumeric.mode === "RANGE" &&
        evalNumeric.min_val !== undefined &&
        evalNumeric.min_val !== null &&
        evalNumeric.max_val !== undefined &&
        evalNumeric.max_val !== null &&
        evalNumeric.min_val <= evalNumeric.max_val
      ) {
        hasValidAnswer = true;
      }
    }
  }

  // Determine Verification Status
  let verificationStatus: ExtractedVerificationStatus = "Ready";

  if (
    type === "NUMERICAL" &&
    evalNumeric?.mode === "RANGE" &&
    evalNumeric.min_val !== undefined &&
    evalNumeric.min_val !== null &&
    evalNumeric.max_val !== undefined &&
    evalNumeric.max_val !== null &&
    evalNumeric.min_val > evalNumeric.max_val
  ) {
    verificationStatus = "Extraction Warning";
  } else if (isMissingImage) {
    verificationStatus = "Missing Image";
  } else if (!hasValidAnswer) {
    // If no answer key present in PDF: Do NOT guess!
    verificationStatus = "Answer Needs Review";
  } else if (codeContent && codeContent.content.length > 0 && /needs review/i.test(rawBlock)) {
    verificationStatus = "Code Needs Review";
  } else if (type !== "NUMERICAL" && extractedOptions.length < 2) {
    verificationStatus = "Extraction Warning";
  }

  const isConfirmation =
    /ARE YOU SURE YOU HAVE TO WRITE EXAM FOR THIS SUBJECT/i.test(rawBlock) ||
    /THIS IS QUESTION PAPER FOR THE SUBJECT/i.test(rawBlock);

  // Ensure default options if MCQ/MSQ but options were missing
  if (type !== "NUMERICAL" && extractedOptions.length === 0) {
    if (isConfirmation) {
      extractedOptions.push(
        { text: "YES", sequence: 1, is_correct: true },
        { text: "NO", sequence: 2, is_correct: false }
      );
      verificationStatus = "Ready";
    } else {
      extractedOptions.push(
        { text: "Option A", sequence: 1, is_correct: false },
        { text: "Option B", sequence: 2, is_correct: false },
        { text: "Option C", sequence: 3, is_correct: false },
        { text: "Option D", sequence: 4, is_correct: false }
      );
      verificationStatus = "Needs Review";
    }
  }

  return {
    question_number: qNum,
    type,
    text: textWithoutAnswer || "Untitled Question",
    marks,
    verification_status: verificationStatus,
    code_content: codeContent,
    images: questionImages.length > 0 ? questionImages : undefined,
    image_assets: null,
    options: extractedOptions,
    eval_numeric: evalNumeric,
  };
}

/**
 * Extracts fenced or indented code blocks from text.
 */
function extractCodeSnippet(text: string): {
  codeContent: { language: string; content: string } | null;
  cleanText: string;
} {
  // Fenced code block: ```python ... ```
  const fencedMatch = text.match(/```([a-zA-Z0-9_]*)\n([\s\S]*?)```/);
  if (fencedMatch) {
    const language = fencedMatch[1] || "python";
    const content = fencedMatch[2].trim();
    const cleanText = text.replace(fencedMatch[0], "").trim();
    return {
      codeContent: { language, content },
      cleanText,
    };
  }

  // Python-style def / class detection
  const codeLinesMatch = text.match(/(?:^|\n)((?:def\s+[a-zA-Z0-9_]+\s*\(|class\s+[a-zA-Z0-9_]+|for\s+[a-zA-Z0-9_]+\s+in|SELECT\s+[\s\S]+?FROM)[\s\S]+?)(?=\n\s*(?:[A-D][\.\)]|\(?[A-D]\)?|Answer:|$))/i);
  if (codeLinesMatch) {
    const rawSnippet = codeLinesMatch[1].trim();
    const cleanText = text.replace(rawSnippet, "").trim();
    return {
      codeContent: { language: "python", content: rawSnippet },
      cleanText,
    };
  }

  return { codeContent: null, cleanText: text };
}
