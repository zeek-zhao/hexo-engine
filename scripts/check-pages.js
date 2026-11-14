#!/usr/bin/env node
/* ============================================================
 * scripts/check-pages.js — 全站页面渲染体检（按语法类型断言）
 *
 * 基准：source/_posts/*.md（collect.js 产物）里的语法特征；
 * 断言：public/ 下对应 HTML 的转换结果 + 每类页面的必要结构。
 *
 * 页面类型：index / post / category-root / category-leaf / tag /
 *           tag-page / archive / stats / about / 404
 * 语法类型：callout / math / mermaid / table / code / highlight /
 *           footnote / tasklist / image / wikilink / comment
 *
 * 输出：逐类 PASS/FAIL 明细 + 汇总表；任一 FAIL 退出码 1（CI 门禁）。
 * 运行：node scripts/check-pages.js  （在 hexo generate 之后执行）
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const POSTS = path.join(ROOT, 'source', '_posts');
const MAPJSON = path.join(ROOT, 'content', '90-OB工程管理', '方案', '06-分类映射.json');

let pass = 0, fail = 0;
const failures = [];
function ok(page, name) { pass++; console.log('  PASS  [' + page + '] ' + name); }
function bad(page, name, detail) {
  fail++;
  failures.push({ page, name, detail });
  console.log('  FAIL  [' + page + '] ' + name + ' — ' + detail);
}
function expect(page, name, cond, detail) {
  if (cond) ok(page, name); else bad(page, name, detail || '条件不成立');
}

/* ---------- 工具 ---------- */
function stripFences(md) {
  // 去掉围栏代码与行内代码，用于特征检测（检测 == / [[ 等不能被代码内容骗到）
  // 行级围栏感知：记录围栏记号与长度（``` 与 ```` 不同），闭合要求等长及以上（CommonMark）
  var out = [];
  var inFence = null; // { ch: '`'|'~', n: 长度 }
  String(md).split(/\r?\n/).forEach(function (l) {
    if (inFence) {
      var closeRun = new RegExp('^' + (inFence.ch === '`' ? '`' : '~') + '{' + inFence.n + ',}\\s*$').exec(l);
      if (closeRun) inFence = null;
      return;
    }
    var m = /^(`{3,}|~{3,})/.exec(l);
    if (m) { inFence = { ch: m[1][0], n: m[1].length }; return; }
    out.push(l);
  });
  return out.join('\n').replace(/`[^`\n]*`/g, ' ');
}
function stripCodeHtml(html) {
  // HTML 侧去掉 pre/figure/script/style 与行内 <code> 的文本，避免源码里的 == [[ [! 干扰残留检测
  return String(html).replace(/<(pre|figure|script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<code>[\s\S]*?<\/code>/gi, ' ');
}
function parseFm(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(md));
  if (!m) return {};
  const fm = {};
  m[1].split(/\r?\n/).forEach(function (l) {
    const kv = /^(\w[\w-]*):\s*(.*)$/.exec(l);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  });
  return fm;
}
function readHtml(rel) {
  const p = path.join(PUB, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/* ---------- 语法特征检测（source md） ---------- */
function detectFeatures(md) {
  const body = stripFences(String(md).replace(/^---[\s\S]*?---/, ' '));
  const f = {};
  f.callout = (body.match(/^\s*(?:[-*+]\s+)*>\s*\[!(\w+)\]/gm) || []).length; // 含列表内嵌套的 > [!x]（如 " - > [!note]"）
  f.highlight = (body.match(/==[^=\n]+==/g) || []).length;
  f.footnoteRef = (body.match(/\[\^[^\]\s]+\](?!:)/g) || []).length; // 引用数（定义行 [^x]: 不计，定义转文末列表）
  f.tasklist = (body.match(/^\s*[-*] \[[ x]\]/gm) || []).length;
  f.table = (body.match(/^\|.+\|/gm) || []).length;
  f.wikilink = (body.match(/\[\[([^\]]+)\]\]/g) || []).length;
  f.image = (body.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
  f.math = /\$\$|\\\[|\\\(/.test(body) || /(^|\s)\$[^$\n]+\$/m.test(body);
  // mermaid：只认「顶层围栏」（嵌在其他围栏内的 ```mermaid 教学示例不算，由行级围栏长度配对判定）
  f.mermaid = (function (md) {
    var lines = String(md).split(/\r?\n/);
    var fence = null;
    for (var i = 0; i < lines.length; i++) {
      if (fence) {
        if (new RegExp('^' + fence.ch + '{' + fence.n + ',}\\s*$').test(lines[i])) fence = null;
        continue;
      }
      var m = /^(`{3,}|~{3,})\s*([^\s]*)/.exec(lines[i]);
      if (!m) continue;
      if (m[2] === 'mermaid') return true;
      fence = { ch: m[1][0], n: m[1].length };
    }
    return false;
  })(md);
  f.code = /```/.test(String(md));
  f.comment = /%%[\s\S]*?%%/.test(String(md));
  f.wikilinkTargets = (body.match(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g) || []).map(function (s) {
    return /\[\[([^\]|]+)/.exec(s)[1].split('/').pop().trim();
  });
  return f;
}

/* ---------- 通用页面结构 ---------- */
function checkChrome(page, html) {
  expect(page, 'topbar', /class="topbar"/.test(html), '缺顶栏');
  expect(page, 'sidebar', /class="sidebar"/.test(html), '缺侧栏');
  expect(page, 'footer', /class="footer"/.test(html), '缺页脚');
  expect(page, 'backtop', /id="backtop"/.test(html), '缺返回顶部');
  expect(page, 'theme-btn', /id="themeBtn"/.test(html), '缺主题按钮');
}
function checkNoRaw(page, html) {
  // 剔除 head（title/meta description）与 subtitle（frontmatter description 渲染）——
  // 描述性文字里出现 %%、[[ 等属于合法内容（如 Bash 运算符文档），不算残留
  let scoped = String(html).replace(/<head>[\s\S]*?<\/head>/i, ' ')
    .replace(/<div class="subtitle">[\s\S]*?<\/div>/g, ' ');
  const text = stripCodeHtml(scoped);
  expect(page, 'no-raw-callout', text.indexOf('[!') === -1, '残留 [!…]');
  expect(page, 'no-raw-highlight', !/==[^=\n]+==/.test(text), '残留 ==…==');
  expect(page, 'no-raw-wikilink', text.indexOf('[[') === -1, '残留 [[双链]]');
  expect(page, 'no-raw-comment', !/%%[\s\S]*?%%/.test(text), '残留 %%注释%%');
}

/* ---------- 主流程 ---------- */
if (!fs.existsSync(PUB)) { console.error('public/ 不存在，先跑 hexo generate'); process.exit(1); }

console.log('== 全站渲染体检（check-pages） ==\n-- 页面类型 --');

/* 1) 首页 */
const hp = readHtml('index.html');
if (!hp) bad('index', 'index.html 存在', 'public/index.html 缺失');
else {
  checkChrome('index', hp);
  expect('index', 'hero-blob 装饰', /hero-blob b1/.test(hp) && /hero-blob b2/.test(hp), '缺动态装饰元素');
  const cards = (hp.match(/class="cat-card"/g) || []).length;
  expect('index', '领域卡=8', cards === 8, '实际 ' + cards);
  const groups = (hp.match(/class="sidegroup"/g) || []).length;
  expect('index', '侧栏领域组=8', groups === 8, '实际 ' + groups);
  expect('index', '最近更新列表', /class="postlist"/.test(hp), '缺 postlist');
  expect('index', '热门排行', /class="hotlist"/.test(hp), '缺 hotlist');
  checkNoRaw('index', hp);
}

/* 2) 归档 / 统计 / 标签页 / 关于 / 404 */
const arch = readHtml('archives/index.html');
if (arch) {
  checkChrome('archive', arch);
  expect('archive', '领域分组', /archdomain/.test(arch), '缺 archdomain');
  expect('archive', '筛选框', /id="archq"/.test(arch), '缺归档筛选');
}
const stats = readHtml('categories/index.html');
if (stats) {
  checkChrome('stats', stats);
  expect('stats', '两级分组', /catgroup/.test(stats), '缺 catgroup');
}
const tagsPage = readHtml('tags/index.html');
if (tagsPage) checkChrome('tag-page', tagsPage);
const about = readHtml('about/index.html');
if (about) {
  checkChrome('about', about);
  expect('about', 'Projects 区', /yp-distro/.test(about), '缺项目链接');
  expect('about', '外链安全', about.indexOf('target="_blank" rel="noopener noreferrer"') !== -1, '缺 noopener');
}
const nf = readHtml('404.html');
if (nf) {
  expect('404', '存在', true, '');
  expect('404', '三个出口', (nf.match(/href="/g) || []).length >= 3, '出口不足');
}

/* 3) 分类页（领域 + 细分各抽样） */
const MAP = fs.existsSync(MAPJSON) ? JSON.parse(fs.readFileSync(MAPJSON, 'utf8')) : {};
const domainOf = MAP.categories || {};
const iconOf = function (name) { return (MAP.icons && MAP.icons[name]) || (MAP.groupIcons && MAP.groupIcons[name]) || '📁'; };
let leafChecked = 0, rootChecked = 0;
Object.keys(domainOf).forEach(function (leaf) {
  const dom = domainOf[leaf];
  if (rootChecked < 2) {
    const h = readHtml('categories/' + dom + '/index.html');
    if (h) {
      rootChecked++;
      checkChrome('cat-root:' + dom, h);
      expect('cat-root:' + dom, '领域图标', h.indexOf(iconOf(dom)) !== -1, '缺 ' + iconOf(dom));
      expect('cat-root:' + dom, '细分 chips', /class="chip"/.test(h), '缺 chips');
      const g = (h.match(/class="sidegroup"/g) || []).length;
      expect('cat-root:' + dom, '侧栏仅当前领域组=1', g === 1, '实际 ' + g);
    }
  }
  if (leafChecked < 2) {
    const h = readHtml('categories/' + dom + '/' + leaf + '/index.html');
    if (h) {
      leafChecked++;
      const g = (h.match(/class="sidegroup"/g) || []).length;
      expect('cat-leaf:' + leaf, '侧栏仅当前领域组=1', g === 1, '实际 ' + g);
      expect('cat-leaf:' + leaf, '面包屑含领域', h.indexOf(dom) !== -1, '缺领域名');
      expect('cat-leaf:' + leaf, '细分图标', h.indexOf(iconOf(leaf)) !== -1, '缺 ' + iconOf(leaf));
    }
  }
});
expect('categories', '抽到领域页≥2', rootChecked >= 2, '只抽到 ' + rootChecked);
expect('categories', '抽到细分页≥2', leafChecked >= 2, '只抽到 ' + leafChecked);

/* 4) 文章页：逐篇按语法特征断言 */
console.log('\n-- 文章语法类型 --');
let postChecked = 0;
const search = JSON.parse(fs.readFileSync(path.join(PUB, 'search.json'), 'utf8'));
const urlByTitle = {};
search.forEach(function (s) { urlByTitle[s.title] = s.url; });
const mdFiles = (function walk(d) {
  const out = [];
  fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push.apply(out, walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  });
  return out;
})(POSTS);
mdFiles.forEach(function (mdPath) {
  const md = fs.readFileSync(mdPath, 'utf8');
  const fm = parseFm(md);
  const url = urlByTitle[fm.title];
  if (!url) return;               // search.json 里找不到的跳过（理论上不该有）
  const html = readHtml(url.replace(/^\//, ''));
  if (!html) { bad('post:' + fm.title, '页面存在', url + ' 缺 index.html'); return; }
  postChecked++;
  const page = 'post:' + (fm.title || path.basename(mdPath));

  const sg = (html.match(/class="sidegroup"/g) || []).length;
  expect(page, '侧栏仅当前领域组=1', sg === 1, '实际 ' + sg);
  expect(page, '面包屑', /class="crumb"/.test(html), '缺面包屑');
  expect(page, 'author-card', /author-card/.test(html), '缺作者卡');
  expect(page, 'h2 锚点', /<h2[^>]*id=/.test(html), '缺 h2 id');
  checkNoRaw(page, html);

  const F = detectFeatures(md);
  if (F.callout) {
    const n = (html.match(/class="callout /g) || []).length;
    expect(page, 'callout×' + F.callout, n === F.callout, '源 ' + F.callout + ' 转出 ' + n);
    const fold = /^\s*>\s*\[!(\w+)\]([+-])/m.test(String(md).replace(/^---[\s\S]*?---/, ' '));
    if (fold) expect(page, '折叠 callout', /<details class="callout/.test(html), '缺 details 折叠');
  }
  if (F.highlight) {
    const n = (html.match(/<mark>/g) || []).length;
    expect(page, 'highlight mark×' + F.highlight, n >= F.highlight, '源 ' + F.highlight + ' 转出 ' + n);
  }
  if (F.footnoteRef) {
    expect(page, 'footnotes 区', /class="footnotes"/.test(html), '缺脚注区');
    const n = (html.match(/class="fnref"/g) || []).length;
    expect(page, 'footnote 引用×' + F.footnoteRef, n >= F.footnoteRef, '源 ' + F.footnoteRef + ' 转出 ' + n);
  }
  if (F.tasklist) expect(page, '任务列表 checkbox', /<input[^>]*type="checkbox"/.test(html), '缺 checkbox');
  if (F.table) expect(page, '表格', /<table>/.test(html), '缺 table');
  if (F.code) expect(page, '代码块增强', /<figure class="highlight|<pre><code|class="mermaid"/.test(html), '缺代码块');
  if (F.mermaid) expect(page, 'mermaid 待渲染块', /language-mermaid|class="mermaid"/.test(html), '缺 mermaid 节点');
  if (F.math) expect(page, 'KaTeX 资源', /katex\.min\.css/.test(html), '缺 katex.css（客户端渲染前置）');
  if (F.image) {
    let okImg = true;
    // 逐 img src 校验 data:/外链/文件存在
    (html.match(/<img[^>]*src="([^"]+)"/g) || []).forEach(function (tag) {
      const src = /src="([^"]+)"/.exec(tag)[1];
      if (src.startsWith('data:') || src.startsWith('http')) return;
      const p = path.join(PUB, src.replace(/^\//, ''));
      if (!fs.existsSync(p)) okImg = false;
    });
    expect(page, '图片资源存在', okImg, '存在失效 img src');
  }
  if (F.wikilinkTargets.length) {
    const missing = F.wikilinkTargets.filter(function (t) { return html.indexOf(t) === -1; });
    expect(page, '双链解析', missing.length === 0, '未解析: ' + missing.join(', '));
  }
});
expect('posts', '文章抽样≥1100', postChecked >= 1100, '只体检了 ' + postChecked + ' 篇');

/* 5) search.json 结构 */
expect('search.json', '条目数', search.length >= 1100, '实际 ' + search.length);
const groups = {};
search.forEach(function (s) { groups[s.group || ''] = 1; });
const gn = Object.keys(groups).length;
expect('search.json', 'group 字段=8', gn === 8, '实际 ' + gn + '（' + Object.keys(groups).join(',') + '）');

/* 6) 汇总 */
console.log('\n== 汇总 ==');
console.log('PASS ' + pass + ' / FAIL ' + fail);
if (fail) {
  console.log('\n失败明细（前 30 条）：');
  failures.slice(0, 30).forEach(function (x) {
    console.log('  [' + x.page + '] ' + x.name + ' — ' + (x.detail || ''));
  });
  process.exit(1);
}
console.log('CHECK-PAGES ALL PASS');
