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
