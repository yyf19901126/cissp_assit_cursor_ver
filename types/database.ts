// CISSP 8 大知识域
export const CISSP_DOMAINS = [
  { id: 1, name: 'Security and Risk Management', nameZh: '安全与风险管理' },
  { id: 2, name: 'Asset Security', nameZh: '资产安全' },
  { id: 3, name: 'Security Architecture and Engineering', nameZh: '安全架构与工程' },
  { id: 4, name: 'Communication and Network Security', nameZh: '通信与网络安全' },
  { id: 5, name: 'Identity and Access Management (IAM)', nameZh: '身份与访问管理' },
  { id: 6, name: 'Security Assessment and Testing', nameZh: '安全评估与测试' },
  { id: 7, name: 'Security Operations', nameZh: '安全运营' },
  { id: 8, name: 'Software Development Security', nameZh: '软件开发安全' },
] as const;

export type DomainId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// 题目选项
export interface QuestionOption {
  label: string; // A, B, C, D
  text: string;
}

// 题库表
export interface Question {
  id: string;
  question_number: number;
  domain: DomainId;
  question_text: string;
  options: QuestionOption[];
  correct_answer: string; // A, B, C, D
  base_explanation: string;
  keywords: string[]; // 题眼高亮词
  /** false 时不出现在任何练习模式，仍保留在库中 */
  is_available?: boolean;
  created_at: string;
}

// 用户答题记录表
export interface UserProgress {
  id: string;
  user_id: string;
  question_id: string;
  user_answer: string;
  is_correct: boolean;
  time_spent: number; // 秒
  mode: 'practice' | 'exam';
  created_at: string;
}

// 错题本视图
export interface WrongQuestion {
  id: string;
  user_id: string;
  question_id: string;
  question: Question;
  user_answer: string;
  attempt_count: number;
  last_attempt_at: string;
  is_mastered: boolean; // 再次答对后标记为已掌握
}

// AI 解析结果
export interface AIExplanation {
  ai_answer?: string;
  quick_takeaway?: string;
  option_briefs?: Array<{
    option: string;
    verdict: 'correct' | 'incorrect';
    reason: string;
  }>;
  cissp_knowledge_point?: string;
  deep_analysis?: string; // 兼容旧数据
  domain_mapping?: {
    domain_id: DomainId;
    domain_name: string;
    sub_topic: string;
  };
  cbk_reference?: string; // 兼容旧数据
  manager_perspective?: string; // 兼容旧数据
  key_highlights?: string[]; // 题眼关键词
  correct_reasoning?: string; // 兼容旧数据
  wrong_reasoning?: string; // 兼容旧数据
}

// 域掌握进度
export interface DomainProgress {
  domain_id: DomainId;
  domain_name: string;
  domain_name_zh: string;
  total_questions: number;
  answered_questions: number;
  correct_count: number;
  accuracy: number; // 百分比
}

// 考试会话
export interface ExamSession {
  id: string;
  user_id: string;
  mode: 'practice' | 'exam';
  total_questions: number;
  current_index: number;
  question_ids: string[];
  answers: Record<string, string>;
  start_time: string;
  end_time?: string;
  time_limit?: number; // 分钟
}

// Quiz 状态
export interface QuizState {
  session: ExamSession;
  currentQuestion: Question | null;
  selectedAnswer: string | null;
  showExplanation: boolean;
  isSubmitted: boolean;
  timeRemaining?: number;
}

// PDF 解析进度
export interface ParseProgress {
  total: number;
  parsed: number;
  failed: number;
  lastProcessedIndex: number;
  status: 'idle' | 'parsing' | 'completed' | 'error';
  errors: Array<{ index: number; error: string }>;
}

// 知识库来源
export interface KnowledgeSource {
  id: string;
  source_name: string;
  source_version: string;
  file_name: string;
  file_sha256: string;
  page_count: number;
  uploaded_by?: string | null;
  uploaded_at: string;
}

// CISSP 术语知识库
export interface KnowledgeTerm {
  id: string;
  term_name: string;
  term_key: string;
  official_definition: string;
  domain_number: DomainId;
  concept_logic: string;
  aka_synonyms: string[];
  process_step: string;
  confusion_points: string;
  is_new_topic: boolean;
  mastery_level: 0 | 1 | 2 | 3 | 4 | 5;
  source_id?: string | null;
  created_at: string;
  updated_at: string;
}
