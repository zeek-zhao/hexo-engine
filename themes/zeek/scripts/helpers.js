/* 主题辅助：解析文章正文 h2/h3 → 稳定 id + 目录数据。
 * layout.ejs（TOC 侧栏）与 post.ejs（正文）共用同一函数，保证两侧 id 一致；
 * 正文侧同时注入原型同款 .hlink（hover 出现的 ¶ 锚点链接）。 */
hexo.extend.helper.register('heads', function (content) {
  const heads = [];
  const body = String(content || '').replace(/<h([23])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/g,
    (m, lvl, attrs, inner) => {
      // 清单 #11：hexo-renderer-marked 会在标题内注入 <a class="headerlink">…</a>（renderer.js:59），
      // 与主题 ¶ 锚点并存导致“标题渲染两遍”的视觉重复。这里先剥掉 headerlink，只留主题 hlink。
      // 注意不能靠 _config.yml 的 headerIds:false 关它——那会连 slug id 一起去掉，破坏 heads/TOC 的 id 一致性。
      inner = inner.replace(/<a\s+href="#[^"]*"\s+class="headerlink"[^>]*><\/a>/g, '');
      const idm = /id="([^"]*)"/.exec(attrs);
      const id = idm ? idm[1] : 'h-' + heads.length;
      heads.push({ level: Number(lvl), id, text: inner.replace(/<[^>]+>/g, '').trim() });
      // attrs 已带 id（hexo-renderer-marked 生成的 slug id）时不再追加，避免重复属性
      const open = idm ? '<h' + lvl + attrs : '<h' + lvl + attrs + ' id="' + id + '"';
      return open + '>' + inner +
        '<a class="hlink" data-h="' + id + '" href="#' + id + '" title="跳到本节">¶</a></h' + lvl + '>';
    });
  return { heads, body };
});

/* 主题辅助：hexo 嵌套分类 → 两级树（roots=领域，childrenOf=细分分类，byLeaf=叶子分类→文章）。
 * layout.ejs（侧栏）、category.ejs（面包屑）、archive.ejs（chips 分组）共用，保证树结构一致。
 * 前提：collect.js v7 已注入 [[领域, 细分]] 嵌套 categories（OB-ENG-SOP-06）。 */
hexo.extend.helper.register('catTree', function (site) {
  const all = [];
  site.categories.each((c) => all.push(c));
  const byId = new Map(all.map((c) => [c._id, c]));
  const childrenOf = new Map();
  const roots = [];
  all.forEach((c) => {
    if (c.parent && byId.has(c.parent)) {
      if (!childrenOf.has(c.parent)) childrenOf.set(c.parent, []);
      childrenOf.get(c.parent).push(c);
    } else {
      roots.push(c);
    }
  });
  const byCount = (a, b) => b.length - a.length || a.name.localeCompare(b.name, 'zh');
  roots.sort(byCount);
  childrenOf.forEach((arr) => arr.sort(byCount));
  const byLeaf = new Map();
  site.posts.each((p) => {
    const cs = [];
    p.categories.each((c) => cs.push(c));
    const leaf = cs.length ? cs[cs.length - 1] : null; // categories 路径最后一个 = 细分分类
    if (leaf) {
      if (!byLeaf.has(leaf._id)) byLeaf.set(leaf._id, []);
      byLeaf.get(leaf._id).push(p);
    }
  });
  const rootOf = (cat) => {
    let c = cat;
    while (c && c.parent && byId.has(c.parent)) c = byId.get(c.parent);
    return c || null;
  };
  return { roots, childrenOf, byLeaf, rootOf };
});

/* 主题辅助：字数统计（中文按字、西文按词，剥 HTML 标签与实体后计数）。
 * post.ejs（单篇字数/阅读时长）、layout.ejs（页脚全站总字数）共用，保证口径一致。
 * 阅读时长按中文 400 字/分钟估算，至少 1 分钟。 */
function wordCount(content) {
  const t = String(content || '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ');
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const lat = (t.match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + lat;
}
hexo.extend.helper.register('wordCount', wordCount);
hexo.extend.helper.register('readMin', function (content) {
  return Math.max(1, Math.ceil(wordCount(content) / 400));
});
hexo.extend.helper.register('siteWords', function (site) {
  let sum = 0;
  site.posts.each((p) => { sum += wordCount(p.content); });
  return sum;
});

/* 主题辅助：全站文章显式排序（上一篇/下一篇的唯一定序依据）。
 * hexo 内置 page.prev/next 的顺序在同日期文章间不稳定（本库大量文章同日导入），
 * 且方向与首页列表阅读流相反。这里统一为：date 降序，同日期按 path 字母序稳定排序。
 * 结果缓存在 site 对象上（构建期内 site.posts 不再变化，跨页面共享一次排序）。 */
hexo.extend.helper.register('sortedPosts', function (site) {
  if (!site._zeekSorted) {
    site._zeekSorted = site.posts.toArray().slice().sort(function (a, b) {
      const d = (b.date ? b.date.valueOf() : 0) - (a.date ? a.date.valueOf() : 0);
      return d !== 0 ? d : String(a.path).localeCompare(String(b.path));
    });
  }
  return site._zeekSorted;
});
