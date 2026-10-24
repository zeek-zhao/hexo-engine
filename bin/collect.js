#!/usr/bin/env node
/**
 * collect.js — Hexo 消费端 v3（元数据驱动，见 ob-content 90-OB工程管理/方案/04-发布工作手册）
 * 全库 find 所有 md → 按元数据过滤 → 转换 → 落位
 * 附带产出：① 短链映射页（sticky 置顶） ② 动态主页 source/index.html（全部文档列表+个人信息）
 * 放行条件：published === true 且 status === 'published'，tags 数量 2~3（与目录无关）
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
const OUT_INDEX = path.join(ROOT, 'source', 'index.html');
const SKIP_DIRS = new Set(['.git', '.obsidian', '.workbuddy', '.github', '.vscode', 'node_modules']);
const ASSET_DIRS = ['60-资源'];
const MAP_TITLE = '文章短链映射';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
  if (fm.tags.length > 3) { report.skipped.push({ file: rel, reason: 'tags 超过 3 个（规则：每个文档 ≤3）' }); continue; }
  if (!fm.description) { report.skipped.push({ file: rel, reason: '缺少 description' }); continue; }
  if (/\{\{/.test(body) || /TODO:/.test(body)) { report.skipped.push({ file: rel, reason: '含占位符/模板语法/TODO' }); continue; }

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
  report.map.push({
    rel,
    title: String(outFm.title),
    url: `posts/${abbrlink}.html`,
    date: fm.date ? String(fm.date).slice(0, 10) : '',
    description: String(fm.description || ''),
    categories: Array.isArray(fm.categories) ? fm.categories.join(' / ') : String(fm.categories || ''),
  });
}

// 生成短链映射页（sticky 置顶，随站点发布）
const mapAbbr = crc32.str(MAP_TITLE) >>> 0;
const mapUrl = `posts/${mapAbbr}.html`;
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
    title: MAP_TITLE,
    date: today,
    updated: today,
    tags: ['流水线', '映射'],
    categories: ['工程实践'],
    description: '全部已发布文档的源路径与 abbrlink 短链对照表，由流水线自动生成。',
    sticky: 999,
  };
  fs.writeFileSync(path.join(OUT_POSTS, 'post-map.md'), matter.stringify(mapBody, mapFm));
}

// ── 动态主页 source/index.html（编译时生成：个人信息 + 置顶映射 + 全部文档列表）──
if (report.map.length) {
  const docs = [...report.map].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const items = docs
    .map((m) => `    <li class="doc">
      <a class="doc-link" href="/${m.url}">
        <span class="doc-title">${esc(m.title)}</span>
        <span class="doc-meta">${esc(m.date)}${m.categories ? ' · ' + esc(m.categories) : ''}</span>
      </a>
      <p class="doc-desc">${esc(m.description)}</p>
    </li>`)
    .join('\n');
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zeek 的 AI 知识工程</title>
<meta name="description" content="AI 驱动的 Obsidian 知识工程 · 用 AI 跑一条内容流水线">
<style>
:root{--bg:#0d0f14;--card:#161a23;--card2:#1b202c;--text:#e8eaf0;--muted:#9aa3b5;--a1:#6C7EE1;--a2:#ec4899}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif;line-height:1.65;min-height:100vh;
background-image:radial-gradient(1000px 500px at 80% -10%,rgba(108,126,225,.12),transparent),radial-gradient(800px 400px at -10% 110%,rgba(236,72,153,.08),transparent)}
.wrap{max-width:880px;margin:0 auto;padding:48px 20px 40px}
.hero{display:flex;align-items:center;gap:22px;background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid #262c3a;border-radius:20px;padding:28px 30px}
.avatar{width:92px;height:92px;border-radius:22px;flex-shrink:0;box-shadow:0 6px 24px rgba(108,126,225,.35)}
.hero h1{font-size:1.7rem;letter-spacing:.5px}
.hero h1 .grad{background:linear-gradient(90deg,var(--a1),var(--a2));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero .desc{color:var(--muted);margin-top:4px;font-size:.98rem}
.links{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap}
.links a{color:var(--text);text-decoration:none;font-size:.9rem;padding:6px 14px;border-radius:999px;border:1px solid #2c3344;transition:.25s}
.links a:hover{border-color:var(--a1);color:#fff;background:rgba(108,126,225,.15)}
.pin{margin-top:18px}
.pin a{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--text);background:linear-gradient(90deg,rgba(108,126,225,.16),rgba(236,72,153,.10));border:1px solid rgba(108,126,225,.45);border-radius:14px;padding:14px 18px;transition:.25s}
.pin a:hover{border-color:var(--a2);transform:translateY(-1px)}
.pin-badge{background:linear-gradient(90deg,var(--a1),var(--a2));color:#fff;font-size:.78rem;font-weight:700;padding:3px 10px;border-radius:999px;flex-shrink:0}
.pin .pin-sub{color:var(--muted);font-size:.86rem;margin-left:auto}
h2.sec{margin:34px 0 14px;font-size:1.18rem;display:flex;align-items:center;gap:10px}
h2.sec:after{content:"";flex:1;height:1px;background:linear-gradient(90deg,#2c3344,transparent)}
.count{color:var(--muted);font-weight:400;font-size:.9rem}
.docs{list-style:none}
.doc{background:var(--card);border:1px solid #232937;border-radius:14px;padding:14px 18px;margin-bottom:10px;transition:.25s}
.doc:hover{border-color:var(--a1);transform:translateX(4px)}
.doc-link{display:flex;justify-content:space-between;gap:14px;text-decoration:none;color:var(--text);flex-wrap:wrap}
.doc-title{font-weight:600;font-size:1.02rem}
.doc-link:hover .doc-title{background:linear-gradient(90deg,var(--a1),var(--a2));-webkit-background-clip:text;background-clip:text;color:transparent}
.doc-meta{color:var(--muted);font-size:.82rem;white-space:nowrap}
.doc-desc{color:var(--muted);font-size:.88rem;margin-top:5px}
footer{margin-top:38px;text-align:center;color:var(--muted);font-size:.85rem}
footer a{color:var(--a1);text-decoration:none}
@media(max-width:600px){.hero{flex-direction:column;text-align:center;align-items:center}.pin .pin-sub{display:none}}
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <img class="avatar" src="/img/avatar.svg" alt="Z">
    <div>
      <h1>Zeek <span class="grad">Zhao</span></h1>
      <p class="desc">AI 驱动的知识工程 · Obsidian + Hexo 内容流水线</p>
      <div class="links">
        <a href="https://github.com/zeek-zhao" target="_blank" rel="noopener">GitHub</a>
        <a href="/archives/">归档</a>
        <a href="/tags/">标签</a>
        <a href="/categories/">分类</a>
        <a href="/${mapUrl}">短链映射</a>
      </div>
    </div>
  </header>

  <section class="pin">
    <a href="/${mapUrl}">
      <span class="pin-badge">置顶</span>
      <span>📌 文章短链映射</span>
      <span class="pin-sub">全部 ${report.map.length} 篇文档的源路径 ↔ 短链对照</span>
    </a>
  </section>

  <main>
    <h2 class="sec">全部文档 <span class="count">共 ${report.map.length} 篇</span></h2>
    <ul class="docs">
${items}
    </ul>
  </main>

  <footer>© 2026 Zeek Zhao · <a href="https://github.com/zeek-zhao/ai-obsidian" target="_blank" rel="noopener">ob-content</a> · 由 AI 流水线构建</footer>
</div>
</body>
</html>
`;
  fs.writeFileSync(OUT_INDEX, html);
}

console.log(JSON.stringify(report, null, 2));
console.log('collect done: ' + report.published.length + ' published / ' + report.scanned + ' scanned / map ' + report.map.length + ' / index.html written');
