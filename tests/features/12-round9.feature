Feature: 第九轮 · 横排分页 / 搜索高亮 / 电台播放器 / pjax / 统计

Scenario: 分页数字横向排成一行
  Given 已构建的站点 public 目录
  When 访问首页
  Then 分页导航为横排布局

Scenario: 搜索结果对命中关键词高亮
  Given 已构建的站点 public 目录
  When 访问首页
  Then 搜索结果对命中关键词高亮

Scenario: 网易云电台节目单已静态化
  Given 已构建的站点 public 目录
  Then 电台节目单静态化且含 500 集以上

Scenario: 播放器与统计配置注入页面
  Given 已构建的站点 public 目录
  When 访问首页
  Then 页面注入电台播放器配置与统计配置
  And 主配置已启用电台与 GoatCounter

Scenario: 站内导航不中断播放且切页上报统计
  Given 已构建的站点 public 目录
  When 访问首页
  Then main.js 装配 pjax 导航与 GoatCounter 切页上报
  And main.js 装配电台播放器与断点续播

Scenario: 转换指南与原理文档入库
  Given 已构建的站点 public 目录
  Then 文档含转换命名指南与功能原理解析
