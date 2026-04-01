import type { TextItem } from 'pdfjs-dist/types/src/display/api';

export interface ExtractedTermEntry {
  term_name: string;
  official_definition: string;
  domain_number: number;
}

export interface KnowledgeExtractResult {
  totalPages: number;
  entries: ExtractedTermEntry[];
}

function guessDomain(term: string, definition: string): number {
  const lower = `${term} ${definition}`.toLowerCase();
  const domainKeywords: Record<number, string[]> = {
    1: ['risk', 'governance', 'compliance', 'policy', 'legal', 'privacy'],
    2: ['asset', 'classification', 'retention', 'sanitization', 'labeling'],
    3: ['crypto', 'encryption', 'cipher', 'pki', 'architecture', 'biba', 'bell-lapadula'],
    4: ['network', 'firewall', 'vpn', 'tcp', 'udp', 'dns', 'wireless', 'protocol'],
    5: ['identity', 'authentication', 'authorization', 'access control', 'rbac', 'mfa', 'sso'],
    6: ['audit', 'assessment', 'testing', 'penetration', 'vulnerability', 'metrics'],
    7: ['incident', 'forensic', 'operations', 'monitoring', 'siem', 'recovery'],
    8: ['sdlc', 'software', 'devsecops', 'injection', 'xss', 'csrf', 'malware'],
  };

  let best = 1;
  let score = 0;
  for (const [domain, words] of Object.entries(domainKeywords)) {
    let s = 0;
    for (const w of words) {
      if (lower.includes(w)) s++;
    }
    if (s > score) {
      best = Number(domain);
      score = s;
    }
  }
  return best;
}

type Token = {
  text: string;
  x: number;
  y: number;
  bold: boolean;
  width: number;
};

type Line = {
  y: number;
  indent: number;
  tokens: Token[];
};

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, ' ').trim();
}

function isNoiseLineText(text: string) {
  const t = normalizeSpaces(text);
  if (!t) return true;
  if (/^glossary$/i.test(t)) return true;
  if (/^numbers and symbols$/i.test(t)) return true;
  if (/^some terms in this glossary/i.test(t)) return true;
  if (/^\d+\s+glossary$/i.test(t)) return true;
  if (/^\d+$/.test(t)) return true;
  return false;
}

function looksLikeBold(fontName: string, styleFont: string) {
  const sample = `${fontName} ${styleFont}`.toLowerCase();
  return /bold|black|demi|heavy|semibold/.test(sample);
}

function buildLinesFromPage(textContent: any): Line[] {
  const styles = textContent.styles || {};
  const lines: Line[] = [];

  for (const item of textContent.items || []) {
    const t = item as TextItem & { fontName?: string; transform?: number[] };
    const text = normalizeSpaces(t.str || '');
    if (!text) continue;
    const x = Array.isArray(t.transform) ? Number(t.transform[4] || 0) : 0;
    const y = Array.isArray(t.transform) ? Number(t.transform[5] || 0) : 0;
    const width = Number((t as any).width || 0);
    const fontName = String(t.fontName || '');
    const styleFont = String(styles?.[fontName]?.fontFamily || '');
    const bold = looksLikeBold(fontName, styleFont);

    let target: Line | null = null;
    let minDiff = Number.MAX_VALUE;
    for (const line of lines) {
      const d = Math.abs(line.y - y);
      if (d <= 1.8 && d < minDiff) {
        target = line;
        minDiff = d;
      }
    }
    if (!target) {
      target = { y, indent: x, tokens: [] };
      lines.push(target);
    }

    target.tokens.push({ text, x, y, bold, width });
    if (x < target.indent) target.indent = x;
  }

  lines.sort((a, b) => b.y - a.y);
  for (const line of lines) {
    line.tokens.sort((a, b) => a.x - b.x);
  }
  return lines;
}

