#!/usr/bin/env node
/**
 * 私密文章加密（构建后处理，AES-256-GCM + PBKDF2）—— 任务 A
 *
 * 设计原则：
 *   1. 0 篇私密时零行为变化（找不到清单或清单为空 → 直接 PASS 退出）。
 *   2. 口令只从环境变量 CONTENT_PASSWORD 读取，绝不写进任何文件。
 *   3. 每篇独立随机 salt + IV；GCM authTag 保证错误口令不会吐出错误明文。
 *   4. 密文与解密器写入同一 HTML；真实标题/摘要/正文片段全部从 HTML 抹除。
 *   5. 同步把私密文章从 sitemap.xml / search.json / atom.xml / 归档 / 分类页剔除。
 *
 * 私密清单来源：private-list.json（项目根，由 collect.js 生成；不入 source 避免被 hexo 发布）
 *   { "posts": [ { "url": "posts/123456.html", "hint": "可选提示（不含口令）" } ] }
 *
 * 用法（在 hexo generate 之后执行）：
 *   CONTENT_PASSWORD=xxxx node bin/encrypt-private.js
 * 若 CONTENT_PASSWORD 未设置且存在私密文章 → 报错退出（防止误发布明文）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const LIST_FILE = path.join(ROOT, 'private-list.json');
const PASSWORD = process.env.CONTENT_PASSWORD || '';

const ITER = 210000;          // PBKDF2 迭代次数（弱口令缓解，但无法抵抗字典爆破）
const KEYLEN = 32;            // AES-256
const DIGEST = 'sha256';
const PLACEHOLDER_TITLE = '🔒 私密文章';

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function loadList() {
  if (!fs.existsSync(LIST_FILE)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(LIST_FILE, 'utf8'));
    return Array.isArray(j.posts) ? j.posts : [];
  } catch (e) { return []; }
}

function encrypt(plaintext, password, salt, iv) {
  const key = crypto.pbkdf2Sync(password, salt, ITER, KEYLEN, DIGEST);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { enc, tag: cipher.getAuthTag() };
}

// 从 HTML 中剥离：正文 <article>...</article>（或 main），以及 meta/JSON-LD 里的标题摘要正文线索
function sanitize(html, realTitle) {
  let s = html;
  // 抹除对正文的 SEO 暴露：title / meta description / og:title / og:description / twitter
  s = s.replace(/<title>[\s\S]*?<\/title>/, `<title>${PLACEHOLDER_TITLE}</title>`);
  // og:image:alt / 任意属性里的真实标题也要清空（实测残留在 cover alt）
  s = s.replace(/content="[^"]*"/g, (m) => m.includes(realTitle) ? 'content=""' : m);
  // 面包屑 / TOC / 系列导航里的真实标题锚文本全局替换为占位符
  if (realTitle) s = s.split(realTitle).join(PLACEHOLDER_TITLE);
  s = s.replace(/<meta[^>]+name="description"[^>]*>/gi, '<meta name="description" content="这是一篇受保护的私密文章。">');
  s = s.replace(/<meta[^>]+property="og:title"[^>]*>/gi, `<meta property="og:title" content="${PLACEHOLDER_TITLE}">`);
  s = s.replace(/<meta[^>]+property="og:description"[^>]*>/gi, '<meta property="og:description" content="受保护内容">');
  s = s.replace(/<meta[^>]+name="twitter:(title|description)"[^>]*>/gi, '');
  s = s.replace(/<meta[^>]+name="robots"[^>]*>/gi, '');
  // 注入 noindex：搜索引擎不得收录
  s = s.replace(/<\/head>/i, '<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"></head>');
  // 移除 JSON-LD 结构化数据（含 headline/description/正文线索）
  s = s.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');
  return s;
}

// 提取正文 HTML：优先 <article>，退化到 <main>，再退化到 body 内 main 之后
function extractBody(html) {
  let m = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (m) return { body: m[1], re: /<article\b[^>]*>[\s\S]*?<\/article>/i };
  m = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (m) return { body: m[1], re: /<main\b[^>]*>[\s\S]*?<\/main>/i };
  return null;
}

const LOCK_HTML = (hint) => `
<div class="private-lock" data-private-lock>
  <div class="lock-icon">🔒</div>
  <h2>私密文章</h2>
  <p>这篇文章受口令保护。请输入访问口令以阅读。</p>
  ${hint ? `<p class="lock-hint">提示：${esc(hint)}</p>` : ''}
  <form class="lock-form" onsubmit="return false;">
    <input type="password" class="lock-pwd" placeholder="访问口令" autocomplete="off" aria-label="访问口令">
    <button type="button" class="lock-btn">解锁</button>
  </form>
  <p class="lock-err" role="alert"></p>
</div>`;

const UNLOCK_JS = (payload) => `
<script id="private-payload" type="application/json">${payload}</script>
<script>
(function(){
  var box=document.querySelector('[data-private-lock]');
  if(!box) return;
  var d=JSON.parse(document.getElementById('private-payload').textContent);
  var btn=box.querySelector('.lock-btn'), input=box.querySelector('.lock-pwd'), err=box.querySelector('.lock-err');
  function b64(s){return Uint8Array.from(atob(s),function(c){return c.charCodeAt(0)});}
  function done(plaintext){
    var holder=document.createElement('div');
    holder.innerHTML=plaintext;
    box.replaceWith(holder);
    // 恢复本页原本的 JSON-LD / 元信息由调用方在解锁成功回调里注入（可选）
    if(d.onUnlockTitle){document.title=d.onUnlockTitle;}
  }
  async function unlock(){
    err.textContent='';
    try{
      var pwd=input.value||'';
      var km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pwd),'PBKDF2',false,['deriveKey']);
      var salt=b64(d.s), iv=b64(d.iv);
      var key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:salt,iterations:d.iter,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['decrypt']);
      var ct=b64(d.c), tag=b64(d.t);
      var buf=new Uint8Array(ct.length+tag.length);buf.set(ct,0);buf.set(tag,ct.length);
      var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:iv,tagLength:128},key,buf);
      done(new TextDecoder().decode(pt));
    }catch(e){ err.textContent='口令错误，请重试。'; }
  }
  btn.addEventListener('click',unlock);
  input.addEventListener('keydown',function(e){if(e.key==='Enter')unlock();});
})();
</script>`;

function stripFromIndex(files, urls) {
  let removed = 0;
  // 私密文章 URL 集合（含 /posts/xxx.html 与 xxx.html 两种形态）
  const idSet = new Set(urls.map((u) => path.basename(u, '.html')));
  for (const rel of files) {
    const p = path.join(PUBLIC, rel);
    if (!fs.existsSync(p)) continue;
    let s = fs.readFileSync(p, 'utf8');
    const before = s.length;

    // search.json 是 JSON 数组（非 HTML），必须按结构过滤整条记录，
    // 否则私密文章的 title/description/text 会完整残留在站内搜索里（明文泄露）。
    if (rel === 'search.json') {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) {
          const kept = arr.filter((item) => {
            const u = String(item && item.url || '');
            return !idSet.has(path.basename(u, '.html'));
          });
          if (kept.length !== arr.length) {
            fs.writeFileSync(p, JSON.stringify(kept));
            removed++;
            continue;
          }
        }
      } catch (e) {
        console.warn('  [warn] search.json 解析失败，回退文本过滤: ' + e.message);
      }
    }

    for (const u of urls) {
      // 去掉指向私密文章的 <a>/<li>/条目（按 href/url 片段匹配含短链的行）
      const id = path.basename(u, '.html');
      const rx = new RegExp('<a[^>]+href="[^"]*' + id + '[^"]*"[^>]*>[\\s\\S]*?</a>', 'gi');
      s = s.replace(rx, '');
      // sitemap <url><loc>...id.html...</loc></url>
      const rx2 = new RegExp('<url>\\s*<loc>[^<]*' + id + '[^<]*</loc>[\\s\\S]*?</url>', 'gi');
      s = s.replace(rx2, '');
      // atom feed：<entry>...<id>...id.html...</id>...</entry>（含完整 URL）
      const rx3 = new RegExp('<entry>[\\s\\S]*?' + id + '\\.html[\\s\\S]*?</entry>', 'gi');
      s = s.replace(rx3, '');
    }
    if (s.length !== before) { fs.writeFileSync(p, s); removed++; }
  }
  return removed;
}

function main() {
  const list = loadList();
  if (list.length === 0) {
    console.log('[private] 私密清单为空或不存在 → 跳过加密，站点行为不变。');
    console.log('PASS: 0 篇私密文章，无改动。');
    return;
  }
  if (!PASSWORD) {
    console.error('FATAL: 存在 ' + list.length + ' 篇私密文章，但 CONTENT_PASSWORD 未设置，拒绝发布明文。');
    process.exit(2);
  }
  const urls = list.map((x) => x.url);
  let done = 0;
  for (const item of list) {
    const file = path.join(PUBLIC, item.url);
    if (!fs.existsSync(file)) { console.warn('  [skip] 产物不存在: ' + item.url); continue; }
    let html = fs.readFileSync(file, 'utf8');
    const ex = extractBody(html);
    if (!ex) { console.warn('  [skip] 找不到正文区: ' + item.url); continue; }
    // 提取真实标题（在替换前），用于全局抹除面包屑/TOC/og:image:alt 里的标题泄漏
    // <title> 形如「文章标题 · 站点名」；正文锚文本只含文章标题，故取 ' · ' 前的部分
    const tm = html.match(/<title>([\s\S]*?)<\/title>/);
    const fullTitle = tm ? tm[1].trim() : '';
    const realTitle = fullTitle.split(/\s+·\s+/)[0];
    const plaintext = ex.body;
    const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
    const { enc, tag } = encrypt(plaintext, PASSWORD, salt, iv);
    const payload = Buffer.from(JSON.stringify({
      v: 1, s: salt.toString('base64'), iv: iv.toString('base64'),
      c: enc.toString('base64'), t: tag.toString('base64'), iter: ITER,
      onUnlockTitle: '' // 不回写真实标题，避免源码泄露
    })).toString('base64');
    let out = sanitize(html, realTitle);
    out = out.replace(ex.re, LOCK_HTML(item.hint || ''));
    out = out.replace('</body>', UNLOCK_JS(payload) + '</body>');
    fs.writeFileSync(file, out);
    done++;
    console.log('  [encrypted] ' + item.url + ' (' + enc.length + 'B 密文)');
  }
  const idxRemoved = stripFromIndex(['sitemap.xml', 'search.json', 'atom.xml', 'archives/index.html', 'categories/index.html', 'tags/index.html'], urls);
  console.log('[private] 加密 ' + done + '/' + list.length + ' 篇；从 ' + idxRemoved + ' 个索引页剔除链接。');
  console.log('PASS: 私密文章加密完成。');
}
main();
