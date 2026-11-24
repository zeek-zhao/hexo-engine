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
  // 构建期缓存：layout/post/index/archive/category 每页都调用本 helper，
  // 无缓存时每页都全量遍历 site.categories + site.posts → O(页面数×文章数)，
  // 1500 篇时约 225 万次遍历，是 hexo generate 卡死（CPU 100%/内存暴涨）的根因。
  // site 对象在单次构建中不变，缓存一次跨页共享（与 sortedPosts 同策略）。
  if (site._zeekCatTree) return site._zeekCatTree;
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
  site._zeekCatTree = { roots, childrenOf, byLeaf, rootOf };
  return site._zeekCatTree;
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
  // 构建期缓存：页脚「全站字数」在 layout.ejs 中被每一页调用，
  // 无缓存时每页都遍历全站文章做 wordCount（O(页面数×文章数) 正则），
  // 与 catTree 同为 hexo generate 卡死主因。构建期 site 不变，只算一次。
  if (site._zeekSiteWords !== undefined) return site._zeekSiteWords;
  let sum = 0;
  site.posts.each((p) => { sum += wordCount(p.content); });
  site._zeekSiteWords = sum;
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

/* 主题辅助：系列内上一篇/下一篇 —— 已弃用（DEPRECATED，保留仅为兼容历史引用）。
 * 运行时方案（本 helper，第十三轮）依赖 p.source 数字前缀在构建期排序，CI 与本地内容源
 * 版本不同步时排序键失效，线上 ros2/00 曾跨系列乱跳（上一篇跳 34-安全与权限），而 CI
 * check-pages/BDD 不校验 pager 内容故未拦截。post.ejs 已改用 collect.js 收集期注入的
 * prev_post/next_post frontmatter 字段（同一份 collect.js 在 CI/本地生成，结果必然一致）。
 * 规则见 05 规范 §6.2、实现见 bin/collect.js 的 extractSeriesNav()。请勿在新模板调用本 helper。 */
hexo.extend.helper.register('seriesPosts', function (site, page) {
  const cs = [];
  if (page.categories) page.categories.each((c) => cs.push(c));
  const leaf = cs.length ? cs[cs.length - 1] : null;
  if (!leaf) return { prev: null, next: null, series: null };

  if (!site._zeekSeries) site._zeekSeries = new Map();
  if (!site._zeekSeries.has(leaf._id)) {
    const sibs = [];
    site.posts.each((p) => {
      const pcs = [];
      p.categories.each((c) => pcs.push(c));
      if (pcs.length && pcs[pcs.length - 1]._id === leaf._id) sibs.push(p);
    });
    // 数字前缀升序。注意 title 可能带系列名前缀（如 "ros2 03-核心概念"、"apollo 00-索引"），
    // 不能直接 /^(\d+)/；改用 source 文件名（NN-xxx.md）提取，再兜底匹配 title 中任意位置的 NN-。
    const numOf = (p) => {
      const base = String(p.source || '').split('/').pop();
      let m = base.match(/^(\d+)/);
      if (!m) m = String(p.title || '').match(/(?:^|\s)(\d+)[-－]/);
      return m ? parseInt(m[1], 10) : 9999;
    };
    sibs.sort((a, b) => numOf(a) - numOf(b) || String(a.title).localeCompare(String(b.title), 'zh'));
    site._zeekSeries.set(leaf._id, sibs);
  }
  const sibs = site._zeekSeries.get(leaf._id);
  const idx = sibs.findIndex((p) => p.path === page.path);
  return {
    series: leaf.name,
    prev: idx > 0 ? sibs[idx - 1] : null,
    next: idx >= 0 && idx < sibs.length - 1 ? sibs[idx + 1] : null
  };
});
