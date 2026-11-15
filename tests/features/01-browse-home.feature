Feature: 访客浏览首页
  作为博客访客
  我希望打开首页即看到完整导航与内容概览
  以便快速找到感兴趣的领域

  Scenario: 首页完整呈现
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then 页面包含 "topnav"
    And 页面包含 "sidegroup"
    And 页面包含 "footer"

  Scenario: 首页内容概览
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then 首页呈现 8 张领域卡
    And 首页包含热门排行与分页入口

  Scenario: 首页 SEO 基础
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then canonical 与 Open Graph 与 Twitter Card 齐全
    And 首页含 WebSite 结构化数据
