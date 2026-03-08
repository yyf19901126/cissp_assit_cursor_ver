/**
 * CISSP PDF 题目解析脚本
 * 
 * 功能：
 * 1. 读取本地 PDF 文件
 * 2. 使用正则表达式定位题目边界
 * 3. 分块调用 AI（每次50题）提取 JSON
 * 4. 断点续传 - 每批次存盘，防止网络中断
 * 5. 批量写入 Supabase
 * 
 * 用法：npx ts-node --esm scripts/parse-pdf.ts ./path/to/cissp.pdf
 */

import fs from 'fs';
import path from 'path';
import * as pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// ============================================
// 配置
// ============================================
const BATCH_SIZE = 50; // 每批处理题数
const CHECKPOINT_DIR = './scripts/.checkpoints';
const CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, 'parse-progress.json');

// 初始化客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// ============================================
// 类型
// ============================================
interface RawQuestion {
  index: number;
  rawText: string;
}

interface ParsedQuestion {
  question_number: number;
  domain: number;
  question_text: string;
  options: Array<{ label: string; text: string }>;
  correct_answer: string;
  base_explanation: string;
  keywords: string[];
}

interface CheckpointData {
  total: number;
  lastProcessedBatch: number;
  parsedQuestions: ParsedQuestion[];
  errors: Array<{ batchIndex: number; error: string }>;
}

// ============================================
// Step 1: PDF → 文本
// ============================================
async function extractTextFromPDF(filePath: string): Promise<string> {
  console.log(`📄 正在读取 PDF: ${filePath}`);
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  console.log(`✅ PDF 读取完成，共 ${data.numpages} 页，${data.text.length} 字符`);
  return data.text;
}

// ============================================
// Step 2: 文本 → 按题目拆分
// ============================================
function splitIntoQuestions(text: string): RawQuestion[] {
  // 匹配常见的题目格式：Question 1, Q1, 1., 1) 等
  const patterns = [
    /(?:Question\s+)(\d+)[.:\s]/gi,
    /(?:^|\n)\s*(\d+)\.\s+/gm,
    /(?:^|\n)\s*(\d+)\)\s+/gm,
  ];

  let splitPoints: Array<{ index: number; position: number }> = [];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      splitPoints.push({
        index: parseInt(match[1]),
        position: match.index,
      });
    }
  }

  // 按位置排序
  splitPoints.sort((a, b) => a.position - b.position);

  // 去重（按题号去重，保留第一个出现的位置）
  const seen = new Set<number>();
  splitPoints = splitPoints.filter((sp) => {
    if (seen.has(sp.index)) return false;
    seen.add(sp.index);
    return true;
  });

  // 提取每道题的文本
  const questions: RawQuestion[] = [];
  for (let i = 0; i < splitPoints.length; i++) {
    const start = splitPoints[i].position;
    const end = i + 1 < splitPoints.length ? splitPoints[i + 1].position : text.length;
    questions.push({
      index: splitPoints[i].index,
      rawText: text.substring(start, end).trim(),
    });
  }

  console.log(`🔍 共识别 ${questions.length} 道题目`);
  return questions;
}

