import { resolveImages } from "@/lib/question-images";
import { Exam, QuestionType, QuestionGroup, ReferenceMaterial } from "@/lib/types/exam";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache, revalidateTag } from "next/cache";
import { getServiceClient } from "@/lib/supabase/service";
import katex from "katex";

interface OptionRow {
  id: string;
  text: string;
  sequence: number;
  image_assets?: unknown;
}

interface QuestionRow {
  id: string;
  cloned_from_id?: string;
  section_version_id?: string;
  group_version_id?: string;
  type: string;
  text: string;
  marks: number;
  image_assets?: unknown;
  code_content?: { language: string; content: string } | null;
  option_versions?: OptionRow[];
  question_templates?: { source?: string | null } | null;
}

export interface AssetRef {
  url?: string;
  storage_path?: string;
}

function parseSourceQNum(q?: QuestionRow | null): number | undefined {
  if (!q?.question_templates?.source) return undefined;
  const match = q.question_templates.source.match(/\|Q(\d+)$/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Extracts legitimate external/absolute URLs only.
 * Private storage paths are NOT converted to /api/assets/ here,
 * preserving them for the server-side batch signing step.
 */
function getAssetImageUrls(imageAssets: unknown): string[] {
  if (!imageAssets) return [];
  const assets = (Array.isArray(imageAssets) ? imageAssets : [imageAssets]) as AssetRef[];
  return assets
    .filter((a) => a && typeof a.url === "string" && /^https?:\/\//i.test(a.url))
    .map((a) => a.url as string);
}

function getAssetImageUrl(imageAssets: unknown): string | undefined {
  const urls = getAssetImageUrls(imageAssets);
  return urls.length > 0 ? urls[0] : undefined;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

export class BoundedLruCache<K, V> {
  private capacity: number;
  private defaultTtlMs: number;
  private items = new Map<K, CacheEntry<V>>();
  private hitCount = 0;
  private missCount = 0;

  constructor(options: { capacity?: number; defaultTtlMs?: number } = {}) {
    this.capacity = options.capacity ?? 100;
    this.defaultTtlMs = options.defaultTtlMs ?? 60 * 60 * 1000; // 1 hour default
  }

  get(key: K): V | undefined {
    const entry = this.items.get(key);
    if (!entry) {
      this.missCount++;
      return undefined;
    }

    const now = Date.now();
    if (entry.expiresAt <= now) {
      this.items.delete(key);
      this.missCount++;
      return undefined;
    }

    // Refresh LRU ordering: delete and re-insert as most recently accessed
    entry.lastAccessed = now;
    this.items.delete(key);
    this.items.set(key, entry);

    this.hitCount++;
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    const now = Date.now();
    const effectiveTtl = ttlMs ?? this.defaultTtlMs;
    const expiresAt = now + effectiveTtl;

    if (this.items.has(key)) {
      this.items.delete(key);
    } else if (this.items.size >= this.capacity) {
      // Evict least recently used (first key in iteration order)
      const oldestKey = this.items.keys().next().value;
      if (oldestKey !== undefined) {
        this.items.delete(oldestKey);
      }
    }

    this.items.set(key, {
      value,
      expiresAt,
      lastAccessed: now,
    });
  }

  has(key: K): boolean {
    const entry = this.items.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      this.items.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    return this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  get size(): number {
    return this.items.size;
  }

  get stats() {
    return {
      size: this.items.size,
      capacity: this.capacity,
      hits: this.hitCount,
      misses: this.missCount,
    };
  }
}

const serverMathHtmlCache = new BoundedLruCache<string, string>({
  capacity: 2000,
  defaultTtlMs: 24 * 60 * 60 * 1000,
});

/**
 * Pre-renders mathematical expressions into HTML server-side.
 * Plain text is strictly escaped to prevent any XSS vulnerability.
 */
export function renderMathToHtml(text?: string | null): string | undefined {
  if (!text) return undefined;

  // Fast path: if no math delimiters, escape text and return
  if (
    !text.includes("$") &&
    !text.includes("\\(") &&
    !text.includes("\\[") &&
    !text.includes("\\begin{")
  ) {
    return `<span class="whitespace-pre-line">${escapeHtml(text)}</span>`;
  }

  const cached = serverMathHtmlCache.get(text);
  if (cached) return cached;

  const envPattern =
    "\\\\begin\\{(?:bmatrix|pmatrix|vmatrix|Vmatrix|matrix|cases|aligned|align\\*?)\\}[\\s\\S]+?\\\\end\\{(?:bmatrix|pmatrix|vmatrix|Vmatrix|matrix|cases|aligned|align\\*?)\\}";
  const mathRegex = new RegExp(
    "(\\$\\$[\\s\\S]+?\\$\\$|\\\\\\[[\\s\\S]+?\\\\\\]|" +
      envPattern +
      "|\\$[^\\$\\n]+?\\$|\\\\\\([\\s\\S]+?\\\\\\))"
  );

  let remaining = text;
  const parts: string[] = [];

  while (remaining.length > 0) {
    const match = remaining.match(mathRegex);
    if (!match || match.index === undefined) {
      parts.push(`<span class="whitespace-pre-line">${escapeHtml(remaining)}</span>`);
      break;
    }

    if (match.index > 0) {
      parts.push(`<span class="whitespace-pre-line">${escapeHtml(remaining.slice(0, match.index))}</span>`);
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith("$$") && matchedStr.endsWith("$$")) {
      const content = matchedStr.slice(2, -2).trim();
      try {
        const mathHtml = katex.renderToString(content, { displayMode: true, throwOnError: false });
        parts.push(`<div class="my-3 overflow-x-auto py-1 text-center">${mathHtml}</div>`);
      } catch {
        parts.push(`<div class="my-2 p-2 bg-muted font-mono text-sm">${escapeHtml(`$$${content}$$`)}</div>`);
      }
    } else if (matchedStr.startsWith("\\[") && matchedStr.endsWith("\\]")) {
      const content = matchedStr.slice(2, -2).trim();
      try {
        const mathHtml = katex.renderToString(content, { displayMode: true, throwOnError: false });
        parts.push(`<div class="my-3 overflow-x-auto py-1 text-center">${mathHtml}</div>`);
      } catch {
        parts.push(`<div class="my-2 p-2 bg-muted font-mono text-sm">${escapeHtml(`$$${content}$$`)}</div>`);
      }
    } else if (matchedStr.startsWith("\\begin{")) {
      const content = matchedStr.trim();
      try {
        const mathHtml = katex.renderToString(content, { displayMode: true, throwOnError: false });
        parts.push(`<div class="my-3 overflow-x-auto py-1 text-center">${mathHtml}</div>`);
      } catch {
        parts.push(`<div class="my-2 p-2 bg-muted font-mono text-sm">${escapeHtml(`$$${content}$$`)}</div>`);
      }
    } else if (matchedStr.startsWith("$") && matchedStr.endsWith("$")) {
      const content = matchedStr.slice(1, -1).trim();
      try {
        const mathHtml = katex.renderToString(content, { displayMode: false, throwOnError: false });
        parts.push(`<span class="inline-block px-0.5">${mathHtml}</span>`);
      } catch {
        parts.push(`<span class="font-mono text-sm">${escapeHtml(`$${content}$`)}</span>`);
      }
    } else if (matchedStr.startsWith("\\(") && matchedStr.endsWith("\\)")) {
      const content = matchedStr.slice(2, -2).trim();
      try {
        const mathHtml = katex.renderToString(content, { displayMode: false, throwOnError: false });
        parts.push(`<span class="inline-block px-0.5">${mathHtml}</span>`);
      } catch {
        parts.push(`<span class="font-mono text-sm">${escapeHtml(`$${content}$`)}</span>`);
      }
    } else {
      parts.push(`<span class="whitespace-pre-line">${escapeHtml(matchedStr)}</span>`);
    }

    remaining = remaining.slice(match.index + matchedStr.length);
  }

  const result = parts.join("");
  serverMathHtmlCache.set(text, result);
  return result;
}

export interface CachedPaperStructure {
  id: string;
  title: string;
  referenceMaterial?: ReferenceMaterial;
  sections: Array<{ id: string; title: string; referenceMaterial?: ReferenceMaterial }>;
  groups: QuestionGroup[];
  questions: Array<{
    id: string;
    type: QuestionType;
    text: string;
    textHtml?: string;
    marks: number;
    groupId?: string;
    sectionId?: string;
    sourceQuestionNumber?: number;
    imageUrl?: string;
    imageUrls?: string[];
    image_assets?: unknown | null;
    codeSnippet?: string;
    options?: Array<{
      id: string;
      text: string;
      textHtml?: string;
      imageUrl?: string;
      imageUrls?: string[];
      image_assets?: unknown | null;
    }>;
  }>;
}

// In-process L1 module-level bounded LRU cache for instantaneous same-process retrieval
export const paperStructureCache = new BoundedLruCache<string, CachedPaperStructure>({
  capacity: 100, // Up to 100 immutable paper set versions in memory
  defaultTtlMs: 60 * 60 * 1000, // 1 hour TTL
});

let revalidateTagTestHook: ((tag: string, profile: { expire?: number } | string) => void) | null = null;

export function __setRevalidateTagHookForTesting(
  hook: ((tag: string, profile: { expire?: number } | string) => void) | null
): void {
  revalidateTagTestHook = hook;
}

export function invalidatePaperStructureCache(paperId?: string): void {
  if (paperId) {
    paperStructureCache.delete(paperId);
    try {
      revalidateTag(`paper-structure-${paperId}`, { expire: 0 });
    } catch {
      // Non-fatal if invoked outside Next.js request context (e.g. in test runners or background tasks)
    }
    if (revalidateTagTestHook) {
      revalidateTagTestHook(`paper-structure-${paperId}`, { expire: 0 });
    }
  } else {
    paperStructureCache.clear();
    try {
      revalidateTag("paper-structure", { expire: 0 });
    } catch {
      // Non-fatal if invoked outside Next.js request context (e.g. in test runners or background tasks)
    }
    if (revalidateTagTestHook) {
      revalidateTagTestHook("paper-structure", { expire: 0 });
    }
  }
}

// Framework-level L2 Data Cache surviving serverless cold starts across instances
async function getCachedPaperStructure(paperId: string): Promise<CachedPaperStructure | null> {
  const cachedFn = unstable_cache(
    async () => {
      const serviceClient = getServiceClient();
      return fetchSinglePaperStructure(paperId, serviceClient);
    },
    ["paper-set-version-structure", paperId],
    {
      revalidate: false, // Paper set versions are immutable
      tags: ["paper-structure", `paper-structure-${paperId}`],
    }
  );
  return cachedFn();
}

async function fetchSinglePaperStructure(
  paperId: string,
  client: SupabaseClient
): Promise<CachedPaperStructure | null> {
  // Query 1: paper details & sections in parallel
  const [paperRes, sectionsRes] = await Promise.all([
    client
      .from("paper_set_versions")
      .select("title, reference_material")
      .eq("id", paperId)
      .single(),
    client
      .from("section_versions")
      .select("id, title, reference_material")
      .eq("paper_set_version_id", paperId),
  ]);

  const paper = paperRes.data;
  if (!paper) return null;

  const sections = sectionsRes.data || [];
  const sectionIds = sections.map((s) => s.id);

  if (sectionIds.length === 0) {
    return {
      id: paperId,
      title: paper.title,
      referenceMaterial: paper.reference_material as ReferenceMaterial | undefined,
      sections: [],
      groups: [],
      questions: [],
    };
  }

  // Query 2: parallel fetch of nodes, groups, and section-level questions
  const [nodesRes, groupsRes, questionsWithSectionRes] = await Promise.all([
    client
      .from("section_content_node_versions")
      .select("id, section_version_id, node_type, question_version_id, group_version_id, sequence")
      .in("section_version_id", sectionIds)
      .order("sequence", { ascending: true }),
    client
      .from("group_versions")
      .select("*")
      .in("section_version_id", sectionIds),
    client
      .from("question_versions")
      .select(
        "id, cloned_from_id, section_version_id, group_version_id, type, text, marks, image_assets, code_content, option_versions(id, text, sequence, image_assets), question_templates(source)"
      )
      .in("section_version_id", sectionIds),
  ]);

  const nodes = nodesRes.data || [];
  const groups = groupsRes.data || [];
  const groupIds = groups.map((g) => g.id);

  // Query 3: fetch group-level questions if groups exist
  let questionsWithGroup: QuestionRow[] = [];
  if (groupIds.length > 0) {
    const groupQRes = await client
      .from("question_versions")
      .select(
        "id, cloned_from_id, section_version_id, group_version_id, type, text, marks, image_assets, code_content, option_versions(id, text, sequence, image_assets), question_templates(source)"
      )
      .in("group_version_id", groupIds);
    questionsWithGroup = (groupQRes.data as unknown as QuestionRow[]) || [];
  }

  const allQuestions = [
    ...((questionsWithSectionRes.data as unknown as QuestionRow[]) || []),
    ...questionsWithGroup,
  ];

  const orderedQuestions: CachedPaperStructure["questions"] = [];
  const processedGroups = new Set<string>();
  const mappedGroups: CachedPaperStructure["groups"] = [];

  for (const node of nodes) {
    if (node.node_type === "QUESTION") {
      const q = allQuestions.find((q) => q.id === node.question_version_id);
      if (q) {
        orderedQuestions.push({
          id: q.id,
          type: q.type as QuestionType,
          text: q.text,
          textHtml: renderMathToHtml(q.text),
          marks: Number(q.marks),
          sectionId: node.section_version_id,
          sourceQuestionNumber: parseSourceQNum(q),
          imageUrl: getAssetImageUrl(q.image_assets),
          imageUrls: getAssetImageUrls(q.image_assets),
          image_assets: q.image_assets,
          codeSnippet: q.code_content?.content,
          options: q.option_versions
            ?.sort((a, b) => a.sequence - b.sequence)
            .map((o) => ({
              id: o.id,
              text: o.text,
              textHtml: renderMathToHtml(o.text),
              imageUrl: getAssetImageUrl(o.image_assets),
              imageUrls: getAssetImageUrls(o.image_assets),
              image_assets: o.image_assets,
            })),
        });
      }
    } else if (node.node_type === "GROUP") {
      const g = groups.find((g) => g.id === node.group_version_id);
      if (g && !processedGroups.has(g.id)) {
        processedGroups.add(g.id);
        const gQs = allQuestions
          .filter((q) => q.group_version_id === g.id)
          .sort((a, b) => (parseSourceQNum(a) ?? 0) - (parseSourceQNum(b) ?? 0));
        const gQIds = gQs.map((q) => q.id);

        mappedGroups.push({
          id: g.id,
          title: g.title || "",
          titleHtml: renderMathToHtml(g.title),
          passage: g.passage || "",
          passageHtml: renderMathToHtml(g.passage),
          imageUrl: getAssetImageUrl(g.image_assets),
          imageUrls: getAssetImageUrls(g.image_assets),
          image_assets: g.image_assets,
          codeSnippet: g.code_content?.content,
          referenceMaterial: g.reference_material as ReferenceMaterial | undefined,
          questionIds: gQIds,
        });

        for (const q of gQs) {
          orderedQuestions.push({
            id: q.id,
            type: q.type as QuestionType,
            text: q.text,
            textHtml: renderMathToHtml(q.text),
            marks: Number(q.marks),
            groupId: g.id,
            sectionId: node.section_version_id,
            sourceQuestionNumber: parseSourceQNum(q),
            imageUrl: getAssetImageUrl(q.image_assets),
            imageUrls: getAssetImageUrls(q.image_assets),
            image_assets: q.image_assets,
            codeSnippet: q.code_content?.content,
            options: q.option_versions
              ?.sort((a, b) => a.sequence - b.sequence)
              .map((o) => ({
                id: o.id,
                text: o.text,
                textHtml: renderMathToHtml(o.text),
                imageUrl: getAssetImageUrl(o.image_assets),
                imageUrls: getAssetImageUrls(o.image_assets),
                image_assets: o.image_assets,
              })),
          });
        }
      }
    }
  }

  // Defensive guarantee: append any questions not referenced in nodes
  const includedQIds = new Set(orderedQuestions.map((q) => q.id));
  for (const q of allQuestions) {
    if (!includedQIds.has(q.id)) {
      orderedQuestions.push({
        id: q.id,
        type: q.type as QuestionType,
        text: q.text,
        textHtml: renderMathToHtml(q.text),
        marks: Number(q.marks),
        groupId: q.group_version_id || undefined,
        sectionId: q.section_version_id || undefined,
        sourceQuestionNumber: parseSourceQNum(q),
        imageUrl: getAssetImageUrl(q.image_assets),
        imageUrls: getAssetImageUrls(q.image_assets),
        image_assets: q.image_assets,
        codeSnippet: q.code_content?.content,
        options: q.option_versions
          ?.sort((a, b) => a.sequence - b.sequence)
          .map((o) => ({
            id: o.id,
            text: o.text,
            textHtml: renderMathToHtml(o.text),
            imageUrl: getAssetImageUrl(o.image_assets),
            imageUrls: getAssetImageUrls(o.image_assets),
            image_assets: o.image_assets,
          })),
      });
    }
  }

  // Defensive guarantee: append any groups not referenced in nodes
  for (const g of groups) {
    if (!processedGroups.has(g.id)) {
      processedGroups.add(g.id);
      const gQs = allQuestions.filter((q) => q.group_version_id === g.id);
      mappedGroups.push({
        id: g.id,
        title: g.title || "",
        titleHtml: renderMathToHtml(g.title),
        passage: g.passage || "",
        passageHtml: renderMathToHtml(g.passage),
        imageUrl: getAssetImageUrl(g.image_assets),
        imageUrls: getAssetImageUrls(g.image_assets),
        image_assets: g.image_assets,
        codeSnippet: g.code_content?.content,
        referenceMaterial: g.reference_material as ReferenceMaterial | undefined,
        questionIds: gQs.map((q) => q.id),
      });
    }
  }

  const structure: CachedPaperStructure = {
    id: paperId,
    title: paper.title,
    referenceMaterial: paper.reference_material as ReferenceMaterial | undefined,
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      referenceMaterial: s.reference_material as ReferenceMaterial | undefined,
    })),
    groups: mappedGroups,
    questions: orderedQuestions,
  };

  paperStructureCache.set(paperId, structure);
  return structure;
}

/**
 * Loads multiple paper structures using bulk queries (3-4 queries total instead of 6*N)
 * and populates the in-memory cache.
 */
export async function fetchBulkPaperStructures(
  paperIds: string[],
  client: SupabaseClient
): Promise<Map<string, CachedPaperStructure>> {
  const result = new Map<string, CachedPaperStructure>();
  if (paperIds.length === 0) return result;

  // 1. Fetch paper headers and sections for all requested papers in parallel
  const [papersRes, sectionsRes] = await Promise.all([
    client
      .from("paper_set_versions")
      .select("id, title, reference_material")
      .in("id", paperIds),
    client
      .from("section_versions")
      .select("id, paper_set_version_id, title, reference_material")
      .in("paper_set_version_id", paperIds),
  ]);

  const papers = papersRes.data || [];
  const papersMap = new Map(papers.map((p) => [p.id, p]));
  const allSections = sectionsRes.data || [];
  const allSectionIds = allSections.map((s) => s.id);

  if (allSectionIds.length === 0) {
    for (const paper of papers) {
      const structure: CachedPaperStructure = {
        id: paper.id,
        title: paper.title,
        referenceMaterial: paper.reference_material as ReferenceMaterial | undefined,
        sections: [],
        groups: [],
        questions: [],
      };
      paperStructureCache.set(paper.id, structure);
      result.set(paper.id, structure);
    }
    return result;
  }

  // 2. Parallel fetch of nodes, groups, and section-level questions across ALL sections
  const [nodesRes, groupsRes, questionsWithSectionRes] = await Promise.all([
    client
      .from("section_content_node_versions")
      .select("id, section_version_id, node_type, question_version_id, group_version_id, sequence")
      .in("section_version_id", allSectionIds)
      .order("sequence", { ascending: true }),
    client
      .from("group_versions")
      .select("*")
      .in("section_version_id", allSectionIds),
    client
      .from("question_versions")
      .select(
        "id, cloned_from_id, section_version_id, group_version_id, type, text, marks, image_assets, code_content, option_versions(id, text, sequence, image_assets), question_templates(source)"
      )
      .in("section_version_id", allSectionIds),
  ]);

  const allNodes = nodesRes.data || [];
  const allGroups = groupsRes.data || [];
  const allGroupIds = allGroups.map((g) => g.id);

  // 3. Fetch group-level questions if groups exist
  let questionsWithGroup: QuestionRow[] = [];
  if (allGroupIds.length > 0) {
    const groupQRes = await client
      .from("question_versions")
      .select(
        "id, cloned_from_id, section_version_id, group_version_id, type, text, marks, image_assets, code_content, option_versions(id, text, sequence, image_assets), question_templates(source)"
      )
      .in("group_version_id", allGroupIds);
    questionsWithGroup = (groupQRes.data as unknown as QuestionRow[]) || [];
  }

  const allQuestions = [
    ...((questionsWithSectionRes.data as unknown as QuestionRow[]) || []),
    ...questionsWithGroup,
  ];

  // Assemble structures for each paper
  for (const paperId of paperIds) {
    const paper = papersMap.get(paperId);
    if (!paper) continue;

    const paperSections = allSections.filter((s) => s.paper_set_version_id === paperId);
    const paperSectionIds = new Set(paperSections.map((s) => s.id));
    const paperNodes = allNodes.filter((n) => paperSectionIds.has(n.section_version_id));
    const paperGroups = allGroups.filter((g) => paperSectionIds.has(g.section_version_id));
    const paperGroupIds = new Set(paperGroups.map((g) => g.id));
    const paperQuestions = allQuestions.filter(
      (q) =>
        (q.section_version_id && paperSectionIds.has(q.section_version_id)) ||
        (q.group_version_id && paperGroupIds.has(q.group_version_id))
    );

    const orderedQuestions: CachedPaperStructure["questions"] = [];
    const processedGroups = new Set<string>();
    const mappedGroups: CachedPaperStructure["groups"] = [];

    for (const node of paperNodes) {
      if (node.node_type === "QUESTION") {
        const q = paperQuestions.find((q) => q.id === node.question_version_id);
        if (q) {
          orderedQuestions.push({
            id: q.id,
            type: q.type as QuestionType,
            text: q.text,
            textHtml: renderMathToHtml(q.text),
            marks: Number(q.marks),
            sectionId: node.section_version_id,
            sourceQuestionNumber: parseSourceQNum(q),
            imageUrl: getAssetImageUrl(q.image_assets),
            imageUrls: getAssetImageUrls(q.image_assets),
            image_assets: q.image_assets,
            codeSnippet: q.code_content?.content,
            options: q.option_versions
              ?.sort((a, b) => a.sequence - b.sequence)
              .map((o) => ({
                id: o.id,
                text: o.text,
                textHtml: renderMathToHtml(o.text),
                imageUrl: getAssetImageUrl(o.image_assets),
                imageUrls: getAssetImageUrls(o.image_assets),
                image_assets: o.image_assets,
              })),
          });
        }
      } else if (node.node_type === "GROUP") {
        const g = paperGroups.find((g) => g.id === node.group_version_id);
        if (g && !processedGroups.has(g.id)) {
          processedGroups.add(g.id);
          const gQs = paperQuestions
            .filter((q) => q.group_version_id === g.id)
            .sort((a, b) => (parseSourceQNum(a) ?? 0) - (parseSourceQNum(b) ?? 0));
          const gQIds = gQs.map((q) => q.id);

          mappedGroups.push({
            id: g.id,
            title: g.title || "",
            titleHtml: renderMathToHtml(g.title),
            passage: g.passage || "",
            passageHtml: renderMathToHtml(g.passage),
            imageUrl: getAssetImageUrl(g.image_assets),
            imageUrls: getAssetImageUrls(g.image_assets),
            image_assets: g.image_assets,
            codeSnippet: g.code_content?.content,
            referenceMaterial: g.reference_material as ReferenceMaterial | undefined,
            questionIds: gQIds,
          });

          for (const q of gQs) {
            orderedQuestions.push({
              id: q.id,
              type: q.type as QuestionType,
              text: q.text,
              textHtml: renderMathToHtml(q.text),
              marks: Number(q.marks),
              groupId: g.id,
              sectionId: node.section_version_id,
              sourceQuestionNumber: parseSourceQNum(q),
              imageUrl: getAssetImageUrl(q.image_assets),
              imageUrls: getAssetImageUrls(q.image_assets),
              image_assets: q.image_assets,
              codeSnippet: q.code_content?.content,
              options: q.option_versions
                ?.sort((a, b) => a.sequence - b.sequence)
                .map((o) => ({
                  id: o.id,
                  text: o.text,
                  textHtml: renderMathToHtml(o.text),
                  imageUrl: getAssetImageUrl(o.image_assets),
                  imageUrls: getAssetImageUrls(o.image_assets),
                  image_assets: o.image_assets,
                })),
            });
          }
        }
      }
    }

    // Defensive guarantee: append any questions not referenced in nodes
    const includedQIds = new Set(orderedQuestions.map((q) => q.id));
    for (const q of paperQuestions) {
      if (!includedQIds.has(q.id)) {
        orderedQuestions.push({
          id: q.id,
          type: q.type as QuestionType,
          text: q.text,
          textHtml: renderMathToHtml(q.text),
          marks: Number(q.marks),
          groupId: q.group_version_id || undefined,
          sectionId: q.section_version_id || undefined,
          sourceQuestionNumber: parseSourceQNum(q),
          imageUrl: getAssetImageUrl(q.image_assets),
          imageUrls: getAssetImageUrls(q.image_assets),
          image_assets: q.image_assets,
          codeSnippet: q.code_content?.content,
          options: q.option_versions
            ?.sort((a, b) => a.sequence - b.sequence)
            .map((o) => ({
              id: o.id,
              text: o.text,
              textHtml: renderMathToHtml(o.text),
              imageUrl: getAssetImageUrl(o.image_assets),
              imageUrls: getAssetImageUrls(o.image_assets),
              image_assets: o.image_assets,
            })),
        });
      }
    }

    // Defensive guarantee: append any groups not referenced in nodes
    for (const g of paperGroups) {
      if (!processedGroups.has(g.id)) {
        processedGroups.add(g.id);
        const gQs = paperQuestions.filter((q) => q.group_version_id === g.id);
        mappedGroups.push({
          id: g.id,
          title: g.title || "",
          titleHtml: renderMathToHtml(g.title),
          passage: g.passage || "",
          passageHtml: renderMathToHtml(g.passage),
          imageUrl: getAssetImageUrl(g.image_assets),
          imageUrls: getAssetImageUrls(g.image_assets),
          image_assets: g.image_assets,
          codeSnippet: g.code_content?.content,
          referenceMaterial: g.reference_material as ReferenceMaterial | undefined,
          questionIds: gQs.map((q) => q.id),
        });
      }
    }

    const structure: CachedPaperStructure = {
      id: paperId,
      title: paper.title,
      referenceMaterial: paper.reference_material as ReferenceMaterial | undefined,
      sections: paperSections.map((s) => ({
        id: s.id,
        title: s.title,
        referenceMaterial: s.reference_material as ReferenceMaterial | undefined,
      })),
      groups: mappedGroups,
      questions: orderedQuestions,
    };

    paperStructureCache.set(paperId, structure);
    result.set(paperId, structure);
  }

  return result;
}

/**
 * Loads multiple paper structures concurrently and serves from in-memory cache when available.
 * Leverages Next.js unstable_cache (Data Cache) to persist across serverless instances and cold starts.
 */
export async function getOrLoadPaperStructures(
  paperIds: string[],
  client?: SupabaseClient
): Promise<Map<string, CachedPaperStructure>> {
  const result = new Map<string, CachedPaperStructure>();
  const missingIds: string[] = [];

  for (const id of paperIds) {
    const cached = paperStructureCache.get(id);
    if (cached) {
      result.set(id, cached);
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length > 0) {
    await Promise.all(
      missingIds.map(async (id) => {
        let structure: CachedPaperStructure | null = null;
        try {
          structure = await getCachedPaperStructure(id);
        } catch (err) {
          console.warn(`unstable_cache miss/error for paper ${id}, querying directly:`, err);
          const queryClient = client || getServiceClient();
          structure = await fetchSinglePaperStructure(id, queryClient);
        }
        if (structure) {
          paperStructureCache.set(id, structure);
          result.set(id, structure);
        }
      })
    );
  }

  return result;
}

/**
 * Binds student metadata and exam duration to a cached paper structure,
 * creating an independent deep clone so mutations (like signed URLs) do not leak into the cache.
 */
export function buildExamFromStructure(
  structure: CachedPaperStructure,
  user: { id: string; email?: string | null },
  durationSeconds: number
): Exam {
  return {
    id: structure.id,
    title: structure.title,
    candidateName: user.email || "Student",
    candidateId: user.id,
    durationSeconds,
    referenceMaterial: structure.referenceMaterial
      ? JSON.parse(JSON.stringify(structure.referenceMaterial))
      : undefined,
    sections: structure.sections ? JSON.parse(JSON.stringify(structure.sections)) : [],
    groups: structure.groups ? JSON.parse(JSON.stringify(structure.groups)) : [],
    questions: structure.questions ? JSON.parse(JSON.stringify(structure.questions)) : [],
  };
}

/**
 * Validates whether a given string is a safe storage path within question_assets.
 */
export function isValidStoragePath(path: unknown): path is string {
  if (typeof path !== "string" || !path.trim()) return false;
  const trimmed = path.trim();
  if (trimmed.includes("..")) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  return trimmed.startsWith("papers/");
}

/**
 * Extracts storage paths from an unknown imageAssets structure.
 */
export function extractStoragePathsFromAssets(imageAssets: unknown): string[] {
  if (!imageAssets) return [];
  const assets = (Array.isArray(imageAssets) ? imageAssets : [imageAssets]) as AssetRef[];
  const paths: string[] = [];
  for (const a of assets) {
    if (a && isValidStoragePath(a.storage_path)) {
      paths.push(a.storage_path);
    }
  }
  return paths;
}

/**
 * Extracts storage paths from ReferenceMaterial structure.
 */
export function extractStoragePathsFromReference(ref?: ReferenceMaterial | null): string[] {
  if (!ref) return [];
  const paths: string[] = [];

  // 1. Assets array
  if (Array.isArray(ref.assets)) {
    for (const a of ref.assets) {
      if (a && isValidStoragePath(a.storage_path)) {
        paths.push(a.storage_path);
      }
    }
  }

  // 2. Sections items
  if (Array.isArray(ref.sections)) {
    for (const sec of ref.sections) {
      if (Array.isArray(sec.items)) {
        for (const item of sec.items) {
          if (item && item.type === "image" && isValidStoragePath(item.storage_path)) {
            paths.push(item.storage_path);
          }
        }
      }
    }
  }

  return paths;
}

/**
 * Recursively collects all unique storage paths across a set of cached paper structures.
 */
export function collectStoragePathsFromStructures(
  structures: Iterable<CachedPaperStructure>
): string[] {
  const uniquePaths = new Set<string>();

  for (const paper of structures) {
    // Paper-level reference material
    for (const p of extractStoragePathsFromReference(paper.referenceMaterial)) {
      uniquePaths.add(p);
    }

    // Section-level reference material
    if (Array.isArray(paper.sections)) {
      for (const sec of paper.sections) {
        for (const p of extractStoragePathsFromReference(sec.referenceMaterial)) {
          uniquePaths.add(p);
        }
      }
    }

    // Groups
    if (Array.isArray(paper.groups)) {
      for (const g of paper.groups) {
        for (const p of extractStoragePathsFromAssets(g.image_assets)) {
          uniquePaths.add(p);
        }
        for (const p of extractStoragePathsFromReference(g.referenceMaterial)) {
          uniquePaths.add(p);
        }
      }
    }

    // Questions and options
    if (Array.isArray(paper.questions)) {
      for (const q of paper.questions) {
        for (const p of extractStoragePathsFromAssets(q.image_assets)) {
          uniquePaths.add(p);
        }
        if (Array.isArray(q.options)) {
          for (const opt of q.options) {
            for (const p of extractStoragePathsFromAssets(opt.image_assets)) {
              uniquePaths.add(p);
            }
          }
        }
      }
    }
  }

  return Array.from(uniquePaths);
}

/**
 * Batches signing of storage paths using Supabase Storage createSignedUrls in a single call.
 * Uses the private 'question_assets' bucket with an expiry of roughly 3 hours (10800s).
 */
export async function signPaperStoragePaths(
  paths: string[],
  client: SupabaseClient,
  expiresInSeconds = 10800
): Promise<Map<string, string>> {
  const signedUrlMap = new Map<string, string>();
  if (paths.length === 0) return signedUrlMap;

  // Deduplicate paths
  const uniquePaths = Array.from(new Set(paths.filter(isValidStoragePath)));
  if (uniquePaths.length === 0) return signedUrlMap;

  try {
    const { data, error } = await client.storage
      .from("question_assets")
      .createSignedUrls(uniquePaths, expiresInSeconds);

    if (error) {
      console.error("[Storage signing] Failed to batch sign URLs:", error);
      return signedUrlMap;
    }

    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.error) {
          console.warn(`[Storage signing] Error signing path "${item.path}":`, item.error);
        } else if (item.path && item.signedUrl) {
          signedUrlMap.set(item.path, item.signedUrl);
        }
      }
    }
  } catch (err) {
    console.error("[Storage signing] Unexpected exception during createSignedUrls:", err);
  }

  return signedUrlMap;
}

