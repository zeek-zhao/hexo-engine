#!/usr/bin/env node
/**
 * CAT-06：分类计数与归属对账（只读，不改任何文件）
 *
 * 对账双方（均由 collect.js 生成，正常应一致）：
 *   A. 声称计数：source/tags/index.md 与 source/categories/index.md 里
 *      <a class="tagbig" href="/tags/<名称>/">名称<b>N</b></a> 的 N
 *   B. 实际归属：source/_posts 下已发布文章 front-matter 的 tags / categories 逐个统计
 *
 * 漂移 = 同一名称 A.N != B.N。漂移意味着统计页与文章归属脱节（如手改产物、覆盖、漏生成）。
 *
 * 用法：
 *   node bin/audit-category-count.js            # 输出报告到 stdout
 *   node bin/audit-category-count.js --strict   # 有漂移则退出码 1（供 CI 门禁）
 *
 * 设计原则：只读；不碰 published；不改正文；不改产物。
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const ROOT = process.cwd();
const POSTS = path.join(ROOT, 'source', '_posts');
const strict = process.argv.includes('--strict');

function walk(dir) {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
const flat = (v) => Array.isArray(v) ? v.flat(Infinity).map(String) : (v ? [String(v)] : []);

// B. 实际归属
// hexo 两级分类 [[领域, 细分]]：统计页 tagbig 渲染的是【细分】，领域计数在 <summary> 的 cnt。
// 因此细分对账取 categories 的叶子；领域另统计，用于和 summary.cnt 对账。
const catActual = new Map(), groupActual = new Map(), tagActual = new Map();
let articleCount = 0;
for (const f of walk(POSTS)) {
  // 排除 collect 自动生成的派生页（短链映射页）：它不在 report.map 里，统计页不含它，
  // 却带 tags/categories，会造成 +1 系统性假漂移。
  if (path.basename(f) === 'post-map.md') continue;
  let fm;
  try { fm = matter(fs.readFileSync(f, 'utf8')).data; } catch (e) { continue; }
  articleCount++;
  const cats = flat(fm.categories).filter(Boolean);
  if (cats.length) {
    const leaf = cats[cats.length - 1];
    catActual.set(leaf, (catActual.get(leaf) || 0) + 1);
    groupActual.set(cats[0], (groupActual.get(cats[0]) || 0) + 1);
  }
  for (const t of flat(fm.tags).filter(Boolean)) tagActual.set(t, (tagActual.get(t) || 0) + 1);
}

// A. 声称计数：解析统计页 index.md 的 href（按 encodeURIComponent 名称）+ <b>N</b>
function claimed(file) {
  const m = new Map();
  if (!fs.existsSync(file)) return m;
  const html = fs.readFileSync(file, 'utf8');
  // 取 <a class="tagbig"> 的可见文本（原始名称，HTML 转义前）作为 key，与 frontmatter 对齐。
  // 不取 href 末段：href 已按 hexo slug 化（C++→C、CI/CD→CI-CD），反解不回原名。
  const re = /<a class="tagbig" href="[^"]+">([\s\S]*?)<b>(\d+)<\/b><\/a>/g;
  let mm;
  while ((mm = re.exec(html))) {
    try {
      const name = mm[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
      m.set(name, Number(mm[2]));
    } catch (e) { /* 跳过异常项 */ }
  }
  return m;
}
const catClaimed = claimed(path.join(ROOT, 'source', 'categories', 'index.md'));
const tagClaimed = claimed(path.join(ROOT, 'source', 'tags', 'index.md'));

console.log('=== CAT-06 分类计数与归属对账（只读）===');
console.log(`已发布文章(source/_posts): ${articleCount} 篇`);
console.log(`实际归属: 分类 ${catActual.size} / 标签 ${tagActual.size}`);
console.log(`统计页声称: 分类 ${catClaimed.size} / 标签 ${tagClaimed.size}`);

let drift = 0;
const compare = (label, claim, actual) => {
  for (const [k, n] of claim) {
    const a = actual.get(k);
    if (a === undefined) { console.log(`  [漂移] ${label}「${k}」统计页=${n} 实际=0（统计页有、文章无）`); drift++; }
    else if (a !== n) { console.log(`  [漂移] ${label}「${k}」统计页=${n} 实际=${a}`); drift++; }
  }
  for (const [k, a] of actual) {
    if (!claim.has(k)) { console.log(`  [漂移] ${label}「${k}」统计页=0 实际=${a}（文章有、统计页无）`); drift++; }
  }
};
if (catClaimed.size || tagClaimed.size) {
  compare('分类', catClaimed, catActual);
  compare('标签', tagClaimed, tagActual);
} else {
  console.log('  [提示] 未找到统计页 index.md 或无 tagbig 标记，跳过自动对账。');
}
// 领域计数对账：统计页 <summary>📁 领域<span class="cnt">N 篇</span>
const groupClaimed = new Map();
const catIdx = path.join(ROOT, 'source', 'categories', 'index.md');
if (fs.existsSync(catIdx)) {
  const html = fs.readFileSync(catIdx, 'utf8');
  const re = /<summary>📁\s*([^<]+?)<span class="cnt">(\d+) 篇<\/span><\/summary>/g;
  let mm;
  while ((mm = re.exec(html))) groupClaimed.set(mm[1].trim(), Number(mm[2]));
}
compare('领域', groupClaimed, groupActual);

console.log(`对账漂移: ${drift} 处`);
console.log(drift === 0 ? 'PASS: 分类计数与归属一致' : 'WARN: 存在计数漂移，请人工核对');
if (strict && drift > 0) process.exit(1);
