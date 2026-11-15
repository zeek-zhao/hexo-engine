/* BDD 功能性测试 runner（第七轮）——零依赖迷你 Gherkin 子集执行器。
 * 用法：node tests/bdd-runner.js [publicDir]
 * feature 文件：tests/features/*.feature（Feature/Scenario/Given/When/Then/And）。
 * 每个步骤按「精确文本 → 正则」在 STEPS 注册表中查找执行；断言失败即该 Scenario FAIL。
 * 退出码：全部通过 0，任一失败 1（可作 CI 发布前门禁）。 */
'use strict';
const fs = require('fs');
const path = require('path');

const PUB = path.resolve(process.argv[2] || path.join(__dirname, '..', 'public'));
const FEAT_DIR = path.join(__dirname, 'features');

/* ---------- 页面样本收集 ---------- */
function read(p) { return fs.readFileSync(p, 'utf8'); }
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, out); else out.push(fp);
  }
  return out;
}
function collectSamples() {
  const s = {};
  s.home = read(path.join(PUB, 'index.html'));
  s.article = read(path.join(PUB, 'posts', '2674584049.html')); // 模板篇（全语法）
  const anyPost = walk(path.join(PUB, 'posts'), []).find(f => f.endsWith('.html') && !f.endsWith('2674584049.html'));
  s.post2 = read(anyPost);
  s.about = read(path.join(PUB, 'about', 'index.html'));
  s.notfound = read(path.join(PUB, '404.html'));
  const catDirs = fs.readdirSync(path.join(PUB, 'categories')).filter(d => !d.startsWith('.'));
  // 根分类页（领域页含 cat-chips）与叶子分类页（细分页含 archlist 且无 chips）
  s.catRoot = null; s.catLeaf = null;
  for (const d of catDirs) {
    const ip = path.join(PUB, 'categories', d, 'index.html');
    if (!fs.existsSync(ip)) continue;
    const html = read(ip);
    if (!s.catRoot && html.includes('cat-chips')) s.catRoot = html;
    if (!s.catLeaf && html.includes('archlist') && !html.includes('cat-chips')) s.catLeaf = html;
  }
  if (!s.catRoot) s.catRoot = read(path.join(PUB, 'categories', catDirs[0], 'index.html'));
  if (!s.catLeaf) s.catLeaf = s.catRoot;
  s.search = JSON.parse(read(path.join(PUB, 'search.json')));
  s.atom = read(path.join(PUB, 'atom.xml'));
  s.sitemap = read(path.join(PUB, 'sitemap.xml'));
  s.robots = read(path.join(PUB, 'robots.txt'));
  s.css = read(path.join(PUB, 'css', 'main.css'));
  s.js = read(path.join(PUB, 'js', 'main.js'));
  return s;
}

/* ---------- 断言工具 ---------- */
function stripCode(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<figure class="highlight[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<pre[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<code[\s\S]*?<\/code>/gi, ' ');
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }

/* ---------- 步骤注册表：精确文本在前，正则兜底 ---------- */
const STEPS = [];
function step(pattern, fn) { STEPS.push({ pattern, fn }); }

/* 第八轮：上下篇定序与全文搜索 */
step(/^文章页上一篇与下一篇链接齐全$/, c => {
  const h = String(c.cur || '');
  expect(/← 上一篇<\/span>/.test(h), '缺少上一篇链接');
  expect(/下一篇 →<\/span>/.test(h), '缺少下一篇链接');
  const prevs = [...h.matchAll(/class="pager"[\s\S]{0,400}?← 上一篇<\/span>([^<]{1,60})</g)];
  if (prevs.length) {
    const t = prevs[0][1].trim();
    expect(t.length > 0, '上一篇标题为空');
  }
});
step(/^search\.json 至少 1100 条且每条含非空 text 字段$/, c => {
  const s = c.samples.search;
  expect(Array.isArray(s) && s.length >= 1100, 'search.json 条目不足: ' + (s || []).length);
  const empty = s.filter(e => !e.text || !String(e.text).length).length;
  expect(empty === 0, empty + ' 条 text 为空');
});
step(/^main\.js 搜索逻辑覆盖 text 字段并展示命中片段$/, c => {
  const js = c.samples.js || '';
  expect(/e\.text/.test(js), 'matchEntry 未覆盖 text 字段');
  expect(/function snippet/.test(js), '缺少 snippet 命中片段函数');
});
/* Given */
step(/^已构建的站点 public 目录$/, c => { c.samples = collectSamples(); });
step(/^从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）$/, c => { c.samples = collectSamples(); });

