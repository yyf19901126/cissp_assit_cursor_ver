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

function parseEntriesFromText(fullText: string): ExtractedTermEntry[] {
  const rawLines = fullText.split('\n');
  const lines = rawLines
    .map((l) => l.replace(/\s+$/g, ''))
    .filter((l) => l.trim().length > 0);

  const entries: ExtractedTermEntry[] = [];
  let currentTerm = '';
  let currentDef = '';
  let pendingTermOnly = '';

  const isNoiseLine = (line: string) => {
    const t = line.trim();
    if (!t) return true;
    if (/^glossary$/i.test(t)) return true;
    if (/^numbers and symbols$/i.test(t)) return true;
    if (/^some terms in this glossary/i.test(t)) return true;
    if (/^\d+\s+glossary$/i.test(t)) return true;
    if (/^\d+$/.test(t)) return true; // 页码
    return false;
  };

  const normalizeSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();

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
    if (isNoiseLine(line)) continue;

    const raw = line;
    const trimmed = normalizeSpaces(raw);

    // 词典格式常见：<term><2+ spaces><definition>
    const m = raw.match(/^([A-Za-z0-9*][A-Za-z0-9\s\-\/(),.'":+]{1,140}?)\s{2,}(.+)$/);
    if (m) {
      pushCurrent();
      currentTerm = m[1].trim();
      currentDef = m[2].trim();
      pendingTermOnly = '';
      continue;
    }

    // 兼容有些 PDF 被提取成 “term definition”（只有一个空格）
    const singleGap = trimmed.match(/^([A-Za-z0-9*][A-Za-z0-9\s\-\/(),.'":+]{1,120})\s([A-Z].{8,})$/);
    if (singleGap) {
      // term 候选尽量不含句号，避免把整句当 term
      if (!singleGap[1].includes('.') && singleGap[1].length <= 90) {
        pushCurrent();
        currentTerm = singleGap[1].trim();
        currentDef = singleGap[2].trim();
        pendingTermOnly = '';
        continue;
      }
    }

    // 兼容 “term 单独一行，definition 下一行”的情况
    const looksLikeTermOnly =
      !trimmed.includes('.') &&
      !trimmed.includes('?') &&
      trimmed.length >= 2 &&
      trimmed.length <= 90 &&
      /^[A-Za-z0-9*][A-Za-z0-9\s\-\/(),.'":+]+$/.test(trimmed);

    if (looksLikeTermOnly) {
      pendingTermOnly = trimmed;
      continue;
    }

    if (pendingTermOnly && trimmed.length >= 8) {
      pushCurrent();
      currentTerm = pendingTermOnly;
      currentDef = trimmed;
      pendingTermOnly = '';
      continue;
    }

    // continuation line
    if (currentDef) {
      currentDef += ` ${trimmed}`;
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
  let fullText = '';
  for (let i = 1; i <= totalPages; i++) {
    if (i % 20 === 0 || i === totalPages) {
      onProgress?.(`正在提取文本 (${i}/${totalPages} 页)...`);
    }
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => {
        const t = item as TextItem;
        return t.hasEOL ? `${t.str}\n` : t.str;
      })
      .join('');
    fullText += `${pageText}\n`;
  }

  onProgress?.('正在识别术语与定义...');
  const entries = parseEntriesFromText(fullText);
  onProgress?.(`识别到 ${entries.length} 条术语`);

  return { totalPages, entries };
}
