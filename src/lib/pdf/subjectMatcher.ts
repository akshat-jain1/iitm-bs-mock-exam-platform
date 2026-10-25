export interface SubjectInfo {
  canonicalName: string;
  canonicalCode: string;
  display: string;
}

const KNOWN_SUBJECTS: Array<{
  canonicalName: string;
  canonicalCode: string;
  patterns: RegExp[];
}> = [
  {
    canonicalName: 'Mathematics 1',
    canonicalCode: 'MATH101',
    patterns: [
      /\b(?:sem(?:ester)?\s*1\s+)?math(?:s|ematics)?\s*1\b/i,
      /\bmathematics\s+for\s+data\s+science\s+(?:1|i)\b/i,
      /\bmath101\b/i,
      /\bmath(?:s|ematics)?\s*1\b/i,
    ],
  },
  {
    canonicalName: 'Mathematics 2',
    canonicalCode: 'MATH102',
    patterns: [
      /\b(?:sem(?:ester)?\s*2\s+)?math(?:s|ematics)?\s*2\b/i,
      /\bmathematics\s+for\s+data\s+science\s+(?:2|ii)\b/i,
      /\bmath102\b/i,
      /\bmath(?:s|ematics)?\s*2\b/i,
    ],
  },
  {
    canonicalName: 'Statistics 1',
    canonicalCode: 'STAT101',
    patterns: [
      /\b(?:sem(?:ester)?\s*1\s+)?stat(?:s|istics)?\s*1\b/i,
      /\bstatistics\s+for\s+data\s+science\s+(?:1|i)\b/i,
      /\bstat101\b/i,
      /\bstat(?:s|istics)?\s*1\b/i,
    ],
  },
  {
    canonicalName: 'Statistics 2',
    canonicalCode: 'STAT102',
    patterns: [
      /\b(?:sem(?:ester)?\s*2\s+)?stat(?:s|istics)?\s*2\b/i,
      /\bstatistics\s+for\s+data\s+science\s+(?:2|ii)\b/i,
      /\bstat102\b/i,
      /\bstat(?:s|istics)?\s*2\b/i,
    ],
  },
  {
    canonicalName: 'English 1',
    canonicalCode: 'ENG101',
    patterns: [
      /\b(?:sem(?:ester)?\s*1\s+)?english\s*1\b/i,
      /\benglish\s+(?:1|i)\b/i,
      /\beng101\b/i,
    ],
  },
  {
    canonicalName: 'English 2',
    canonicalCode: 'ENG102',
    patterns: [
      /\b(?:sem(?:ester)?\s*2\s+)?english\s*2\b/i,
      /\benglish\s+(?:2|ii)\b/i,
      /\beng102\b/i,
    ],
  },
  {
    canonicalName: 'Computational Thinking',
    canonicalCode: 'COMP101',
    patterns: [
      /\b(?:sem(?:ester)?\s*1\s+)?ct\b/i,
      /\bcomputational\s+thinking\b/i,
      /\bcomp101\b/i,
      /\bct101\b/i,
    ],
  },
  {
    canonicalName: 'Programming in Python',
    canonicalCode: 'PYTHON101',
    patterns: [
      /\b(?:sem(?:ester)?\s*2\s+)?(?:intro\s+to\s+)?python\b/i,
      /\bprogramming\s+in\s+python\b/i,
      /\bpython101\b/i,
    ],
  },
  {
    canonicalName: 'Database Management Systems',
    canonicalCode: 'DBMS101',
    patterns: [
      /\bdbms\b/i,
      /\bdatabase\s+management\s+systems?\b/i,
      /\bdbms101\b/i,
    ],
  },
];

export function getCanonicalSubject(raw: string): SubjectInfo | null {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.trim();
  for (const s of KNOWN_SUBJECTS) {
    for (const p of s.patterns) {
      if (p.test(clean)) {
        return {
          canonicalName: s.canonicalName,
          canonicalCode: s.canonicalCode,
          display: `${s.canonicalName} (${s.canonicalCode})`,
        };
      }
    }
  }
  return null;
}

export function matchesSubject(
  sourceSubjectStr: string | undefined | null,
  targetSubject: { name: string; code?: string } | string
): boolean {
  if (!sourceSubjectStr || !targetSubject) return false;

  const src = sourceSubjectStr.trim();
  const targetName = typeof targetSubject === "string" ? targetSubject.trim() : targetSubject.name?.trim() || "";
  const targetCode = typeof targetSubject === "string" ? "" : targetSubject.code?.trim() || "";

  // 1. Direct canonical comparison
  const srcCanonical = getCanonicalSubject(src);
  const targetCanonical = getCanonicalSubject(targetName) || (targetCode ? getCanonicalSubject(targetCode) : null);

  if (srcCanonical && targetCanonical) {
    if (srcCanonical.canonicalCode === targetCanonical.canonicalCode) {
      return true;
    }
    return false;
  }

  // 2. Target pattern matching on source
  if (targetCanonical) {
    const matched = KNOWN_SUBJECTS.find(k => k.canonicalCode === targetCanonical.canonicalCode);
    if (matched && matched.patterns.some(p => p.test(src))) {
      return true;
    }
    return false;
  }

  // 3. Fallback generic normalization
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nSrc = norm(src);
  const nTargetName = norm(targetName);
  const nTargetCode = norm(targetCode);

  if (nSrc.length > 2 && (nSrc === nTargetName || (nTargetCode && nSrc === nTargetCode))) {
    return true;
  }

  if (nSrc.length > 3 && nTargetName.length > 3 && (nSrc.includes(nTargetName) || nTargetName.includes(nSrc))) {
    return true;
  }

  return false;
}
