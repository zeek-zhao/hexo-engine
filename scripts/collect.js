#!/usr/bin/env node
/**
 * collect.js — Hexo 消费端四步转换（见 ob-content 90-工程管理/方案/总方案 §8）
 * 识别 → 过滤 → 转换 → 落位
 * 放行条件：published === true 且 status === 'published'
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = process.env.CONTENT_DIR || path.join(ROOT, 'content');
const POSTS_DIR = path.join(CONTENT_DIR, '40-发布', '_posts');
const ASSETS_DIR = path.join(CONTENT_DIR, '40-发布', 'assets');
const OUT_POSTS = path.join(ROOT, 'source', '_posts');
const OUT_ASSETS = path.join(ROOT, 'source', 'assets');

const report = { scanned: 0, published: [], skipped: [], assetsCopied: 0 };

fs.rmSync(OUT_POSTS, { recursive: true, force: true });
fs.rmSync(OUT_ASSETS, { recursive: true, force: true });
fs.mkdirSync(OUT_POSTS, { recursive: true });
fs.mkdirSync(OUT_ASSETS, { recursive: true });

if (fs.existsSync(ASSETS_DIR)) {
  for (const f of fs.readdirSync(ASSETS_DIR)) {
    const src = path.join(ASSETS_DIR, f);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(OUT_ASSETS, f));
      report.assetsCopied++;
    }
  }
}

if (!fs.existsSync(POSTS_DIR)) {
  console.error('content posts dir missing:', POSTS_DIR);
  process.exit(1);
}

for (const f of fs.readdirSync(POSTS_DIR)) {
  if (!f.endsWith('.md')) continue;
  report.scanned++;
  const full = path.join(POSTS_DIR, f);
  const raw = fs.readFileSync(full, 'utf8');
  let fm, body;
  try {
    ({ data: fm, content: body } = matter(raw));
  } catch (e) {
    report.skipped.push({ file: f, reason: 'frontmatter 解析失败: ' + e.message });
    continue;
  }
  if (fm.published !== true) { report.skipped.push({ file: f, reason: 'published !== true' }); continue; }
  if (fm.status !== 'published') { report.skipped.push({ file: f, reason: 'status !== published' }); continue; }
  if (!Array.isArray(fm.tags) || fm.tags.length < 2) { report.skipped.push({ file: f, reason: 'tags 少于 2 个' }); continue; }
  if (!fm.description) { report.skipped.push({ file: f, reason: '缺少 description' }); continue; }
  if (/\{\{/.test(body) || /TODO:/.test(body)) { report.skipped.push({ file: f, reason: '含占位符/TODO' }); continue; }

  // OB 专有语法兜底清理
  body = body.replace(/!\[\[([^\]]+)\]\]/g, '> [!warning] 未转换的 Obsidian 嵌入: $1');
  body = body.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  body = body.replace(/\[\[([^\]]+)\]\]/g, '$1');

  const name = f.replace(/\.md$/, '');
  const outFm = {};
  for (const k of ['title', 'date', 'updated', 'tags', 'categories', 'description', 'cover']) {
    if (fm[k] !== undefined && fm[k] !== null) outFm[k] = fm[k];
  }
  if (outFm.title === undefined) outFm.title = name;
  const out = matter.stringify(body, outFm);
  fs.writeFileSync(path.join(OUT_POSTS, name + '.md'), out);
  report.published.push(f);
}

console.log(JSON.stringify(report, null, 2));
console.log('collect done: ' + report.published.length + ' published / ' + report.scanned + ' scanned');
