#!/usr/bin/env node
/**
 * check-metadata.js — 内容库发布前门禁（2026-11 审计 CFG-04 / FMT-01 / FMT-02 / PIP-01 / PIP-02）
 *
 * 只读检查内容库中「已声明发布」（published: true 且 status: published）的文章：
 *   FMT-02  front-matter 关键字段完整性（title/date/tags/categories/description）
 *   CFG-04  abbrlink 唯一性（crc32(title)，与 collect.js / hexo-abbrlink 算法一致）——重复即 fail
 *   FMT-01  Markdown 基础格式（单 h1、围栏闭合、代码块语言标注）——只报严重项
 *   PIP-02  status=draft 的文档确认未被标记 published（构建隔离 double-check）
 *
 * 设计原则：只检查「真正要发布」的文章，不误伤草稿/工程管理内部文档；
 *           错误累积后一次性输出明细并 exit 1，供 deploy.yml 在 collect 前拦截。
 * 依赖：gray-matter、hexo-abbrlink/lib/crc32（均已在 package.json，CI 已安装）。
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const crc32 = require('hexo-abbrlink/lib/crc32');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = process.env.CONTENT_DIR || path.join(ROOT, 'content');
const SKIP_DIRS = new Set(['.git', '.obsidian', '.workbuddy', '.github', '.vscode', 'node_modules',
  '99-Archive', '90-OB工程管理', '00-Inbox', '10-灵感']);
const REQUIRED = ['title', 'date', 'tags', 'categories', 'description'];

const errors = [];
let scanned = 0, toPublish = 0, drafts = 0;
const abbrOwners = new Map(); // abbrlink -> title

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) yield* walk(p);
    else if (f.name.endsWith('.md')) yield p;
  }
}

if (!fs.existsSync(CONTENT_DIR)) {
  console.error('[check-metadata] 内容库目录不存在: ' + CONTENT_DIR);
  process.exit(1);
}

for (const file of walk(CONTENT_DIR)) {
  scanned++;
  const rel = path.relative(CONTENT_DIR, file);
  let data, content;
  try {
    ({ data, content } = matter(fs.readFileSync(file, 'utf8')));
  } catch (e) {
    errors.push(`[PARSE] ${rel}: front-matter 解析失败: ${e.message}`);
    continue;
  }
  const published = data.published === true || data.published === 'true';
  const statusPub = String(data.status || '').toLowerCase() === 'published';

  // PIP-02: status=draft 却标了 published → 矛盾，拦截
  if (String(data.status || '').toLowerCase() === 'draft' && published) {
    errors.push(`[PIP-02] ${rel}: status=draft 但 published=true，草稿不得发布`);
  }
  if (!published || !statusPub) { drafts++; continue; }
  toPublish++;

  // FMT-02: 关键字段完整性
  const missing = REQUIRED.filter((k) => data[k] === undefined || data[k] === null ||
    (Array.isArray(data[k]) && data[k].length === 0) ||
    (typeof data[k] === 'string' && !data[k].trim()));
  if (missing.length) errors.push(`[FMT-02] ${rel}: 缺字段 ${missing.join(', ')}`);
  // tags 数量 2~3（与 collect.js 放行条件一致，提前暴露）
  const tags = Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []);
  if (tags.length < 2 || tags.length > 3) console.warn(`  [warn][FMT-02] ${rel}: tags 数量=${tags.length}，应为 2~3（存量问题，见 Issue #17）`);

  // CFG-04: abbrlink = crc32(title) 唯一性
  const title = String(data.title || path.basename(file, '.md'));
  const abbr = crc32.str(title) >>> 0;
  if (abbrOwners.has(abbr)) {
    errors.push(`[CFG-04] abbrlink=${abbr} 冲突: "${abbrOwners.get(abbr)}" vs "${title}" (${rel})`);
  } else abbrOwners.set(abbr, title);

  // FMT-01: Markdown 基础格式（只查要发布的正文）
  // 剥围栏后统计 h1
  const lines = content.split('\n');
  let inFence = false, fenceChar = '';
  let h1 = 0, fenceOpen = 0, untaggedCode = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const fm = ln.match(/^\s*(`{3,}|~{3,})/);
    if (fm) {
      if (!inFence) { inFence = true; fenceChar = fm[1][0]; if (!fm[1].slice(1).match(/[a-zA-Z0-9]/)) untaggedCode++; }
      else if (fm[1][0] === fenceChar) inFence = false;
      continue;
    }
    if (!inFence && /^#\s+\S/.test(ln)) h1++;
  }
  if (inFence) console.warn(`  [warn][FMT-01] ${rel}: 代码块围栏未闭合（需人工核对是否嵌套围栏误报）`);
  if (h1 > 1) console.warn(`  [warn][DOC-01] ${rel}: 出现 ${h1} 个 h1（应仅 1 个标题，小节用 h2；存量问题见 Issue #20）`);
  // 代码块语言标注：给出警告清单但不阻断（存量文章量大，先观察）
  if (untaggedCode > 0) console.warn(`  [warn][DOC-06] ${rel}: ${untaggedCode} 个代码块未标注语言`);
}

console.log(`\n== 内容库元数据门禁 (check-metadata) ==`);
console.log(`扫描 ${scanned} 篇 / 待发布 ${toPublish} 篇 / 非发布(草稿等) ${drafts} 篇 / abbrlink ${abbrOwners.size} 个唯一`);
if (errors.length) {
  console.error(`\nFAIL: ${errors.length} 项问题\n`);
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log('PASS: 元数据/短链/草稿隔离门禁全部通过（格式类为存量 warn，见对应 Issue）\n');
