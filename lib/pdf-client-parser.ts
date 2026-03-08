// lib/pdf-client-parser.ts
// 客户端 PDF 解析工具 - 在浏览器中使用 pdfjs-dist 提取文本

import type { TextItem } from 'pdfjs-dist/types/src/display/api';

interface RawQuestion {
  index: number;
  rawText: string;
}

interface ParsedQuestionLocal {
  question_number: number;
  question_text: string;
  options: { label: string; text: string }[];
  correct_answer: string;
  domain: number;
  base_explanation: string;
  keywords: string[];
}

export interface PDFExtractResult {
  totalPages: number;
  totalTextLength: number;
  rawQuestions: RawQuestion[];
  locallyParsed: ParsedQuestionLocal[];
  unparsedQuestions: RawQuestion[];
}

/**
 * 在浏览器中解析 PDF 文件并提取题目
 */
export async function extractQuestionsFromPDF(
  file: File,
  onProgress?: (msg: string) => void
): Promise<PDFExtractResult> {
  onProgress?.('正在加载 PDF 解析引擎...');

  // 动态导入 pdfjs-dist（仅在浏览器端）
  const pdfjsLib = await import('pdfjs-dist');

  // 设置 worker（使用 CDN）
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  onProgress?.('正在读取 PDF 文件...');

  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const doc = await pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
  }).promise;

  const totalPages = doc.numPages;
  onProgress?.(`PDF 共 ${totalPages} 页，正在提取文本...`);

  // 逐页提取文本
  let fullText = '';
  for (let i = 1; i <= totalPages; i++) {
    if (i % 50 === 0 || i === totalPages) {
      onProgress?.(`正在提取文本 (${i}/${totalPages} 页)...`);
    }

    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();

    // 正确拼接文本：不在 item 之间加空格，让 PDF 自己的空格 item 生效
    const pageText = textContent.items
      .map((item) => {
        const textItem = item as TextItem;
        if (textItem.hasEOL) return textItem.str + '\n';
        return textItem.str;
      })
      .join('');

    fullText += pageText + '\n';
  }

  onProgress?.('正在拆分题目...');

  const totalTextLength = fullText.length;

  // 使用正则拆分题目
  const rawQuestions = splitIntoQuestions(fullText);

  onProgress?.(`找到 ${rawQuestions.length} 道题目，正在本地解析...`);

  // 尝试本地正则解析（无需 AI）
  const locallyParsed: ParsedQuestionLocal[] = [];
  const unparsedQuestions: RawQuestion[] = [];

  for (const rq of rawQuestions) {
    const parsed = tryParseQuestionLocally(rq);
    if (parsed) {
      locallyParsed.push(parsed);
    } else {
      unparsedQuestions.push(rq);
    }
  }

  onProgress?.(
    `本地解析成功 ${locallyParsed.length} 题，${unparsedQuestions.length} 题需要 AI 辅助`
  );

  return {
    totalPages,
    totalTextLength,
    rawQuestions,
    locallyParsed,
    unparsedQuestions,
  };
}

/**
 * 使用正则表达式拆分题目
 */
function splitIntoQuestions(text: string): RawQuestion[] {
  // 匹配 "Question #N Topic X" 格式
  const pattern = /(?:^|\n)\s*Question\s+#?(\d+)\s+Topic\s+\d+/gim;

  const matches: Array<{ index: number; position: number }> = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    matches.push({
      index: parseInt(match[1]),
      position: match.index,
    });
  }

  if (matches.length === 0) {
    // 尝试其他格式
    const altPatterns = [
      /(?:^|\n)\s*Question\s+(\d+)\s*[.:\-)\s]/gim,
      /(?:^|\n)\s*Q(\d+)\s*[.:\-)\s]/gim,
      /(?:^|\n)\s*(\d+)\.\s+(?:Which|What|How|When|Where|Who|Why|An?\s|The\s|In\s)/gm,
    ];

    for (const altPattern of altPatterns) {
      while ((match = altPattern.exec(text)) !== null) {
        matches.push({
          index: parseInt(match[1]),
          position: match.index,
        });
      }
      if (matches.length > 0) break;
    }
  }

  if (matches.length === 0) return [];

  // 按位置排序
  matches.sort((a, b) => a.position - b.position);

  // 去重（按题号）
  const seen = new Set<number>();
  const uniqueMatches = matches.filter((m) => {
    if (seen.has(m.index)) return false;
    seen.add(m.index);
    return true;
  });

  // 提取每道题的原始文本
  const questions: RawQuestion[] = [];
  for (let i = 0; i < uniqueMatches.length; i++) {
    const start = uniqueMatches[i].position;
    const end =
      i + 1 < uniqueMatches.length
        ? uniqueMatches[i + 1].position
        : text.length;
    const rawText = text.substring(start, end).trim();

    if (rawText.length > 30) {
      questions.push({
        index: uniqueMatches[i].index,
        rawText,
      });
    }
  }

  return questions;
}

/**
 * 尝试在本地解析单道题目（不依赖 AI）
 * 对于格式规范的题目直接提取，省去 AI 调用开销
 */
