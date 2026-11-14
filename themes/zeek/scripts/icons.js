/* ============================================================
 * themes/zeek/scripts/icons.js — 分类图标 helper
 * 图标数据源 = 内容库受控文档 06-分类映射.json（OB-ENG-SOP-06）的
 * groupIcons（领域）与 icons（细分分类）两张表；改图标只改 JSON。
 * 文件缺失或字段缺失时一律回退 📁，构建不失败（与 AC-16 同思路）。
 * ============================================================ */
hexo.extend.helper.register('catIcon', function (name) {
  var M = moduleData();
  if (!M || !name) return '📁';
  return (M.icons && M.icons[name]) || (M.groupIcons && M.groupIcons[name]) || '📁';
});

/* 读映射 JSON（缓存一次）；路径：hexo 根/content/90-OB工程管理/方案/06-分类映射.json */
var _cache = null;
function moduleData() {
  if (_cache !== null) return _cache;
  try {
    var fs = require('fs');
    var path = require('path');
    var p = path.join(hexo.base_dir, 'content', '90-OB工程管理', '方案', '06-分类映射.json');
    _cache = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    hexo.log.warn('06-分类映射.json 读取失败，分类图标回退默认 📁：%s', e.message);
    _cache = {};
  }
  return _cache;
}
