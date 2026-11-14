#!/usr/bin/env node
/**
 * collect.js — Hexo 消费端 v6（元数据驱动，见 ob-content 90-OB工程管理/方案/04-发布工作手册）
 * 全库 find 所有 md → 按元数据过滤 → 转换 → 落位
 * 附带产出：① 短链映射页（sticky 置顶） ② 标签/分类统计页 source/tags/index.md · source/categories/index.md
 *           ③ 站内搜索数据 source/search.json
 * （v6：删除动态主页 source/index.html 生成，首页改由 themes/zeek 主题提供）
 * 放行条件：目录在黑名单外 且 published === true 且 status === 'published'，tags 数量 2~3
 * 双链处理：[[目标]] / [[目标|别名]] 解析为已发布文档的真实站内链接（完整路径 > 同目录 > 全局唯一 basename > 唯一 title），
 *           解析失败退化为纯文本，绝不生成错误链接
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
const SKIP_DIRS = new Set(['.git', '.obsidian', '.workbuddy', '.github', '.vscode', 'node_modules',
  // 发布黑名单目录（P0-3，2026-11-12）：发布资格 = 目录 + 元数据双条件，见 ob-content 方案/05-发布流与AI使用规范.md §3
  '99-Archive', '90-OB工程管理', '00-Inbox', '10-灵感']);
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

// 剥离围栏代码块（hexo 对 {{ }} 不做处理，围栏内是字面内容，守卫不应误报）
function stripFences(s) {
  const lines = s.split('\n');
  const out = [];
  let fence = null;
  for (const ln of lines) {
    const m = ln.match(/^([ \t]*)(`{3,}|~{3,})/);
    if (!fence && m) { fence = m[2][0]; continue; }
    if (fence && m && m[2][0] === fence && new RegExp('^' + m[1] + m[2][0] + '{3,}[ \t]*$').test(ln)) { fence = null; continue; }
    if (!fence) out.push(ln);
  }
  return out.join('\n');
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

// ── Pass 1：全库扫描 md，过滤 + 元数据整形（不落盘）──
const usedNames = new Set();
const seenTitles = new Set();
const pending = [];
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

  // 正文防御：清掉残留的中文键 frontmatter 块（历史注入遗留）
  body = body.replace(/^---\r?\n((?:标题|说明|标签|创建时间):[^\n]*\n)+^---\r?\n?/m, '');

  // 守卫：剥离 {% raw %} 段（刻意展示字面语法）与围栏代码块、行内代码后再检测
  const guarded = stripFences(body.replace(/\{% raw %\}[\s\S]*?\{% endraw %\}/g, '').replace(/`[^`\n]*`/g, ''));
  if (/\{\{/.test(guarded)) { report.skipped.push({ file: rel, reason: '代码块外含 {{ }}（模板语法冲突风险）' }); continue; }
  if (/\{%[^%]*%\}/.test(guarded)) { report.skipped.push({ file: rel, reason: '代码块外含 {% %} 标签语法' }); continue; }
  if (/TODO:/.test(guarded)) { report.skipped.push({ file: rel, reason: '含 TODO' }); continue; }

  // OB 专有语法兜底清理（嵌入图未转换的给警告）
  body = body.replace(/!\[\[([^\]]+)\]\]/g, '> [!warning] 未转换的 Obsidian 嵌入: $1');

  let name = path.basename(rel).replace(/\.md$/i, '');
  if (usedNames.has(name)) name = path.dirname(rel).split(path.sep).join('-') + '-' + name;
  usedNames.add(name);

  const outFm = {};
  for (const k of ['title', 'date', 'updated', 'tags', 'categories', 'description', 'cover']) {
    if (fm[k] !== undefined && fm[k] !== null) outFm[k] = fm[k];
  }
  if (outFm.title === undefined) outFm.title = name;
  // 标题查重：abbrlink 由 title 派生，重复标题会短链冲突
  const t = String(outFm.title);
  if (seenTitles.has(t)) { report.skipped.push({ file: rel, reason: '标题与已发布文档重复: ' + t }); continue; }
  seenTitles.add(t);

  const abbrlink = crc32.str(String(outFm.title)) >>> 0;
  const flat = (v) => Array.isArray(v) ? v.map(String) : (v !== undefined && v !== null && String(v) !== '' ? [String(v)] : []);
  pending.push({ rel, name, body, outFm, abbrlink, url: `posts/${abbrlink}.html` });
  report.published.push(rel);
  report.map.push({
    rel,
    title: String(outFm.title),
    url: `posts/${abbrlink}.html`,
    date: fm.date ? (fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date).slice(0, 10)) : '',
    description: String(fm.description || ''),
    categories: Array.isArray(fm.categories) ? fm.categories.join(' / ') : String(fm.categories || ''),
    tagList: flat(fm.tags),
    catList: flat(fm.categories),
  });
}

// ── 双链解析表：完整路径 > 同目录 basename > 全局唯一 basename > 唯一 title ──
const byRel = new Map(), byBase = new Map(), byTitle = new Map();
for (const p of pending) {
  const key = p.rel.replace(/\.md$/i, '');
  byRel.set(key, p);
  const b = key.split('/').pop();
  if (byBase.has(b)) byBase.set(b, 'AMBIG'); else byBase.set(b, p);
  const t = String(p.outFm.title);
  if (byTitle.has(t)) byTitle.set(t, 'AMBIG'); else byTitle.set(t, p);
}
const dirOf = (rel) => rel.split('/').slice(0, -1).join('/');

function resolveLink(srcRel, rawTarget) {
  let t = String(rawTarget).trim().split('#')[0].trim(); // 去标题锚/块引用
  if (!t) return null;
  t = t.replace(/\.md$/i, '').replace(/^\.\//, '');
  const srcKey = srcRel.replace(/\.md$/i, '');
  if (byRel.has(t)) return byRel.get(t);
  if (byRel.has(dirOf(srcKey) + '/' + t)) return byRel.get(dirOf(srcKey) + '/' + t);
  const base = t.split('/').pop();
  if (t === base) {
    const hit = byBase.get(t);
    return hit && hit !== 'AMBIG' ? hit : null; // basename 歧义时不猜，防错链
  }
  const hitT = byTitle.get(t);
  if (hitT && hitT !== 'AMBIG') return hitT;
  const cands = [...byRel.keys()].filter((k) => k.endsWith('/' + t));
  return cands.length === 1 ? byRel.get(cands[0]) : null;
}

// [[目标|别名]] → [别名](短链)；[[目标]] → [文件名](短链)；解析失败 → 纯文本
function convertWikiLinks(srcRel, body) {
  body = body.replace(/\[\[([^\]|#]+)(#[^\]|]*)?\|([^\]]+)\]\]/g, (m0, tgt, _a, alias) => {
    const p = resolveLink(srcRel, tgt);
    return p ? `[${alias.trim()}](/${p.url})` : alias.trim();
  });
  body = body.replace(/\[\[([^\]]+)\]\]/g, (m0, tgt) => {
    const p = resolveLink(srcRel, tgt);
    const label = String(tgt).trim().split('#')[0].split('/').pop();
    return p ? `[${label}](/${p.url})` : label;
  });
  return body;
}

// ── Pass 2：双链转换 + 落盘（先清空 _posts，防止旧命名/已下架文档残留重复发布） ──
for (const f of fs.readdirSync(OUT_POSTS)) {
  if (f.endsWith('.md')) fs.rmSync(path.join(OUT_POSTS, f));
}
for (const p of pending) {
  const body = convertWikiLinks(p.rel, p.body);
  const dest = path.join(OUT_POSTS, p.name + '.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true }); // name 含子目录路径时先建目录
  fs.writeFileSync(dest, matter.stringify(body, p.outFm));
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

// ── 标签/分类统计页 + 站内搜索数据（编译时从已发布文档动态生成）──
if (report.map.length) {
  const tagCount = new Map(), catCount = new Map();
  for (const m of report.map) {
    for (const t of m.tagList) tagCount.set(t, (tagCount.get(t) || 0) + 1);
    for (const c of m.catList) catCount.set(c, (catCount.get(c) || 0) + 1);
  }
  const statPage = (title, intro, counter, dir) => {
    const entries = [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));
    const pills = entries
      .map(([k, n]) => `<a class="tagbig" href="/${dir}/${encodeURIComponent(k)}/">${esc(k)}<b>${n}</b></a>`)
      .join('\n');
    return `---
title: ${title}
comments: false
---

${intro}

<div class="tagcloud">
${pills}
</div>
`;
  };
  fs.writeFileSync(path.join(ROOT, 'source', 'tags', 'index.md'),
    statPage('标签', `共 **${tagCount.size}** 个标签 · **${report.map.length}** 篇文档，点击标签查看该标签下的全部文章（按收录量排序）。`, tagCount, 'tags'));
  fs.writeFileSync(path.join(ROOT, 'source', 'categories', 'index.md'),
    statPage('分类', `共 **${catCount.size}** 个分类 · **${report.map.length}** 篇文档，点击分类查看该分类下的全部文章（按收录量排序）。`, catCount, 'categories'));

  // search.json：全站顶部搜索框的数据源（标题/描述/标签/分类快速检索）
  const searchData = report.map.map((m) => ({
    title: m.title,
    url: '/' + m.url,
    date: m.date,
    description: m.description,
    tags: m.tagList,
    categories: m.catList,
  }));
  fs.writeFileSync(path.join(ROOT, 'source', 'search.json'), JSON.stringify(searchData));
}

console.log(JSON.stringify(report, null, 2));
console.log('collect done: ' + report.published.length + ' published / ' + report.scanned + ' scanned / map ' + report.map.length + ' / search.json + tags/categories 统计页 written');