function tryParseQuestionLocally(rq: RawQuestion): ParsedQuestionLocal | null {
  const text = rq.rawText;

  // 提取题干：从题目头之后到第一个选项之前
  const headerMatch = text.match(
    /Question\s+#?\d+\s+(?:Topic\s+\d+\s*)?/i
  );
  if (!headerMatch) return null;

  const afterHeader = text.substring(
    headerMatch.index! + headerMatch[0].length
  );

  // 提取选项 A-D 和答案
  // 匹配格式: A. text / B. text / C. text / D. text
  const optionRegex =
    /\n\s*([A-D])\.\s+([\s\S]*?)(?=\n\s*[A-D]\.\s|\n\s*Answer\s*:|$)/gi;
  const options: { label: string; text: string }[] = [];
  let optMatch;
  while ((optMatch = optionRegex.exec(afterHeader)) !== null) {
    options.push({
      label: optMatch[1].toUpperCase(),
      text: optMatch[2].replace(/\n/g, ' ').trim(),
    });
  }

  if (options.length < 2) return null;

  // 提取正确答案
  const answerMatch = afterHeader.match(/Answer\s*:\s*([A-D])/i);
  if (!answerMatch) return null;

  // 提取题干（从 header 结束到第一个选项之前）
  const firstOptionPos = afterHeader.search(/\n\s*[A-D]\.\s/i);
  if (firstOptionPos === -1) return null;

  const questionText = afterHeader
    .substring(0, firstOptionPos)
    .replace(/\n/g, ' ')
    .trim();

  if (!questionText) return null;

  // 提取关键词（题眼）
  const keywordPatterns = [
    'MOST',
    'LEAST',
    'FIRST',
    'PRIMARY',
    'BEST',
    'NOT',
    'EXCEPT',
    'INITIAL',
    'GREATEST',
    'MAIN',
    'MAJOR',
    'KEY',
  ];
  const keywords = keywordPatterns.filter((kw) =>
    new RegExp(`\\b${kw}\\b`).test(questionText)
  );

  // 推断 Domain（基于关键词的简单启发式）
  const domain = guessDomain(questionText + ' ' + options.map((o) => o.text).join(' '));

  return {
    question_number: rq.index,
    question_text: questionText,
    options,
    correct_answer: answerMatch[1].toUpperCase(),
    domain,
    base_explanation: '', // 本地解析无法提供解释，留空给 AI 后续补充
    keywords,
  };
}

/**
 * 基于关键词启发式推断 CISSP Domain
 */
function guessDomain(text: string): number {
  const lower = text.toLowerCase();

  const domainKeywords: Record<number, string[]> = {
    1: [
      'risk management', 'risk assessment', 'governance', 'compliance',
      'policy', 'business continuity', 'bcp', 'drp', 'disaster recovery',
      'bia', 'business impact', 'legal', 'regulatory', 'ethics',
      'professional ethics', 'security governance', 'awareness training',
      'due diligence', 'due care', 'liability', 'privacy',
      'intellectual property', 'copyright', 'patent', 'trademark',
    ],
    2: [
      'asset', 'classification', 'data owner', 'data custodian',
      'data retention', 'data remanence', 'sanitization', 'labeling',
      'handling', 'privacy', 'pii', 'gdpr', 'data lifecycle',
    ],
    3: [
      'cryptography', 'encryption', 'cipher', 'hash', 'digital signature',
      'pki', 'certificate', 'ssl', 'tls', 'aes', 'rsa', 'des',
      'security model', 'bell-lapadula', 'biba', 'clark-wilson',
      'trusted computing', 'tpm', 'side channel', 'covert channel',
      'security architecture', 'defense in depth', 'sandbox',
    ],
    4: [
      'network', 'firewall', 'vpn', 'ipsec', 'tcp', 'udp', 'dns',
      'routing', 'switching', 'vlan', 'osi model', 'protocol',
      'wireless', 'wifi', 'bluetooth', 'cdma', 'gsm', 'voip',
      'ids', 'ips', 'intrusion detection', 'intrusion prevention',
      'proxy', 'nat', 'port', 'packet',
    ],
    5: [
      'identity', 'authentication', 'authorization', 'access control',
      'rbac', 'abac', 'mac', 'dac', 'sso', 'single sign-on',
      'multifactor', 'mfa', 'biometric', 'kerberos', 'ldap',
      'oauth', 'saml', 'federation', 'provisioning', 'idaas',
      'password', 'credential',
    ],
    6: [
      'audit', 'assessment', 'testing', 'vulnerability scan',
      'penetration test', 'pen test', 'security assessment',
      'log review', 'code review', 'soc report', 'soc 2',
      'compliance testing', 'security metrics', 'kpi', 'kri',
    ],
    7: [
      'incident', 'incident response', 'forensic', 'investigation',
      'evidence', 'chain of custody', 'monitoring', 'siem',
      'patch management', 'change management', 'configuration management',
      'backup', 'recovery', 'redundancy', 'high availability',
      'physical security', 'cctv', 'guard', 'mantrap', 'bollard',
      'fire suppression', 'hvac', 'ups', 'generator',
    ],
    8: [
      'sdlc', 'software development', 'agile', 'waterfall',
      'devops', 'devsecops', 'code review', 'static analysis',
      'dynamic analysis', 'sql injection', 'xss', 'csrf',
      'buffer overflow', 'race condition', 'api security',
      'database security', 'orm', 'object-relational',
      'malware', 'virus', 'worm', 'trojan', 'ransomware',
    ],
  };

  let bestDomain = 1;
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestDomain = parseInt(domain);
    }
  }

  return bestDomain;
}