function extractEntryFromLines(lines: Line[]): ExtractedTermEntry[] {
  const entries: ExtractedTermEntry[] = [];
  let currentTerm = '';
  let currentDef = '';
  let pendingStandaloneTerm = '';

  const pushCurrent = () => {
    const term = normalizeSpaces(currentTerm);
    const def = normalizeSpaces(currentDef);
    if (!term || !def) return;
    if (term.length < 2 || term.length > 120) return;
    if (def.length < 8) return;
    entries.push({
      term_name: term,
      official_definition: def,
      domain_number: guessDomain(term, def),
    });
  };

  for (const line of lines) {
    const lineText = normalizeSpaces(line.tokens.map((t) => t.text).join(' '));
    if (isNoiseLineText(lineText)) continue;

    // 术语 = 行首连续粗体 token
    const leadingBold: Token[] = [];
    for (const tk of line.tokens) {
      if (leadingBold.length === 0 && !tk.bold) break;
      if (tk.bold) {
        leadingBold.push(tk);
      } else {
        break;
      }
    }

    let splitIndex = -1;
    if (leadingBold.length > 0) {
      splitIndex = leadingBold.length;
    } else if (line.tokens.length >= 2) {
      // 若拿不到粗体信息，退化为“列间距”切分（glossary 通常 term 与 definition 之间空隙明显）
      let bestGap = 0;
      let bestIdx = -1;
      for (let i = 0; i < line.tokens.length - 1; i++) {
        const cur = line.tokens[i];
        const nxt = line.tokens[i + 1];
        const right = cur.x + Math.max(0, cur.width);
        const gap = nxt.x - right;
        if (gap > bestGap) {
          bestGap = gap;
          bestIdx = i + 1;
        }
      }
      if (bestGap >= 8 && bestIdx > 0 && bestIdx <= 10) {
        splitIndex = bestIdx;
      }
    }

    const termCandidate = normalizeSpaces(
      (splitIndex > 0 ? line.tokens.slice(0, splitIndex) : []).map((t) => t.text).join(' ')
    );
    const restTokens =
      splitIndex > 0 ? line.tokens.slice(splitIndex) : line.tokens;
    const restText = normalizeSpaces(restTokens.map((t) => t.text).join(' '));

    const termWordCount = termCandidate ? termCandidate.split(/\s+/).length : 0;
    const plausibleTerm =
      termCandidate.length >= 2 &&
      termCandidate.length <= 90 &&
      termWordCount <= 10 &&
      /[A-Za-z0-9]/.test(termCandidate);

    if (plausibleTerm && leadingBold.length > 0) {
      pushCurrent();
      if (restText.length >= 6) {
        currentTerm = termCandidate;
        currentDef = restText;
        pendingStandaloneTerm = '';
      } else {
        // 术语单独一行，定义在下一行
        currentTerm = '';
        currentDef = '';
        pendingStandaloneTerm = termCandidate;
      }
      continue;
    }

    // 兼容 “term 单独一行，下一行开始定义”
    if (pendingStandaloneTerm && lineText.length >= 8) {
      currentTerm = pendingStandaloneTerm;
      currentDef = lineText;
      pendingStandaloneTerm = '';
      continue;
    }

    // continuation line：拼接到当前定义
    if (currentDef) {
      currentDef += ` ${lineText}`;
    }
  }

  pushCurrent();

  // 按 term 去重
  const map = new Map<string, ExtractedTermEntry>();
  for (const e of entries) {
    const key = e.term_name.toLowerCase().trim();
    if (!map.has(key)) map.set(key, e);
  }
  return [...map.values()];
}

