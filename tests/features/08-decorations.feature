Feature: 装饰层
  作为博客访客
  我希望站点有克制的装饰与渲染增强
  且装饰可按配置开关、失败不影响阅读

  Scenario: live2d 形象与背景音乐装配
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then live2d 与 BGM 按配置正确装配

  Scenario: 数学公式与图表渲染通道
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then KaTeX 与 mermaid 渲染通道就绪
