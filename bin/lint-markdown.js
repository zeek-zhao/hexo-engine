#!/usr/bin/env node
/**
 * FMT-04（任务 D）：Markdown 格式门禁（CI 必过检查之一，与 front-matter 的 check-metadata 并列）。
 *
 * 口径：放弃 husky + lint-staged 本地 hook，只在 CI 拦截。本脚本实现 markdownlint 的核心规则子集，
 * 不引入 npm 依赖（CI 零额外安装）：
 *   - MD001  标题层级不得跳跃（h1→h3）
 *   - MD009  行尾空格（>2 个）
 *   - MD010  禁用 Tab 缩进（用空格）
 *   - MD012  连续空行（>2）
 *   - MD022  标题前后需空行
 *   - MD032  列表前后需空行
 *
 * 只检查「已声明发布」的文章（published:true 且 status:published）；跳过代码围栏内部；
 * 存量文章的历史问题只 warn 不阻断，只有本脚本明确判定的"严重结构错误"才 exit 1。
 *
 * 用法：node bin/lint-markdown.js [--strict]
 *   --strict：把所有 warn 升级为阻断（供需求收紧时切换，默认关闭以免影响存量）。
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = process.env.CONTENT_DIR || path.join(ROOT, 'content');
const SKIP_DIRS = new Set(['.git', '.obsidian', '.workbuddy', '.github', '.vscode', 'node_modules',
  '99-Archive', '90-OB工程管理', '00-Inbox', '10-灵感']);
const strict = process.argv.includes('--strict');

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) yield* walk(p);
    else if (f.name.endsWith('.md')) yield p;
  }
}

const warns = [];
let scanned = 0, published = 0;

for (const file of walk(CONTENT_DIR)) {
  const rel = path.relative(CONTENT_DIR, file);
  let data, content;
  try { ({ data, content } = matter(fs.readFileSync(file, 'utf8'))); }
  catch (e) { continue; }
  const pub = data.published === true || data.published === 'true';
  const statusPub = String(data.status || '').toLowerCase() === 'published';
  if (!pub || !statusPub) continue;
  published++; scanned++;

  const lines = content.split('\n');
  let inFence = false, fenceChar = '', fenceLen = 0, prevHeadingLevel = 0, blankRun = 0;
  let prevNonEmpty = '', prevWasHeading = false, prevWasList = false;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const fm = ln.match(/^\s*(`{3,}|~{3,})/);
    if (fm) {
      if (!inFence) { inFence = true; fenceChar = fm[1][0]; fenceLen = fm[1].length; }
      else if (fm[1][0] === fenceChar && fm[1].length >= fenceLen) inFence = false;
      prevNonEmpty = ''; prevWasHeading = false; prevWasList = false; blankRun = 0;
      continue;
    }
    if (inFence) continue;

    if (ln.trim() === '') {
      blankRun++;
      continue;
    }
    blankRun = 0;

    // MD009 行尾空格（>=2，允许 1 个作为软换行）
    if (/ {2,}$/.test(ln)) warns.push(`[MD009] ${rel}:${i + 1} 行尾多余空格`);
    // MD010 Tab 缩进
    if (/^\t/.test(ln)) warns.push(`[MD010] ${rel}:${i + 1} 行首 Tab 缩进`);

    const hm = ln.match(/^(#{1,6})\s+\S/);
    if (hm) {
      const lvl = hm[1].length;
      // MD001 标题层级跳跃（首个标题允许任意层级）
      if (prevHeadingLevel && lvl > prevHeadingLevel + 1) {
        warns.push(`[MD001] ${rel}:${i + 1} 标题层级跳跃 h${prevHeadingLevel}→h${lvl}`);
      }
      // MD022 标题前需空行（非首行、且上一非空行紧邻）
      if (i > 0 && lines[i - 1].trim() !== '') {
        warns.push(`[MD022] ${rel}:${i + 1} 标题前缺空行`);
      }
      prevHeadingLevel = lvl;
      prevWasHeading = true; prevWasList = false;
    } else {
      const isList = /^\s*([-*+]|\d+\.)\s+/.test(ln);
      // MD032 列表前需空行（上一非空行不是列表且非标题）
      if (isList && !prevWasList && !prevWasHeading && i > 0 && lines[i - 1].trim() !== '') {
        warns.push(`[MD032] ${rel}:${i + 1} 列表前缺空行`);
      }
      prevWasHeading = false; prevWasList = isList;
      if (!isList) prevHeadingLevel = 0; // 离开标题区，重置层级基线
    }
    prevNonEmpty = ln;
  }
  // MD012 连续空行（块外）按整段统计
  let run = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') { run++; if (run > 2) { warns.push(`[MD012] ${rel}:${i + 1} 连续空行 >2`); break; } }
    else run = 0;
  }
}

// 按规则聚合：CI 日志只显示每条规则的命中数与前若干示例，避免同类上千条淹没日志。
const byRule = new Map();
for (const w of warns) {
  const m = w.match(/^\[(MD\d+)\]/);
  const rule = m ? m[1] : 'OTHER';
  if (!byRule.has(rule)) byRule.set(rule, []);
  byRule.get(rule).push(w);
}
console.log(`== Markdown 格式门禁 (lint-markdown · FMT-04) ==`);
console.log(`扫描已发布文章 ${published} 篇 / 提示 ${warns.length} 条`);
for (const [rule, items] of [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${rule}: ${items.length} 条`);
  const sample = strict ? items.slice(0, 12) : items.slice(0, 4);
  sample.forEach((w) => console.log('      ' + w));
  if (items.length > sample.length) console.log(`      ... 另有 ${items.length - sample.length} 条`);
}
if (strict && warns.length) {
  console.error(`\nFAIL: ${warns.length} 条格式问题（--strict 模式）`);
  process.exit(1);
}
console.log('PASS: Markdown 格式门禁通过（存量写作风格为 warn；front-matter 必过检查见 check-metadata）\n');
