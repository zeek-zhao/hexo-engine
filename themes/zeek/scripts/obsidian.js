/* ============================================================
 * themes/zeek/scripts/obsidian.js — Obsidian 方言转换滤镜
 * hexo-renderer-marked 只认 GFM；Obsidian 的私有语法在渲染前后补齐：
 *
 * before_post_render（fence 感知，跳过 ```/~~~ 围栏与行内代码）：
 *   1) %%注释%%            → 删除（Obsidian 私有注释，不上网页）
 *   2) ==高亮==            → <mark>高亮</mark>
 *   3) [^id] 引用 / 定义    → sup 引用 + 文末脚注列表
 * after_post_render（对渲染后的 HTML 做）：
 *   4) <blockquote> 里的 [!type] callout → 结构化 div（12 类配色，支持 [-]/[+] 折叠）
 *
 * 前提：双链 [[...]] 由 bin/collect.js 的 resolveLink 在收集期处理，这里不重复做；
 * 数学 $..$ 交给客户端 KaTeX（main.js，见 _config.yml zeek 段）。
 * mermaid：hexo 不认识该语言会把围栏降级成 plaintext 代码块，客户端拿不到可渲染节点，
 *   所以这里在渲染前把 ```mermaid 围栏转成原生 <div class="mermaid">（HTML 转义，
 *   去掉块内空行——CommonMark 原生 HTML 块遇空行会提前结束），客户端 mermaid 直接接管。
 * ============================================================ */

/* 只处理围栏与行内代码之外的段落（奇数下标 = 代码段，原样保留） */
function mapOutsideCode(src, fn) {
  return String(src).split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g)
    .map(function (seg, i) { return i % 2 === 1 ? seg : fn(seg); })
    .join('');
}

/* callout 类型 → 图标 / 语义色（CSS 端按 data-callout 取色） */
var CALLOUT_TYPES = ['note', 'abstract', 'info', 'tip', 'success', 'question',
  'warning', 'failure', 'danger', 'bug', 'example', 'quote'];
var CALLOUT_ICON = {
  note: '📝', abstract: '📑', info: 'ℹ️', tip: '🔥', success: '✅',
  question: '❓', warning: '⚠️', failure: '❌', danger: '⚡', bug: '🐞',
  example: '📋', quote: '💬'
};
/* Obsidian 别名 → 规范类型（data-callout 用规范名，CSS 12 色覆盖全集） */
var CALLOUT_ALIAS = {
  summary: 'abstract', tldr: 'abstract', todo: 'info',
  hint: 'tip', important: 'tip',
  check: 'success', done: 'success',
  help: 'question', faq: 'question',
  caution: 'warning', attention: 'warning',
  fail: 'failure', missing: 'failure',
  error: 'danger', cite: 'quote'
};