// ============================================
// Step 3: AI 结构化提取（单批次）
// ============================================
async function parseQuestionBatch(
  questions: RawQuestion[],
  batchIndex: number
): Promise<ParsedQuestion[]> {
  const questionsText = questions
    .map((q) => `--- Question ${q.index} ---\n${q.rawText}`)
    .join('\n\n');

  const systemPrompt = `You are a CISSP exam question parser. Extract structured data from raw question text.

For each question, identify:
1. question_number: The question number
2. domain: The CISSP domain (1-8) this question belongs to:
   - 1: Security and Risk Management
   - 2: Asset Security
   - 3: Security Architecture and Engineering
   - 4: Communication and Network Security
   - 5: Identity and Access Management (IAM)
   - 6: Security Assessment and Testing
   - 7: Security Operations
   - 8: Software Development Security
3. question_text: The question stem
4. options: Array of {label, text} for each option (A, B, C, D)
5. correct_answer: The correct option letter (A, B, C, or D)
6. base_explanation: The explanation for the correct answer
7. keywords: Array of key terms/phrases that are "题眼" (critical terms like MOST, LEAST, FIRST, PRIMARY, BEST, etc.)

Return valid JSON array of objects.`;

  try {
    console.log(`  🤖 正在 AI 解析第 ${batchIndex + 1} 批 (${questions.length} 题)...`);

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Parse the following CISSP questions into structured JSON:\n\n${questionsText}`,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    // 处理不同的 JSON 返回格式
    const questionsArray: ParsedQuestion[] = Array.isArray(parsed)
      ? parsed
      : parsed.questions || parsed.data || [];

    console.log(`  ✅ 第 ${batchIndex + 1} 批解析完成: ${questionsArray.length} 题`);
    return questionsArray;
  } catch (error: any) {
    console.error(`  ❌ 第 ${batchIndex + 1} 批解析失败: ${error.message}`);
    throw error;
  }
}

// ============================================
// Step 4: 断点续传
// ============================================
function loadCheckpoint(): CheckpointData | null {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
      console.log(`📌 发现断点: 已完成 ${data.lastProcessedBatch + 1} 批次`);
      return data;
    }
  } catch {
    console.log('⚠️ 断点文件损坏，从头开始');
  }
  return null;
}

function saveCheckpoint(data: CheckpointData): void {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
  console.log(`💾 断点已保存 (批次 ${data.lastProcessedBatch + 1})`);
}

// ============================================
// Step 5: 写入 Supabase
// ============================================
async function writeToSupabase(questions: ParsedQuestion[]): Promise<void> {
  console.log(`\n📤 正在写入 ${questions.length} 道题到 Supabase...`);

  // 分批插入，每次 100 条
  const insertBatchSize = 100;
  for (let i = 0; i < questions.length; i += insertBatchSize) {
    const batch = questions.slice(i, i + insertBatchSize);
    const rows = batch.map((q) => ({
      question_number: q.question_number,
      domain: q.domain,
      question_text: q.question_text,
      options: q.options,
      correct_answer: q.correct_answer,
      base_explanation: q.base_explanation || '',
      keywords: q.keywords || [],
    }));

    const { error } = await supabase
      .from('questions')
      .upsert(rows, { onConflict: 'question_number' });

    if (error) {
      console.error(`❌ 写入失败 (第 ${i + 1}-${i + batch.length} 题):`, error.message);
    } else {
      console.log(`  ✅ 已写入第 ${i + 1}-${i + batch.length} 题`);
    }
  }

  console.log(`🎉 全部写入完成！`);
}

// ============================================
// 主流程
// ============================================
async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error('❌ 请提供 PDF 文件路径');
    console.error('用法: npx ts-node scripts/parse-pdf.ts ./path/to/cissp.pdf');
    process.exit(1);
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ 文件不存在: ${pdfPath}`);
    process.exit(1);
  }

  console.log('='.repeat(50));
  console.log('🚀 CISSP PDF 解析器启动');
  console.log('='.repeat(50));

  // 1) 提取文本
  const text = await extractTextFromPDF(pdfPath);

  // 2) 拆分题目
  const rawQuestions = splitIntoQuestions(text);
  if (rawQuestions.length === 0) {
    console.error('❌ 未识别到任何题目，请检查 PDF 格式');
    process.exit(1);
  }

  // 3) 加载断点
  let checkpoint = loadCheckpoint();
  const startBatch = checkpoint ? checkpoint.lastProcessedBatch + 1 : 0;
  const allParsed: ParsedQuestion[] = checkpoint?.parsedQuestions || [];
  const errors: Array<{ batchIndex: number; error: string }> = checkpoint?.errors || [];

  // 4) 分批 AI 解析
  const totalBatches = Math.ceil(rawQuestions.length / BATCH_SIZE);
  console.log(`\n📊 共 ${rawQuestions.length} 题，分 ${totalBatches} 批处理 (每批 ${BATCH_SIZE} 题)`);
  if (startBatch > 0) {
    console.log(`📌 从第 ${startBatch + 1} 批继续`);
  }

  for (let batchIdx = startBatch; batchIdx < totalBatches; batchIdx++) {
    const start = batchIdx * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, rawQuestions.length);
    const batch = rawQuestions.slice(start, end);

    try {
      const parsed = await parseQuestionBatch(batch, batchIdx);
      allParsed.push(...parsed);
    } catch (error: any) {
      errors.push({ batchIndex: batchIdx, error: error.message });
      console.error(`  ⚠️ 跳过第 ${batchIdx + 1} 批，继续下一批...`);
    }

    // 每批次保存断点
    saveCheckpoint({
      total: rawQuestions.length,
      lastProcessedBatch: batchIdx,
      parsedQuestions: allParsed,
      errors,
    });

    // 添加小延迟避免 API 限流
    if (batchIdx < totalBatches - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // 5) 写入数据库
  if (allParsed.length > 0) {
    await writeToSupabase(allParsed);
  }

  // 6) 报告
  console.log('\n' + '='.repeat(50));
  console.log('📋 解析报告');
  console.log('='.repeat(50));
  console.log(`总题数: ${rawQuestions.length}`);
  console.log(`成功解析: ${allParsed.length}`);
  console.log(`失败批次: ${errors.length}`);
  if (errors.length > 0) {
    console.log('失败详情:');
    errors.forEach((e) => console.log(`  批次 ${e.batchIndex + 1}: ${e.error}`));
  }

  // 清理断点文件
  if (errors.length === 0 && fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
    console.log('🧹 断点文件已清理');
  }
}

main().catch(console.error);
