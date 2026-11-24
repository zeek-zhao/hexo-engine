#!/usr/bin/env node
/**
 * PIP-04（任务 D）：站内链接健康巡检（CI 每次 push/PR 跑）。
 *
 * 扫描 public/ 下所有 HTML 的站内链接（href/src 指向本站根路径），验证目标产物是否存在：
 *   - 站内链接目标文件不存在        → 404（阻断）
 *   - 站内链接指向目录但无 index.html → 404（阻断）
 *   - 外链 / mailto / tel / 锚点 / 数据 URI → 跳过
 * 输出 404 明细；有 404 则 exit 1。发布前拦截坏链。
 *
 * 用法：node bin/check-links.js [--root <public目录>]
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let PUB = path.join(__dirname, '..', 'public');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && args[i + 1]) PUB = path.resolve(args[++i]);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.html$/i.test(e.name)) out.push(p);
  }
  return out;
}

const htmlFiles = walk(PUB);
if (!htmlFiles.length) {
  console.error('[check-links] public/ 下无 HTML，请先 hexo generate');
  process.exit(1);
}

// 站内目标 → 是否存在。URL 去 query/hash、解码。
const cache = new Map();
function targetExists(href) {
  if (cache.has(href)) return cache.get(href);
  let p = href.split(/[?#]/)[0];
  let decoded;
  try { decoded = decodeURIComponent(p); } catch (e) { decoded = p; }
  // 归一：首页 / → index.html；末尾 / → index.html；无扩展名 → 试 .html 与 /index.html
  let rel = decoded.replace(/^\//, '');
  if (!rel) rel = 'index.html';
  const candidates = [];
  if (rel.endsWith('/')) candidates.push(rel + 'index.html', rel.replace(/\/$/, '.html'));
  else if (/\.[a-zA-Z0-9]+$/.test(rel)) candidates.push(rel);
  else candidates.push(rel + '.html', rel + '/index.html');
  const ok = candidates.some((c) => fs.existsSync(path.join(PUB, c)));
  cache.set(href, ok);
  return ok;
}

const broken = [];   // 页面链接 404（阻断）
const missingAssets = []; // 下载类二进制资源缺失（warn，不阻断：多为模板占位链接）
const linkRe = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
for (const file of htmlFiles) {
  const rel = path.relative(PUB, file);
  const html = fs.readFileSync(file, 'utf8');
  let m;
  const seen = new Set();
  while ((m = linkRe.exec(html))) {
    const href = m[1].trim();
    if (!href) continue;
    // 跳过外链/协议相对/锚点/数据/mailto/tel/javascript
    if (/^(https?:)?\/\//i.test(href) || /^(mailto:|tel:|javascript:|data:|#)/i.test(href)) continue;
    if (!href.startsWith('/')) continue; // 相对链接按页面基址，静态难判，跳过
    if (seen.has(href)) continue;
    seen.add(href);
    if (!targetExists(href)) {
      // 下载类二进制/模板资源：只报告不阻断（历史占位链接，非页面级坏链）
      if (/\.(docx?|xlsx?|pptx?|pdf|zip|mpp|pbix)$/i.test(href.split(/[?#]/)[0])) {
        missingAssets.push({ page: rel, href });
      } else {
        broken.push({ page: rel, href });
      }
    }
  }
}

console.log('== 站内链接巡检 (check-links · PIP-04) ==');
console.log(`扫描 HTML ${htmlFiles.length} 个 / 唯一站内链接 ${cache.size} 个 / 页面坏链 ${broken.length} 个 / 资源缺失 ${missingAssets.length} 个`);
if (missingAssets.length) {
  const sample = missingAssets.slice(0, 8);
  sample.forEach((b) => console.log(`  [warn][资源] ${b.page}  →  ${b.href}`));
  if (missingAssets.length > sample.length) console.log(`  ... 另有 ${missingAssets.length - sample.length} 条资源缺失（不阻断）`);
}
if (broken.length) {
  const sample = broken.slice(0, 40);
  sample.forEach((b) => console.log(`  [404] ${b.page}  →  ${b.href}`));
  if (broken.length > sample.length) console.log(`  ... 另有 ${broken.length - sample.length} 条`);
  console.error(`\nFAIL: ${broken.length} 个站内页面坏链`);
  process.exit(1);
}
console.log('PASS: 站内页面链接全部指向有效产物（资源缺失仅 warn）\n');
