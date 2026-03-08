#!/usr/bin/env node
/**
 * 数据库迁移脚本 — 创建 users 表并修复外键约束
 * 
 * 使用方式:
 *   node scripts/migrate.mjs <你的数据库密码>
 * 
 * 数据库密码可在 Supabase Dashboard → Settings → Database → Database password 找到
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION_SQL = `
-- ============================================
-- 创建 users 表（用户认证系统）
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(10) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  ai_api_key TEXT DEFAULT '',
  ai_base_url TEXT DEFAULT 'https://api.openai.com/v1',
  ai_model TEXT DEFAULT 'gpt-4o',
  ai_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 确保 RLS 开启
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 修复 user_progress 外键（关联新的 users 表）
-- ============================================
ALTER TABLE user_progress DROP CONSTRAINT IF EXISTS user_progress_user_id_fkey;
ALTER TABLE user_progress 
  ADD CONSTRAINT user_progress_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ============================================
-- 修复 exam_sessions 外键（关联新的 users 表）
-- ============================================
ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS exam_sessions_user_id_fkey;
ALTER TABLE exam_sessions 
  ADD CONSTRAINT exam_sessions_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ============================================
-- 清理旧的无效数据
-- ============================================
DELETE FROM user_progress WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM exam_sessions WHERE user_id NOT IN (SELECT id FROM users);
`;

// 从 .env.local 读取环境变量
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '..', '.env.local');
    const content = readFileSync(envPath, 'utf8');
    const vars = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
      }
    }
    return vars;
  } catch {
    return {};
  }
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;

if (!SUPABASE_URL) {
  console.error('❌ 未找到 NEXT_PUBLIC_SUPABASE_URL，请检查 .env.local');
  process.exit(1);
}

const PROJECT_REF = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
const DB_PASSWORD = process.argv[2];

if (!DB_PASSWORD) {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║            CISSP 复习助手 — 数据库迁移脚本                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('使用方式:');
  console.log(`  node scripts/migrate.mjs <数据库密码>`);
  console.log('');
  console.log('数据库密码获取方式:');
  console.log('  1. 打开 https://supabase.com/dashboard');
  console.log(`  2. 选择项目 → Settings → Database`);
  console.log('  3. 复制 "Database password"');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('或者，你可以手动在 Supabase SQL Editor 中执行以下 SQL:');
  console.log(`  https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
  console.log('');
  console.log(MIGRATION_SQL);
  console.log('');
  process.exit(0);
}

// 尝试多个 Supabase 区域的 pooler 地址
const POOLER_REGIONS = [
  'aws-0-us-west-1',
  'aws-0-us-east-1',
  'aws-0-ap-southeast-1',
  'aws-0-eu-west-1',
  'aws-0-ap-northeast-1',
];

async function tryConnect(password) {
  // 先尝试直连
  const directUrl = `postgresql://postgres:${encodeURIComponent(password)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
  try {
    const client = new pg.Client({ connectionString: directUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
    await client.connect();
    return client;
  } catch (e) {
    console.log(`   直连失败 (${e.message.slice(0, 50)}...)，尝试连接池...`);
  }

  // 尝试各区域 pooler
  for (const region of POOLER_REGIONS) {
    const poolerUrl = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password)}@${region}.pooler.supabase.com:6543/postgres`;
    try {
      const client = new pg.Client({ connectionString: poolerUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
      await client.connect();
      console.log(`   通过 ${region} pooler 连接成功`);
      return client;
    } catch {
      // 继续尝试
    }
  }
  return null;
}

async function runMigration() {
  console.log('');
  console.log('🚀 开始数据库迁移...');
  console.log(`   项目: ${PROJECT_REF}`);
  console.log('');

  console.log('📡 连接数据库...');
  const client = await tryConnect(DB_PASSWORD);

  if (!client) {
    console.error('');
    console.error('❌ 无法连接数据库。请检查:');
    console.error('   1. 数据库密码是否正确');
    console.error('   2. 网络连接是否正常');
    console.error('   3. Supabase 项目是否处于活动状态');
    console.error('');
    console.error('━━━ 替代方案: 手动执行 SQL ━━━');
    console.error(`打开: https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
    console.error('粘贴以下 SQL 并点击 Run:');
    console.error('');
    console.error(MIGRATION_SQL);
    process.exit(1);
  }

  console.log('✅ 数据库连接成功');

  try {
    // 检查 users 表是否存在
    const checkResult = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      ) AS exists;
    `);
    const usersExists = checkResult.rows[0].exists;
    console.log(`   users 表: ${usersExists ? '已存在' : '不存在，需要创建'}`);

    // 运行迁移
    console.log('');
    console.log('📦 执行迁移 SQL...');
    await client.query(MIGRATION_SQL);
    console.log('✅ 迁移 SQL 执行成功！');

    // 验证
    console.log('');
    console.log('🔍 验证迁移结果...');
    
    const usersCheck = await client.query('SELECT count(*) FROM users');
    console.log(`   ✅ users 表: ${usersCheck.rows[0].count} 个用户`);

    const questionsCheck = await client.query('SELECT count(*) FROM questions');
    console.log(`   ✅ questions 表: ${questionsCheck.rows[0].count} 道题目`);

    const progressCheck = await client.query('SELECT count(*) FROM user_progress');
    console.log(`   ✅ user_progress 表: ${progressCheck.rows[0].count} 条记录`);

    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('🎉 迁移完成！现在你可以:');
    console.log('   1. 启动开发服务器: npm run dev');
    console.log('   2. 访问 http://localhost:3000');
    console.log('   3. 注册第一个账号（自动成为管理员）');
    console.log('   4. 登录后即可使用所有功能');
    console.log('═══════════════════════════════════════════════════');
    console.log('');

  } catch (err) {
    console.error('');
    console.error('❌ 迁移失败:', err.message);
    console.error('');
    console.error('━━━ 替代方案: 手动执行 SQL ━━━');
    console.error(`打开: https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
    console.error('粘贴以下 SQL 并点击 Run:');
    console.error('');
    console.error(MIGRATION_SQL);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
