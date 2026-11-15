Feature: 未发布内容保护与容错
  作为站主
  我希望草稿与内部文档绝不出现在公开站点
  且 404 页面保持完整可用

  Scenario: 黑名单目录与内部标题零泄漏
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then 全站无黑名单目录与未发布内容泄露

  Scenario: 404 页完整
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问 404 页
    Then 页面包含 "topnav"
    And 页面包含 "404"

  Scenario: 关于页项目清单
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问关于页
    Then 页面包含 "yp-distro"
    And 页面匹配正则 rel="noopener noreferrer"
