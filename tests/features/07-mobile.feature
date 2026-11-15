Feature: 移动端适配
  作为手机访客
  我希望在小屏上获得可操作的布局
  包括抽屉导航、可点击目标与表格滚动

  Scenario: 移动端基础三件套
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then 移动端适配三件套齐全

  Scenario: 移动端抽屉与触摸目标
    Given 从 public 收集页面样本（首页、文章、分类、about、404、RSS、sitemap、robots、search）
    When 访问首页
    Then 页面包含 "mobileNav"
    And 页面匹配正则 menuBtn|drawer