function parseEntriesFromFlatText(fullText: string): ExtractedTermEntry[] {
  const lines = fullText
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .filter((l) => l.trim().length > 0);

  const entries: ExtractedTermEntry[] = [];
  let currentTerm = '';
  let currentDef = '';
  let pendingStandaloneTerm = '';

  const pushCurrent = () => {
    const term = normalizeSpaces(currentTerm);
    const def = normalizeSpaces(currentDef);
    if (!term || !def) return;
    if (term.length < 2 || term.length > 120) return;
    if (def.length < 8) return;
    entries.push({
      term_name: term,
      official_definition: def,
      domain_number: guessDomain(term, def),
    });
  };

  for (const line of lines) {
    const raw = line;
    const trimmed = normalizeSpaces(raw);
    if (isNoiseLineText(trimmed)) continue;

    const m = raw.match(/^([A-Za-z0-9*][A-Za-z0-9\s\-\/(),.'":+]{1,140}?)\s{2,}(.+)$/);
    if (m) {
      pushCurrent();
      currentTerm = m[1].trim();
      currentDef = m[2].trim();
      pendingStandaloneTerm = '';
      continue;
    }

    const singleGap = trimmed.match(/^([A-Za-z0-9*][A-Za-z0-9\s\-\/(),.'":+]{1,120})\s([A-Z].{8,})$/);
    if (singleGap && !singleGap[1].includes('.') && singleGap[1].length <= 90) {
      pushCurrent();
      currentTerm = singleGap[1].trim();
      currentDef = singleGap[2].trim();
      pendingStandaloneTerm = '';
      continue;
    }

    const looksLikeTermOnly =
      !trimmed.includes('.') &&
      !trimmed.includes('?') &&
      trimmed.length >= 2 &&
      trimmed.length <= 90 &&
      /^[A-Za-z0-9*][A-Za-z0-9\s\-\/(),.'":+]+$/.test(trimmed);

    if (looksLikeTermOnly) {
      pendingStandaloneTerm = trimmed;
      continue;
    }

    if (pendingStandaloneTerm && trimmed.length >= 8) {
      currentTerm = pendingStandaloneTerm;
      currentDef = trimmed;
      pendingStandaloneTerm = '';
      continue;
    }

    if (currentDef) {
      currentDef += ` ${trimmed}`;
    }
  }

  pushCurrent();

  const uniq = new Map<string, ExtractedTermEntry>();
  for (const e of entries) {
    const key = e.term_name.toLowerCase().trim().replace(/\s+/g, ' ');
    if (!uniq.has(key)) uniq.set(key, e);
  }
  return [...uniq.values()];
}

export async function extractTermsFromPDF(
  file: File,
  onProgress?: (msg: string) => void
): Promise<KnowledgeExtractResult> {
  onProgress?.('正在加载 PDF 解析引擎...');
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  onProgress?.('正在读取 PDF 文件...');
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;

  const totalPages = doc.numPages;
  let allEntries: ExtractedTermEntry[] = [];
  let flatText = '';
  for (let i = 1; i <= totalPages; i++) {
    if (i % 20 === 0 || i === totalPages) {
      onProgress?.(`正在提取文本 (${i}/${totalPages} 页)...`);
    }
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const lines = buildLinesFromPage(textContent as any);
    const pageEntries = extractEntryFromLines(lines);
    allEntries = [...allEntries, ...pageEntries];

    const pageText = (textContent.items || [])
      .map((item: any) => {
        const str = String(item?.str || '');
        return item?.hasEOL ? `${str}\n` : `${str} `;
      })
      .join('');
    flatText += `${pageText}\n`;
  }

  onProgress?.('正在识别术语与定义...');
  // 全文去重（同一术语以首个出现为准）
  const uniq = new Map<string, ExtractedTermEntry>();
  for (const e of allEntries) {
    const key = e.term_name.toLowerCase().trim().replace(/\s+/g, ' ');
    if (!uniq.has(key)) uniq.set(key, e);
  }
  let entries = [...uniq.values()];
  if (entries.length < 20) {
    // 兜底：若版式识别过少，回退到纯文本规则，避免出现 0 条
    const fallback = parseEntriesFromFlatText(flatText);
    if (fallback.length > entries.length) {
      entries = fallback;
    }
  }
  onProgress?.(`识别到 ${entries.length} 条术语`);

  return { totalPages, entries };
}
