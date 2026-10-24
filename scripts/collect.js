#!/usr/bin/env node
/**
 * collect.js — Hexo 消费端 v2（元数据驱动，见 ob-content 90-OB工程管理/方案/04-发布工作手册）
 * 全库 find 所有 md → 按元数据过滤 → 转换 → 落位 → 生成「源路径 ↔ 短链」映射页
 * 放行条件：published === true 且 status === 'published'（与目录无关）
 * 短链算法与 hexo-abbrlink 一致：crc32(title) >>> 0（dec）
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const crc32 = require('hexo-abbrlink/lib/crc32');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = process.env.CONTENT_DIR || path.join(ROOT, 'content');
const OUT_POSTS = path.join(ROOT, 'source', '_posts');
const OUT_ASSETS = path.join(ROOT, 'source', 'assets');
const SKIP_DIRS = new Set(['.git', '.obsidian', '.workbuddy', '.github', '.vscode', 'node_modules']);
const ASSET_DIRS = ['60-资源'];

function* walk(dir, filterFn) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) yield* walk(p, filterFn);
    else if (!filterFn || filterFn(f.name)) yield p;
  }
}

const report = { scanned: 0, published: [], skipped: [], assetsCopied: 0, map: [] };

fs.rmSync(OUT_POSTS, { recursive: true, force: true });
fs.mkdirSync(OUT_POSTS, { recursive: true });
fs.rmSync(OUT_ASSETS, { recursive: true, force: true });
fs.mkdirSync(OUT_ASSETS, { recursive: true });

// 复制资源文件（60-资源 下的所有非 md 文件 → source/assets/，保留相对结构）
for (const d of ASSET_DIRS) {
  for (const full of walk(path.join(CONTENT_DIR, d), (n) => !n.toLowerCase().endsWith('.md'))) {
    const rel = path.relative(path.join(CONTENT_DIR, d), full);
    const dest = path.join(OUT_ASSETS, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(full, dest);
    report.assetsCopied++;
  }
}

// 全库扫描 md
const usedNames = new Set();
for (const full of walk(CONTENT_DIR, (n) => n.toLowerCase().endsWith('.md'))) {
  report.scanned++;
  const rel = path.relative(CONTENT_DIR, full).split(path.sep).join('/');
  const raw = fs.readFileSync(full, 'utf8');
  let fm, body;
  try {
    ({ data: fm, content: body } = matter(raw));
  } catch (e) {
    report.skipped.push({ file: rel, reason: 'frontmatter 解析失败: ' + e.message });
    continue;
  }
  if (fm.published !== true) { report.skipped.push({ file: rel, reason: 'published !== true' }); continue; }
  if (fm.status !== 'published') { report.skipped.push({ file: rel, reason: 'status !== published' }); continue; }
  if (!Array.isArray(fm.tags) || fm.tags.length < 2) { report.skipped.push({ file: rel, reason: 'tags 少于 2 个' }); continue; }
  if (!fm.description) { report.skipped.push({ file: rel, reason: '缺少 description' }); continue; }
  if (/\{\{/.test(body) || /TODO:/.test(body)) { report.skipped.push({ file: rel, reason: '含占位符/TODO' }); continue; }

  // OB 专有语法兜底清理
  body = body.replace(/!\[\[([^\]]+)\]\]/g, '> [!warning] 未转换的 Obsidian 嵌入: $1');
  body = body.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  body = body.replace(/\[\[([^\]]+)\]\]/g, '$1');

  let name = path.basename(rel).replace(/\.md$/i, '');
  if (usedNames.has(name)) name = path.dirname(rel).split(path.sep).join('-') + '-' + name;
  usedNames.add(name);

  const outFm = {};
  for (const k of ['title', 'date', 'updated', 'tags', 'categories', 'description', 'cover']) {
    if (fm[k] !== undefined && fm[k] !== null) outFm[k] = fm[k];
  }
  if (outFm.title === undefined) outFm.title = name;
  fs.writeFileSync(path.join(OUT_POSTS, name + '.md'), matter.stringify(body, outFm));

  // 与 hexo-abbrlink 相同的短链算法
  const abbrlink = crc32.str(String(outFm.title)) >>> 0;
  report.published.push(rel);
  report.map.push({ rel, title: String(outFm.title), url: `posts/${abbrlink}.html` });
}

// 生成短链映射页（随站点发布）
if (report.map.length) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = report.map
    .map((m) => `| \`${m.rel}\` | ${m.title} | [${m.url.replace('posts/', '')}](/${m.url}) |`)
    .join('\n');
  const mapBody = `本页由流水线 collect.js 自动生成，收录全部已发布文档的源路径与短链对照。改标题会改变短链，正式发布后请勿修改 title。

## 映射表（${report.map.length} 篇）

| 源文档（ob-content 相对路径） | 标题 | 短链 |
|---|---|---|
${rows}
`;
  const mapFm = {
    title: '文章短链映射',
    date: today,
    updated: today,
    tags: ['流水线', '映射'],
    categories: ['工程实践'],
    description: '全部已发布文档的源路径与 abbrlink 短链对照表，由流水线自动生成。',
  };
  fs.writeFileSync(path.join(OUT_POSTS, 'post-map.md'), matter.stringify(mapBody, mapFm));
}

console.log(JSON.stringify(report, null, 2));
console.log('collect done: ' + report.published.length + ' published / ' + report.scanned + ' scanned / map ' + report.map.length);
