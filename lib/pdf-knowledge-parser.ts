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

    target.tokens.push({ text, x, y, bold });
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

    const termCandidate = normalizeSpaces(leadingBold.map((t) => t.text).join(' '));
    const restTokens =
      leadingBold.length > 0 ? line.tokens.slice(leadingBold.length) : line.tokens;
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
  for (let i = 1; i <= totalPages; i++) {
    if (i % 20 === 0 || i === totalPages) {
      onProgress?.(`正在提取文本 (${i}/${totalPages} 页)...`);
    }
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const lines = buildLinesFromPage(textContent as any);
    const pageEntries = extractEntryFromLines(lines);
    allEntries = [...allEntries, ...pageEntries];
  }

  onProgress?.('正在识别术语与定义...');
  // 全文去重（同一术语以首个出现为准）
  const uniq = new Map<string, ExtractedTermEntry>();
  for (const e of allEntries) {
    const key = e.term_name.toLowerCase().trim().replace(/\s+/g, ' ');
    if (!uniq.has(key)) uniq.set(key, e);
  }
  const entries = [...uniq.values()];
  onProgress?.(`识别到 ${entries.length} 条术语`);

  return { totalPages, entries };
}
