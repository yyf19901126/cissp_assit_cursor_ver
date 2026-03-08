import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST /api/import/upload
// 上传 PDF 文件，提取文本并拆分成题目段落
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '请上传 PDF 文件' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: '仅支持 PDF 文件' }, { status: 400 });
    }

    // 获取文件 buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 导入 pdf-parse
    const pdfParseModule = await import('pdf-parse');
    // pdf-parse v2 没有 default export，整个模块就是函数
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;

    // 解析 PDF
    let pdfData: any;
    try {
      // pdf-parse 可能是函数本身，也可能包在对象中
      if (typeof pdfParse === 'function') {
        pdfData = await pdfParse(buffer);
      } else if (typeof pdfParse.default === 'function') {
        pdfData = await pdfParse.default(buffer);
      } else {
        // 尝试直接调用模块
        const fn = Object.values(pdfParseModule).find((v) => typeof v === 'function') as any;
        if (fn) {
          pdfData = await fn(buffer);
        } else {
          return NextResponse.json({ error: 'PDF 解析库加载异常' }, { status: 500 });
        }
      }
    } catch (parseErr: any) {
      return NextResponse.json({ error: `PDF 解析失败: ${parseErr.message}` }, { status: 500 });
    }
    const text = pdfData.text;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'PDF 内容为空或无法提取文本' }, { status: 400 });
    }

    // 拆分成题目段落
    const rawQuestions = splitIntoQuestions(text);

    if (rawQuestions.length === 0) {
      // 如果正则无法识别题目格式，返回整个文本让 AI 处理
      return NextResponse.json({
        total_questions: 0,
        raw_text: text.substring(0, 200000), // 限制大小
        raw_questions: [],
        message: '未能自动识别题目格式，将使用 AI 智能解析全文',
        pages: pdfData.numpages,
        text_length: text.length,
      });
    }

    return NextResponse.json({
      total_questions: rawQuestions.length,
      raw_questions: rawQuestions,
      raw_text: null,
      message: `成功识别 ${rawQuestions.length} 道题目`,
      pages: pdfData.numpages,
      text_length: text.length,
    });
  } catch (error: any) {
    console.error('PDF Upload Error:', error);
    return NextResponse.json({ error: `PDF 解析失败: ${error.message}` }, { status: 500 });
  }
}

interface RawQuestion {
  index: number;
  rawText: string;
}

function splitIntoQuestions(text: string): RawQuestion[] {
  // 尝试多种题目格式
  const patterns = [
    // Question 1: / Question 1. / Question 1 -
    /(?:^|\n)\s*Question\s+(\d+)\s*[.:\-)\s]/gmi,
    // Q1. / Q1:
    /(?:^|\n)\s*Q(\d+)\s*[.:\-)\s]/gmi,
    // 纯数字格式: 1. / 1) （需要后面跟文字内容）
    /(?:^|\n)\s*(\d+)\.\s+[A-Z]/gm,
    /(?:^|\n)\s*(\d+)\)\s+[A-Z]/gm,
  ];

  let allMatches: Array<{ index: number; position: number; patternIdx: number }> = [];

  for (let pIdx = 0; pIdx < patterns.length; pIdx++) {
    const pattern = patterns[pIdx];
    let match;
    while ((match = pattern.exec(text)) !== null) {
      allMatches.push({
        index: parseInt(match[1]),
        position: match.index,
        patternIdx: pIdx,
      });
    }
  }

  if (allMatches.length === 0) return [];

  // 如果多个模式都匹配了，选择匹配数量最多的模式
  const patternCounts: Record<number, number> = {};
  for (const m of allMatches) {
    patternCounts[m.patternIdx] = (patternCounts[m.patternIdx] || 0) + 1;
  }
  const bestPattern = Object.entries(patternCounts).sort(
    ([, a], [, b]) => b - a
  )[0][0];
  allMatches = allMatches.filter((m) => m.patternIdx === parseInt(bestPattern));

  // 按位置排序
  allMatches.sort((a, b) => a.position - b.position);

  // 去重（按题号）
  const seen = new Set<number>();
  const uniqueMatches = allMatches.filter((m) => {
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

    // 过滤过短的段落（可能是误匹配）
    if (rawText.length > 30) {
      questions.push({
        index: uniqueMatches[i].index,
        rawText,
      });
    }
  }

  return questions;
}
