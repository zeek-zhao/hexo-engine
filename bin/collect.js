#!/usr/bin/env node
/**
 * collect.js — Hexo 消费端 v7（元数据驱动，见 ob-content 90-OB工程管理/方案/04-发布工作手册）
 * 全库 find 所有 md → 按元数据过滤 → 转换 → 落位
 * 附带产出：① 短链映射页（sticky 置顶） ② 标签/分类统计页 source/tags/index.md · source/categories/index.md
 *           ③ 站内搜索数据 source/search.json
 * （v6：删除动态主页 source/index.html 生成，首页改由 themes/zeek 主题提供）
 * （v7：两级分类 —— 读 ob-content 方案/06-分类映射.json，为每篇注入 hexo 嵌套 categories [[领域, 细分]]，
 *       分类统计页两级渲染，search.json 增加 group 字段；二级分类 URL 不变）
 * 放行条件：目录在黑名单外 且 published === true 且 status === 'published'，tags 数量 2~3
 * 双链处理：[[目标]] / [[目标|别名]] 解析为已发布文档的真实站内链接（完整路径 > 同目录 > 全局唯一 basename > 唯一 title），
 *           解析失败退化为纯文本，绝不生成错误链接
 * 系列导航：extractSeriesNav() 在双链转换前从正文「上一篇/下一篇」硬编码链解析相邻篇，
 *           注入 prev_post/next_post/prev_title/next_title 到 frontmatter，主题 pager 直接读（见 05 规范 §6.2）
 * 短链算法与 hexo-abbrlink 一致：crc32(title) >>> 0（dec）
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const crc32 = require('hexo-abbrlink/lib/crc32');
const { slugize } = require('hexo-util');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = process.env.CONTENT_DIR || path.join(ROOT, 'content');
const OUT_POSTS = path.join(ROOT, 'source', '_posts');
const OUT_ASSETS = path.join(ROOT, 'source', 'assets');
const SKIP_DIRS = new Set(['.git', '.obsidian', '.workbuddy', '.github', '.vscode', 'node_modules',
  // 发布黑名单目录（P0-3，2026-11-12）：发布资格 = 目录 + 元数据双条件，见 ob-content 方案/05-发布流与AI使用规范.md §3
  '99-Archive', '90-OB工程管理', '00-Inbox', '10-灵感']);
const ASSET_DIRS = ['60-资源'];
const MAP_TITLE = '文章短链映射';
// v7 两级分类映射（OB-ENG-SOP-06）：一级领域 ← frontmatter categories 值；未登记分类归 fallback
const CATMAP_PATH = path.join(CONTENT_DIR, '90-OB工程管理', '方案', '06-分类映射.json');
let CATMAP = { fallback: '其他', categories: {} };
try {
  CATMAP = JSON.parse(fs.readFileSync(CATMAP_PATH, 'utf8'));
} catch (e) {
  console.warn('[collect] 分类映射表缺失或非法（' + CATMAP_PATH + '），未登记分类将全部归入「' + CATMAP.fallback + '」: ' + e.message);
}
const groupOf = (cat) => (CATMAP.categories && CATMAP.categories[cat]) || CATMAP.fallback || '未分组';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// PIP-04：统计页链接必须与 hexo 生成的 tag/category 路径一致。
// hexo 用 slugize 生成permalink（空格→-、C++→C、CI/CD→CI-CD、ubuntu24.04→ubuntu24-04），
// 旧版直接 encodeURIComponent(原始名) 会产生 404。这里统一 slug 化后拼路径。
const slugPath = (s) => encodeURIComponent(slugize(String(s), { transform: false }));

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

  // 守卫：先剥围栏代码块（必须在行内代码之前，否则三反引号会被行内正则吃掉一）
  // 再剥 {% raw %} 段（刻意展示字面语法）与行内代码后检测
  const guarded = stripFences(body)
    .replace(/\{% raw %\}[\s\S]*?\{% endraw %\}/g, '')
    .replace(/`[^`\n]*`/g, '');
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
  // 任务A（私密文章）：透传 private 标记，供 encrypt-private.js 识别；hint 不得含口令
  if (fm.private === true) { outFm.private = true; if (fm.password_hint) outFm.password_hint = String(fm.password_hint); }
  if (outFm.title === undefined) outFm.title = name;
  // 标题查重：abbrlink 由 title 派生，重复标题会短链冲突
  const t = String(outFm.title);
  if (seenTitles.has(t)) { report.skipped.push({ file: rel, reason: '标题与已发布文档重复: ' + t }); continue; }
  seenTitles.add(t);

  const flat = (v) => Array.isArray(v) ? v.map(String) : (v !== undefined && v !== null && String(v) !== '' ? [String(v)] : []);
  const catArr = flat(fm.categories);
  const cat0 = catArr[0] || '';
  if (cat0) outFm.categories = [[groupOf(cat0), cat0]]; // v7：hexo 嵌套分类 [[领域, 细分]]，细分 URL 不变
  const abbrlink = crc32.str(String(outFm.title)) >>> 0;
  pending.push({ rel, name, body, outFm, abbrlink, url: `posts/${abbrlink}.html` });
  // 任务A：登记私密文章（仅短链 + 非敏感提示，绝不含口令）
  if (outFm.private === true) {
    if (!report.privatePosts) report.privatePosts = [];
    report.privatePosts.push({ url: `posts/${abbrlink}.html`, hint: outFm.password_hint || '' });
  }
  report.published.push(rel);
  report.map.push({
    rel,
    title: String(outFm.title),
    url: `posts/${abbrlink}.html`,
    date: fm.date ? (fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date).slice(0, 10)) : '',
    description: String(fm.description || ''),
    categories: catArr.join(' / '),
    tagList: flat(fm.tags),
    catList: catArr,
    group: groupOf(cat0),
    text: (body || '') // v8：正文片段（限 1200 字符），search.json 全文检索用
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片语法
      .replace(/\{% raw %\}|\{% endraw %\}/g, ' ')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200),
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

// 从正文「*上一篇：[[X]]　下一篇：[[Y]]*」硬编码链解析系列内相邻篇，注入 frontmatter
// 依据：正文双链是作者维护的系列内顺序（最权威），解析成 /posts/N.html 后主题 pager 直接读，
// 不依赖运行时分类/source 解析——本地与 CI 由同一份 collect.js 生成，结果完全一致。
// 背景（2026-11-20）：seriesPosts helper 依赖 p.source 数字前缀，在 CI 环境（内容与本地不同步）
// 下排序键失效导致上下篇跨系列乱跳（ros2/00 → 34-安全与权限），改用 collect 期注入彻底根治。
function extractSeriesNav(srcRel, p, body) {
  // 只取末尾「上一篇/下一篇」行（可能只有其中一条：00 只有下一篇、90 只有上一篇）
  const prevM = body.match(/上一篇[：:]\s*\[\[([^\]]+)\]\]/);
  const nextM = body.match(/下一篇[：:]\s*\[\[([^\]]+)\]\]/);
  const prev = prevM ? resolveLink(srcRel, prevM[1]) : null;
  const next = nextM ? resolveLink(srcRel, nextM[1]) : null;
  if (prev) { p.outFm.prev_post = prev.url.replace(/^posts\//, ''); p.outFm.prev_title = String(prev.outFm.title); }
  if (next) { p.outFm.next_post = next.url.replace(/^posts\//, ''); p.outFm.next_title = String(next.outFm.title); }
}

// [[目标|别名]] → [别名](短链)；[[目标]] → [文件名](短链)；解析失败 → 纯文本
// 目标名排除嵌套方括号：防止行内代码 `[[` 被当成开括号吞掉后续真双链的 ]]（2026-11-14 体检发现）
function convertWikiLinks(srcRel, body) {
  body = body.replace(/\[\[([^\[\]|#]+)(#[^\]|]*)?\|([^\[\]]+)\]\]/g, (m0, tgt, _a, alias) => {
    const p = resolveLink(srcRel, tgt);
    return p ? `[${alias.trim()}](/${p.url})` : alias.trim();
  });
  body = body.replace(/\[\[([^\[\]]+)\]\]/g, (m0, tgt) => {
    const p = resolveLink(srcRel, tgt);
    const label = String(tgt).trim().split('#')[0].split('/').pop();
    return p ? `[${label}](/${p.url})` : label;
  });
  return body;
}

// ── CAT-01 / LAY-02（任务 D 方案 A）：建立「索引页 ↔ 文章」双向归属 ──
// 索引页 = 70-索引/<领域>/00-索引.md，是各领域的权威导航入口；原生分类仍作底层打标。
// 解析索引页正文里的双链目标，给目标文章注入 index_ref（权威索引的标题+短链），
// 主题 post.ejs 据此在正文底部渲染「所属索引」回链 → 与索引页已有的正向表格构成双向跳转。
// 采用 collect 期注入：不改内容库源文件、可整批回滚、本地与 CI 完全一致。
const INDEX_RE = /(^|\/)70-索引\/[^/]+\/00-索引\.md$/;
const indexStat = { indexes: 0, linked: 0, unresolved: [] };
const indexPages = pending.filter((p) => INDEX_RE.test(p.rel));
for (const idx of indexPages) {
  indexStat.indexes++;
  const targets = [];
  idx.body.replace(/\[\[([^\[\]|#]+)(?:#[^\]|]*)?(?:\|[^\[\]]+)?\]\]/g, (m0, tgt) => {
    targets.push(String(tgt).trim()); return m0;
  });
  for (const tgt of targets) {
    if (/^(术语表|00-索引)$/.test(tgt)) continue; // 通用术语表/索引自引用不算领域归属
    const p = resolveLink(idx.rel, tgt);
    if (p && p !== idx) {
      if (!p.outFm.index_ref) {
        p.outFm.index_ref = { title: String(idx.outFm.title), url: idx.url };
        indexStat.linked++;
      }
    } else if (!p) {
      indexStat.unresolved.push({ index: idx.rel, target: tgt });
    }
  }
}
report.indexRef = { indexes: indexStat.indexes, linked: indexStat.linked, unresolved: indexStat.unresolved.length };

// ── Pass 2：双链转换 + 落盘（先清空 _posts，防止旧命名/已下架文档残留重复发布） ──
for (const f of fs.readdirSync(OUT_POSTS)) {
  if (f.endsWith('.md')) fs.rmSync(path.join(OUT_POSTS, f));
}
for (const p of pending) {
  extractSeriesNav(p.rel, p, p.body); // 在双链转换前，从原始 [[...]] 解析系列内上下篇 → frontmatter
  const body = convertWikiLinks(p.rel, p.body);
  const dest = path.join(OUT_POSTS, p.name + '.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true }); // name 含子目录路径时先建目录
  fs.writeFileSync(dest, matter.stringify(body, p.outFm));
}

// 任务A：私密文章短链集合（全局共享），用于所有公开派生页统一剔除
const privateUrls = new Set((report.privatePosts || []).map((p) => p.url));
const publicMap = report.map.filter((m) => !privateUrls.has(m.url));

// 生成短链映射页（sticky 置顶，随站点发布）
const mapAbbr = crc32.str(MAP_TITLE) >>> 0;
const mapUrl = `posts/${mapAbbr}.html`;
if (report.map.length) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = publicMap
    .map((m) => `| \`${m.rel}\` | ${m.title} | [${m.url.replace('posts/', '')}](/${m.url}) |`)
    .join('\n');
  const mapBody = `本页由流水线 collect.js 自动生成，收录全部已发布文档的源路径与短链对照。改标题会改变短链，正式发布后请勿修改 title。

## 映射表（${publicMap.length} 篇）

| 源文档（ob-content 相对路径） | 标题 | 短链 |
|---|---|---|
${rows}
`;
  const mapFm = {
    title: MAP_TITLE,
    date: today,
    updated: today,
    tags: ['流水线', '映射'],
    categories: [[groupOf('工程实践'), '工程实践']], // v7：与正文文章保持两级结构一致
    description: '全部已发布文档的源路径与 abbrlink 短链对照表，由流水线自动生成。',
    sticky: 999,
  };
  fs.writeFileSync(path.join(OUT_POSTS, 'post-map.md'), matter.stringify(mapBody, mapFm));
}

// ── 标签/分类统计页 + 站内搜索数据（编译时从已发布文档动态生成）──
if (report.map.length) {
  const tagCount = new Map(), catCount = new Map();
  for (const m of publicMap) { // 任务A：公开派生页统一用 publicMap（已排除私密）
    for (const t of m.tagList) tagCount.set(t, (tagCount.get(t) || 0) + 1);
    for (const c of m.catList) catCount.set(c, (catCount.get(c) || 0) + 1);
  }
  const statPage = (title, intro, counter, dir) => {
    const entries = [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));
    const pills = entries
      .map(([k, n]) => `<a class="tagbig" href="/${dir}/${slugPath(k)}/">${esc(k)}<b>${n}</b></a>`)
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
    statPage('标签', `共 **${tagCount.size}** 个标签 · **${publicMap.length}** 篇文档，点击标签查看该标签下的全部文章（按收录量排序）。`, tagCount, 'tags'));

  // v7：分类统计页两级渲染 —— 领域（details 分组）← 细分分类（tagbig 链接，URL 不变）
  const grpCount = new Map();
  for (const m of publicMap) { // 任务A：公开派生页统一用 publicMap（已排除私密）
    if (!grpCount.has(m.group)) grpCount.set(m.group, new Map());
    for (const c of m.catList) {
      const cm = grpCount.get(m.group);
      cm.set(c, (cm.get(c) || 0) + 1);
    }
  }
  const groupBlocks = [...grpCount.entries()]
    .sort((a, b) => {
      const sa = [...a[1].values()].reduce((x, y) => x + y, 0);
      const sb = [...b[1].values()].reduce((x, y) => x + y, 0);
      return sb - sa || a[0].localeCompare(b[0], 'zh');
    })
    .map(([g, cm]) => {
      const sum = [...cm.values()].reduce((x, y) => x + y, 0);
      // v7 两级分类真实路径为 /categories/<领域>/<细分>/；PIP-04 巡检发现旧扁平链接 404，这里按领域拼两级。
      const pills = [...cm.entries()]
        .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'zh'))
        .map(([k, n]) => `<a class="tagbig" href="/categories/${slugPath(g)}/${slugPath(k)}/">${esc(k)}<b>${n}</b></a>`)
        .join('\n');
      return `<details class="catgroup" open><summary>📁 ${esc(g)}<span class="cnt">${sum} 篇</span></summary>\n<div class="tagcloud">\n${pills}\n</div>\n</details>`;
    })
    .join('\n');
  fs.writeFileSync(path.join(ROOT, 'source', 'categories', 'index.md'), `---
title: 分类
comments: false
---

按领域分组的全部分类，共 **${catCount.size}** 个细分分类 · **${publicMap.length}** 篇文档，点击分类查看该分类下的全部文章（按收录量排序）。

${groupBlocks}
`);

  // search.json：全站顶部搜索框的数据源（标题/描述/标签/分类/正文全文检索）
  // text 字段在 pass 1（handleFile）逐篇计算，见 report.map.push
  // 任务A：私密文章不进搜索索引（正文片段/标题/摘要均不外泄）
  const searchData = report.map
    .filter((m) => !privateUrls.has(m.url))
    .map((m) => ({
      title: m.title,
      url: '/' + m.url,
      date: m.date,
      description: m.description,
      tags: m.tagList,
      categories: m.catList,
      group: m.group, // v7：一级领域，搜索结果可直接展示归属
      text: m.text, // v8：正文片段，全文检索用
    }));
  fs.writeFileSync(path.join(ROOT, 'source', 'search.json'), JSON.stringify(searchData));

  // CAT-04（任务D）：术语表三处消费之一 —— 从内容库单一数据源 70-索引/术语表.md 生成 glossary.json，
  // 供主题 main.js 在正文/索引页对缩写加 hover 全称提示（第二、三处消费在主题层）。
  // 解析规则：取表格行「| 缩写 | 英文全称 | 中文 | 一句话说明 |」，跳过表头与分隔行。
  try {
    const glossPath = path.join(CONTENT_DIR, '70-索引', '术语表.md');
    if (fs.existsSync(glossPath)) {
      const rows = fs.readFileSync(glossPath, 'utf8').split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('|') && l.endsWith('|'))
        .map((l) => l.slice(1, -1).split('|').map((c) => c.trim()))
        .filter((c) => c.length >= 3 && c[0] && c[0] !== '缩写' && !/^-+$/.test(c[0]));
      const glossary = rows.map((c) => ({ abbr: c[0], full: c[1], cn: c[2] || '' }));
      fs.writeFileSync(path.join(ROOT, 'source', 'glossary.json'), JSON.stringify(glossary));
      report.glossaryCount = glossary.length;
    }
  } catch (e) {
    console.error('glossary parse failed (non-fatal): ' + e.message);
  }

  // 任务A：写出私密清单供 encrypt-private.js 消费（不含口令）
  // 放项目根、不入 source/，避免被 hexo 当静态资源复制进 public 发布；同时入 .gitignore
  fs.writeFileSync(path.join(ROOT, 'private-list.json'),
    JSON.stringify({ posts: report.privatePosts || [] }));
}

console.log(JSON.stringify(report, null, 2));

// Q4③（TASK-F3）：把 skip 从「只埋在 JSON」提升为控制台醒目告警 + 按原因分类计数。
// 仅打印、不改任何发布放行逻辑（report.skipped 本就存在，此处只做可观测性增强）。
if (report.skipped.length) {
  const byReason = {};
  for (const s of report.skipped) {
    const key = String(s.reason).split('（')[0].split(':')[0].trim();
    byReason[key] = (byReason[key] || 0) + 1;
  }
  console.warn(`\n[collect][SKIP-SUMMARY] 共跳过 ${report.skipped.length} 篇（按原因）:`);
  for (const [k, v] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.warn(`  ${String(v).padStart(4)}  ${k}`);
  }
  // 标签类问题单列篇目，供标签治理（Issue #14 CAT-05）直接消费
  const tagSkips = report.skipped.filter(s => /tags/.test(String(s.reason)));
  if (tagSkips.length) {
    console.warn(`[collect][SKIP-TAGS] 标签不合规篇目（${tagSkips.length}）:`);
    for (const s of tagSkips) console.warn(`  - ${s.file} :: ${s.reason}`);
  }
  console.warn('');
}
console.log('collect done: ' + report.published.length + ' published / ' + report.scanned + ' scanned / map ' + report.map.length + ' / search.json + tags/categories 统计页 written');
