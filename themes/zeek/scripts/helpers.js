/* 主题辅助：解析文章正文 h2/h3 → 稳定 id + 目录数据。
 * layout.ejs（TOC 侧栏）与 post.ejs（正文）共用同一函数，保证两侧 id 一致；
 * 正文侧同时注入原型同款 .hlink（hover 出现的 ¶ 锚点链接）。 */
hexo.extend.helper.register('heads', function (content) {
  const heads = [];
  const body = String(content || '').replace(/<h([23])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/g,
    (m, lvl, attrs, inner) => {
      const idm = /id="([^"]*)"/.exec(attrs);
      const id = idm ? idm[1] : 'h-' + heads.length;
      heads.push({ level: Number(lvl), id, text: inner.replace(/<[^>]+>/g, '').trim() });
      return '<h' + lvl + attrs + ' id="' + id + '">' + inner +
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