/**
 * Resolves asset references into signed URLs.
 */
function resolveAssetUrls(
  imageAssets: unknown,
  signedUrlMap: Map<string, string>
): { imageUrl?: string; imageUrls: string[] } {
  if (!imageAssets) return { imageUrl: undefined, imageUrls: [] };
  const assets = (Array.isArray(imageAssets) ? imageAssets : [imageAssets]) as AssetRef[];
  const urls: string[] = [];

  for (const a of assets) {
    if (!a) continue;
    if (a.storage_path && signedUrlMap.has(a.storage_path)) {
      urls.push(signedUrlMap.get(a.storage_path)!);
    } else if (a.url && /^https?:\/\//i.test(a.url)) {
      urls.push(a.url);
    }
    // If signing failed or missing, do NOT emit raw storage_path or /api/assets/
  }

  return {
    imageUrl: urls.length > 0 ? urls[0] : undefined,
    imageUrls: urls,
  };
}

/**
 * Clones a ReferenceMaterial and replaces storage_path with signed URLs.
 */
function applySignedUrlsToReference(
  ref: ReferenceMaterial | undefined,
  signedUrlMap: Map<string, string>
): ReferenceMaterial | undefined {
  if (!ref) return undefined;

  const cloned: ReferenceMaterial = {
    title: ref.title,
    content: ref.content,
  };

  if (Array.isArray(ref.assets)) {
    cloned.assets = ref.assets.map((a) => {
      const signedUrl = a.storage_path ? signedUrlMap.get(a.storage_path) : undefined;
      return {
        storage_path: a.storage_path,
        url: signedUrl || (a.url && /^https?:\/\//i.test(a.url) ? a.url : undefined),
      };
    });
  }

  if (Array.isArray(ref.sections)) {
    cloned.sections = ref.sections.map((sec) => ({
      title: sec.title,
      items: Array.isArray(sec.items)
        ? sec.items.map((item) => {
            if (item.type === "image") {
              const itemStoragePath = item.storage_path;
              const signedUrl = itemStoragePath ? signedUrlMap.get(itemStoragePath) : undefined;
              return {
                ...item,
                url: signedUrl || (item.url && /^https?:\/\//i.test(item.url) ? item.url : ""),
              };
            }
            return item;
          })
        : [],
    }));
  }

  return cloned;
}

/**
 * Deeply maps signed URLs onto a cloned Exam structure.
 * Never mutates cached structures.
 */
export function applySignedUrlsToExam(exam: Exam, signedUrlMap: Map<string, string>): Exam {
  // 1. Paper-level reference material
  if (exam.referenceMaterial) {
    exam.referenceMaterial = applySignedUrlsToReference(exam.referenceMaterial, signedUrlMap);
  }

  // 2. Sections
  if (Array.isArray(exam.sections)) {
    exam.sections = exam.sections.map((s) => ({
      ...s,
      referenceMaterial: applySignedUrlsToReference(s.referenceMaterial, signedUrlMap),
    }));
  }

  // 3. Groups
  if (Array.isArray(exam.groups)) {
    exam.groups = exam.groups.map((g) => {
      const resolved = resolveAssetUrls(g.image_assets, signedUrlMap);
      return {
        ...g,
        imageUrl: resolved.imageUrl || g.imageUrl,
        imageUrls: resolved.imageUrls.length > 0 ? resolved.imageUrls : g.imageUrls,
        referenceMaterial: applySignedUrlsToReference(g.referenceMaterial, signedUrlMap),
      };
    });
  }

  // 4. Questions and options
  if (Array.isArray(exam.questions)) {
    exam.questions = exam.questions.map((q) => {
      const resolvedQ = resolveAssetUrls(q.image_assets, signedUrlMap);
      const options = Array.isArray(q.options)
        ? q.options.map((opt) => {
            const resolvedOpt = resolveAssetUrls(opt.image_assets, signedUrlMap);
            return {
              ...opt,
              images: resolveImages(opt.image_assets, signedUrlMap),
              imageUrl: resolvedOpt.imageUrl || opt.imageUrl,
              imageUrls: resolvedOpt.imageUrls.length > 0 ? resolvedOpt.imageUrls : opt.imageUrls,
            };
          })
        : undefined;

      return {
        ...q,
        images: resolveImages(q.image_assets, signedUrlMap),
        imageUrl: resolvedQ.imageUrl || q.imageUrl,
        imageUrls: resolvedQ.imageUrls.length > 0 ? resolvedQ.imageUrls : q.imageUrls,
        options,
      };
    });
  }

  return exam;
}

/**
 * Checks whether a given storage path belongs to any paper in an assessment event.
 * Leverages in-memory cached paper structures for near-instant validation.
 */
export async function isAssetInAssessmentPapers(
  assessmentId: string,
  storagePath: string,
  client: SupabaseClient
): Promise<boolean> {
  try {
    const { data: subjects } = await client
      .from("assessment_subjects")
      .select("paper_set_version_id")
      .eq("assessment_event_id", assessmentId);

    if (!subjects || subjects.length === 0) return false;

    const paperIds = Array.from(new Set(subjects.map((s) => s.paper_set_version_id).filter(Boolean)));
    const paperMap = await getOrLoadPaperStructures(paperIds, client);
    const validPaths = new Set(collectStoragePathsFromStructures(paperMap.values()));

    return validPaths.has(storagePath);
  } catch (err) {
    console.error("[isAssetInAssessmentPapers] Error checking asset authorization:", err);
    return false;
  }
}