/* When */
step(/^访问首页$/, c => { c.cur = c.samples.home; c.name = '首页'; });
step(/^访问模板文章页$/, c => { c.cur = c.samples.article; c.name = '模板文章'; });
step(/^访问任意一篇文章$/, c => { c.cur = c.samples.post2; c.name = '文章抽样'; });
step(/^访问关于页$/, c => { c.cur = c.samples.about; c.name = '关于'; });
step(/^访问领域分类页$/, c => { c.cur = c.samples.catRoot; c.name = '领域分类页'; });
step(/^访问细分分类页$/, c => { c.cur = c.samples.catLeaf; c.name = '细分分类页'; });
step(/^访问 404 页$/, c => { c.cur = c.samples.notfound; c.name = '404'; });

/* Then / And —— 通用文本断言（m[0]=第一个捕获组，由 runStep 传入 m.slice(1)） */
step(/^(?:页面|它)包含 "((?:[^"\\]|\\.)*)"$/, (c, m) => {
  expect(c.cur.includes(m[0].replace(/\\"/g, '"')), `${c.name} 缺少文本: ${m[0]}`);
});
step(/^页面不包含 "((?:[^"\\]|\\.)*)"$/, (c, m) => {
  expect(!stripCode(c.cur).includes(m[0].replace(/\\"/g, '"')), `${c.name} 不应出现: ${m[0]}`);
});
step(/^页面匹配正则 (.+)$/, (c, m) => {
  expect(new RegExp(m[0]).test(c.cur), `${c.name} 不匹配正则: ${m[0]}`);
});

/* 首页 */
step(/^首页呈现 8 张领域卡$/, c => {
  const n = (c.samples.home.match(/class="cat-card"/g) || []).length;
  expect(n === 8, `领域卡数量=${n}，应为 8`);
});
step(/^首页包含热门排行与分页入口$/, c => {
  expect(c.samples.home.includes('hotlist'), '首页缺热门排行 hotlist');
  expect(c.samples.home.includes('more-posts'), '首页缺分页入口 more-posts');
});

/* 两级导航 */
step(/^侧栏渲染领域组与细分折叠组$/, c => {
  expect(c.cur.includes('sidegroup') && c.cur.includes('sg-sub') && c.cur.includes('sg-items2'), `${c.name} 侧栏缺两级结构`);
});
step(/^当前页侧栏只渲染当前领域组$/, c => {
  const n = (c.cur.match(/class="sidegroup"/g) || []).length;
  expect(n === 1, `${c.name} 侧栏领域组=${n}，应为 1`);
});

/* 搜索 */
step(/^search\.json 条目数至少 1100 且分组去重为 8$/, c => {
  expect(c.samples.search.length >= 1100, `search.json 条目=${c.samples.search.length}`);
  expect(new Set(c.samples.search.map(x => x.group)).size === 8, 'search.json 分组去重 != 8');
  expect(c.samples.search.every(x => x.title && x.url && x.group), 'search.json 条目缺 title/url/group');
});

/* RSS */
step(/^atom\.xml 至多 20 个 entry 且为摘要模式$/, c => {
  const n = (c.samples.atom.match(/<entry>/g) || []).length;
  expect(n > 0 && n <= 20, `atom entry=${n}`);
  expect(!c.samples.atom.includes('<content type="html">'), 'atom 不应为全文模式');
  expect(c.samples.atom.includes('https://zeek-zhao.github.io/posts/'), 'atom entry 链接非规范地址');
});

/* SEO / 结构化数据 */
step(/^canonical 与 Open Graph 与 Twitter Card 齐全$/, c => {
  expect(c.cur.includes('rel="canonical"'), '缺 canonical');
  expect(c.cur.includes('property="og:type"'), '缺 og:type');
  expect(c.cur.includes('name="twitter:card"'), '缺 twitter:card');
});
step(/^sitemap 与 robots 存在且 robots 指向 sitemap$/, c => {
  expect(c.samples.sitemap.includes('<urlset'), 'sitemap.xml 缺 urlset');
  expect(c.samples.robots.includes('Sitemap: https://zeek-zhao.github.io/sitemap.xml'), 'robots 缺 Sitemap 行');
});
step(/^首页含 WebSite 结构化数据$/, c => {
  const m = c.samples.home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  expect(m, '首页缺 JSON-LD');
  const ld = JSON.parse(m[1]);
  expect(ld['@type'] === 'WebSite' && ld.url === 'https://zeek-zhao.github.io/', 'WebSite JSON-LD 字段不符');
});
step(/^文章含 BlogPosting 与 BreadcrumbList 结构化数据$/, c => {
  const lds = [...c.cur.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(x => JSON.parse(x[1]));
  const post = lds.find(x => x['@type'] === 'BlogPosting');
  const crumb = lds.find(x => x['@type'] === 'BreadcrumbList');
  expect(post && post.headline && post.author.name === 'zeek.zhao' && post.url.startsWith('https://zeek-zhao.github.io/posts/'), 'BlogPosting 字段不符');
  expect(crumb && crumb.itemListElement.length >= 3, 'BreadcrumbList 层级不足');
});

/* 字数统计 */
step(/^文章 meta 显示字数与阅读时长$/, c => {
  const m = /meta-wc[^>]*>·\s*(\d+) 字 · 约 (\d+) 分钟</.exec(c.cur);
  expect(m, `${c.name} 缺 meta-wc 字数`);
  expect(Number(m[1]) > 0 && Number(m[2]) >= 1, '字数/时长数值异常');
});
step(/^页脚显示全站总字数$/, c => {
  const m = /site-wc[^>]*>全站 ([\d,]+) 字</.exec(c.cur);
  expect(m && Number(m[1].replace(/,/g, '')) > 100000, `页脚全站字数异常: ${m && m[1]}`);
});

/* 移动端 */
step(/^移动端适配三件套齐全$/, c => {
  expect(c.cur.includes('width=device-width'), '缺 viewport meta');
  expect(c.samples.css.includes('@media (max-width:560px)'), 'css 缺 560px 断点');
  expect(c.samples.css.includes('min-width:44px') || c.samples.css.includes('44px'), 'css 缺触摸目标尺寸');
  expect(c.samples.css.includes('overflow-x:auto'), '宽表格缺横向滚动');
});

/* 装饰层 */
step(/^live2d 与 BGM 按配置正确装配$/, c => {
  expect(/"mascot":true/.test(c.cur), 'ZEEK_CFG mascot 未开启');
  expect(c.samples.js.includes('live2d-widget'), 'main.js 缺 live2d 加载');
  expect(c.samples.css.includes('#waifu'), 'css 缺 #waifu 定位规则');
  /* 第九轮起 bgm 已配置：按钮渲染但初始 hidden（由 main.js 判定后显示） */
  expect(c.cur.includes('id="bgmBtn"') && c.cur.includes('hidden'), 'BGM 配置时按钮应渲染且初始隐藏');
});
step(/^KaTeX 与 mermaid 渲染通道就绪$/, c => {
  expect(/"katex":true/.test(c.cur) && /"mermaid":true/.test(c.cur), 'ZEEK_CFG 渲染开关未开启');
  expect(c.samples.js.includes('katex') && c.samples.js.includes('mermaid'), 'main.js 缺渲染加载器');
});

/* Obsidian 方言 */
step(/^模板文章的方言语法全部转换$/, c => {
  const h = c.samples.article;
  expect((h.match(/class="callout /g) || []).length >= 10, 'callout 转换不足');
  expect(h.includes('<mark>'), '缺高亮 mark');
  expect(h.includes('footnotes') && h.includes('fnref'), '缺脚注区');
  expect((h.match(/<div class="mermaid"/g) || []).length === 2, `mermaid div 数=${(h.match(/<div class="mermaid"/g) || []).length}，应为 2`);
  expect((h.match(/type="checkbox"/g) || []).length >= 3, '任务列表 checkbox 不足');
  expect(h.includes('class="katex"') || h.includes('katex'), '缺 KaTeX 容器');
});

/* 未发布门禁 */
step(/^全站无黑名单目录与未发布内容泄露$/, c => {
  const files = walk(PUB, []);
  const bad = files.filter(f => /[\\\/](99-Archive|90-OB工程管理|00-Inbox|10-灵感)[\\\/]/.test(f));
  expect(bad.length === 0, `黑名单目录泄漏 ${bad.length} 个: ${bad.slice(0, 3).join(', ')}`);
  const titles = c.samples.search.map(x => x.title);
  const leaked = titles.filter(t => /体检报告|工作笔记|srvkit/.test(t));
  expect(leaked.length === 0, `search.json 泄漏内部标题: ${leaked.slice(0, 3).join(', ')}`);
});

/* 评论 */
step(/^文章页含 giscus 评论容器与配置注入$/, c => {
  expect(c.cur.includes('giscusWrap') && c.cur.includes('giscusBox'), '缺 giscus 容器');
  expect(c.cur.includes('R_kgDOOQtDmA'), '缺 giscus repoId 注入');
});

/* 分页 */
step(/^归档第 2 页可经分页链接到达$/, c => {
  const p2 = read(path.join(PUB, 'archives', 'page', '2', 'index.html'));
  expect(p2.includes('index-pager'), '归档第 2 页缺分页导航');
});

/* 第九轮：横排分页 / 搜索高亮 / 电台播放器 / pjax / 统计 */
step(/^分页导航为横排布局$/, c => {
  const css = c.samples.css;
  expect(!/\.index-pager\{[^}]*flex-direction:column/.test(css), 'index-pager 仍为纵向 flex（页码会竖排）');
  expect(css.includes('.index-pager{margin:24px 0 6px;text-align:center}'), 'index-pager 未改为横排居中');
  const p2 = read(path.join(PUB, 'page', '2', 'index.html'));
  expect((p2.match(/class="page-number/g) || []).length >= 3, '首页第 2 页页码数不足');
  const a2 = read(path.join(PUB, 'archives', 'page', '2', 'index.html'));
  expect(a2.includes('index-pager'), '归档第 2 页缺分页导航');
});
step(/^搜索结果对命中关键词高亮$/, c => {
  expect(c.samples.js.includes('escHl') && c.samples.js.includes('mark class="hl"'), 'main.js 缺高亮渲染');
  expect(c.samples.css.includes('mark.hl'), 'css 缺 mark.hl 样式');
});
step(/^电台节目单静态化且含 500 集以上$/, c => {
  const p = path.join(PUB, 'bgm', 'playlist.json');
  expect(fs.existsSync(p), 'public/bgm/playlist.json 不存在');
  const j = JSON.parse(read(p));
  expect(j.count >= 500 && j.tracks.length >= 500, `节目单条目=${j.count}`);
  expect(j.tracks.every(t => t.id && t.name && t.dur > 0), '节目单条目字段不全');
});
step(/^页面注入电台播放器配置与统计配置$/, c => {
  expect(/"bgm":"\/bgm\/playlist.json"/.test(c.cur), 'ZEEK_CFG bgm 未指向节目单');
  expect(/"analytics":"goatcounter-zeek-zhao"/.test(c.cur), 'ZEEK_CFG analytics 未配置');
  expect(c.cur.includes('id="bgmBtn"'), '缺 BGM 按钮');
});
step(/^主配置已启用电台与 GoatCounter$/, c => {
  const cfg = read(path.join(__dirname, '..', '_config.yml'));
  expect(/bgm:\s*"\/bgm\/playlist\.json"/.test(cfg), '_config.yml bgm 未指向节目单');
  expect(/analytics:\s*"goatcounter-zeek-zhao"/.test(cfg), '_config.yml analytics 未配置');
});
step(/^main\.js 装配 pjax 导航与 GoatCounter 切页上报$/, c => {
  const js = c.samples.js;
  expect(js.includes('DOMParser') && js.includes('pushState') && js.includes('popstate'), 'main.js 缺 pjax 引擎');
  expect(js.includes('goatcounter.count'), 'main.js 缺 pjax 切页统计上报');
});
step(/^main\.js 装配电台播放器与断点续播$/, c => {
  const js = c.samples.js;
  expect(js.includes('bgm-state') && js.includes('loop1') && js.includes('bgm-panel'), 'main.js 缺播放器/续播/面板');
  expect(c.samples.css.includes('.bgm-panel'), 'css 缺播放器面板样式');
});
step(/^文档含转换命名指南与功能原理解析$/, c => {
  const d = path.join(__dirname, '..', 'docs');
  ['OB转换与命名指南.md', '功能原理解析.md', 'README.md'].forEach(f => {
    expect(fs.existsSync(path.join(d, f)), '缺文档 ' + f);
  });
});

/* ---------- 解析并执行 feature ---------- */
function parseFeature(text) {
  const lines = text.split(/\r?\n/);
  const feature = { name: '', scenarios: [] };
  let cur = null;
  for (const ln of lines) {
    const t = ln.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith('Feature:')) { feature.name = t.slice(8).trim(); continue; }
    if (t.startsWith('Scenario:')) { cur = { name: t.slice(9).trim(), steps: [] }; feature.scenarios.push(cur); continue; }
    if (cur && /^(Given|When|Then|And|But)\s/.test(t)) cur.steps.push(t.replace(/^(Given|When|Then|And|But)\s+/, ''));
  }
  return feature;
}
function runStep(ctx, text) {
  const exact = STEPS.find(s => s.pattern.source === '^' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
  if (exact) return exact.fn(ctx, []);
  for (const s of STEPS) {
    const m = new RegExp(s.pattern.source, 'i').exec(text);
    if (m && s.pattern.source !== '^' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') return s.fn(ctx, m.slice(1));
  }
  throw new Error('未注册步骤: ' + text);
}
function main() {
  if (!fs.existsSync(PUB)) { console.error('public/ 不存在，先运行构建'); process.exit(1); }
  const features = fs.readdirSync(FEAT_DIR).filter(f => f.endsWith('.feature'))
    .map(f => parseFeature(read(path.join(FEAT_DIR, f))));
  let scPass = 0, scFail = 0;
  for (const f of features) {
    console.log('\nFeature: ' + f.name);
    for (const sc of f.scenarios) {
      const ctx = {};
      try {
        for (const st of sc.steps) runStep(ctx, st);
        scPass++; console.log('  ✓ ' + sc.name);
      } catch (e) {
        scFail++; console.log('  ✗ ' + sc.name + '\n      ' + e.message);
      }
    }
  }
  console.log(`\n===== BDD 汇总：Scenario PASS ${scPass} / FAIL ${scFail} =====`);
  process.exitCode = scFail ? 1 : 0;
}
main();