/* ```mermaid 围栏 → 原生 <div class="mermaid">（行级扫描、围栏感知，嵌套演示不动） */
function convertMermaid(src) {
  var lines = String(src).split(/\r?\n/);
  var out = [];
  var inFence = null; // 当前所处普通围栏的标记（``` 或 ~~~）
  var i = 0;
  while (i < lines.length) {
    var open = /^(`{3,}|~{3,})\s*mermaid\s*$/.exec(lines[i]);
    if (open && !inFence) {
      var fenceCh = open[1][0];
      var fenceLen = open[1].length;
      var closeRe = new RegExp('^' + fenceCh + '{' + fenceLen + ',}\\s*$');
      var body = [];
      i++;
      var closed = false;
      while (i < lines.length) {
        if (closeRe.test(lines[i])) { closed = true; break; }
        body.push(lines[i]); i++;
      }
      if (closed) {
        var kept = body.filter(function (l) { return l.trim() !== ''; });
        out.push('<div class="mermaid">');
        kept.forEach(function (l) {
          out.push(l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        });
        out.push('</div>');
        i++; // 跳过闭合围栏
      } else {
        // 未闭合：原样吐回，交给 hexo 按普通围栏处理
        out.push(lines[i - body.length - 1]);
        out.push.apply(out, body);
      }
      continue;
    }
    // 普通围栏进出跟踪（记录记号与长度：```` 不会被 ``` 闭合误判）
    var any = /^(`{3,}|~{3,})/.exec(lines[i]);
    if (any && !inFence) inFence = { ch: any[1][0], n: any[1].length };
    else if (inFence && new RegExp('^' + inFence.ch + '{' + inFence.n + ',}\\s*$').test(lines[i])) inFence = null;
    out.push(lines[i]);
    i++;
  }
  return out.join('\n');
}

hexo.extend.filter.register('before_post_render', function (data) {
  var fns = [];

  data.content = mapOutsideCode(data.content, function (seg) {
    /* 1) Obsidian 注释 %%..%%（含跨行）→ 删 */
    seg = seg.replace(/%%[\s\S]*?%%/g, '');

    /* 2) ==高亮== → <mark>（避免误伤 a==b 等比较：要求两侧非 =、非字母数字紧贴） */
    seg = seg.replace(/==([^=\n][^=\n]*?)==/g, '<mark>$1</mark>');

    /* 3) 脚注：定义行先摘出来，引用就地换 sup（渲染后再由文末统一追加列表） */
    seg = seg.replace(/^\[\^([^\]\s]+)\]:\s*(.+)$/gm, function (m, id, text) {
      fns.push({ id: id, text: text.trim() });
      return '';
    });
    seg = seg.replace(/\[\^([^\]\s]+)\]/g, function (m, id) {
      return '<sup class="fnref" id="fnref-' + id + '"><a href="#fn-' + id + '">[' + id + ']</a></sup>';
    });
    return seg;
  });

  /* mermaid 围栏转原生 div（放最后：先让 %%/==/脚注 滤镜在原围栏形态下工作） */
  data.content = convertMermaid(data.content);

  if (fns.length) {
    data.content += '\n\n<section class="footnotes" id="footnotes">\n\n---\n\n<ol class="fnlist">\n' +
      fns.map(function (f) {
        return '<li id="fn-' + f.id + '">' + f.text + ' <a class="fnback" href="#fnref-' + f.id + '">↩</a></li>';
      }).join('\n') + '\n</ol>\n\n</section>\n';
  }
  return data;
}, 1); // 优先级 1：必须先于 hexo 内置 backtick_code_block（默认 10）跑，否则围栏已被内置滤镜转成高亮 HTML，mermaid/%%/== 都来不及处理

/* callout：渲染后的 <blockquote> 首行以 [!type] 开头 → 结构化 div
 * 标记格式：> [!note] 标题 / > [!note]- 折叠默认收起 / > [!note]+ 折叠默认展开 */
hexo.extend.filter.register('after_post_render', function (data) {
  data.content = String(data.content).replace(
    /<blockquote>([\s\S]*?)<\/blockquote>/g,
    function (whole, inner) {
      var m = /^\s*(?:<p>)?\s*\[!(\w+)\]([+-]?)\s*(.*?)(?:<\/p>)/.exec(inner);
      if (!m) return whole;
      var type = m[1].toLowerCase();
      type = CALLOUT_ALIAS[type] || type;
      if (CALLOUT_TYPES.indexOf(type) === -1) return whole;
      var fold = m[2];                 // '' 非折叠 | '-' 收起 | '+' 展开
      var title = m[3].trim() || type.toUpperCase();
      var body = inner.slice(m[0].length).replace(/^\s*\n/, '');
      var head = '<span class="callout-ico">' + CALLOUT_ICON[type] + '</span>' +
        '<span class="callout-title-inner">' + title + '</span>';
      if (fold) {
        return '<details class="callout ' + type + '" data-callout="' + type + '"' +
          (fold === '+' ? ' open' : '') + '><summary class="callout-title">' + head +
          '<span class="callout-fold">▾</span></summary><div class="callout-body">' +
          body + '</div></details>';
      }
      return '<div class="callout ' + type + '" data-callout="' + type + '">' +
        '<div class="callout-title">' + head + '</div><div class="callout-body">' +
        body + '</div></div>';
    });
  return data;
});
