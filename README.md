# hexo-engine

Hexo 装配车间：拉取私有内容库 [ai-obsidian](https://github.com/zeek-zhao/ai-obsidian)（ob-content），按 frontmatter（`published: true` 且 `status: published`）过滤转换，用自研主题 **zeek** 构建静态站，产物由 CI 推送到 [zeek-zhao.github.io](https://zeek-zhao.github.io)。本仓库为 **public**（暴露面红线见 [AI.md §8](AI.md) 与 05 规范 §5.4），内容库保持 private。

## 结构

- `bin/collect.js` — 消费端四步转换：识别 → 过滤 → 转换 → 落位；同时生成 `search.json`（全站唯一搜索数据源）、post-map、tags/categories 统计页。发布黑名单目录：`99-Archive`/`90-OB工程管理`/`00-Inbox`/`10-灵感`
- `themes/zeek/` — 自研轻主题（原型 `blog-ui-prototype` 1:1 移植，EJS 模板 + 原生 JS/CSS，零额外依赖）：⌘K 搜索、TOC scrollspy、代码块复制、明暗主题三态、阅读进度条、404 页
- `_config.yml` — 站点配置（`permalink: posts/:abbrlink.html` 短链，theme: zeek）
- `docs/` — [URD-01 需求规格](docs/URD-01-需求规格.md) / [SDD-01 概要设计](docs/SDD-01-概要设计.md) / [UI-01 原型说明](docs/UI-01-原型说明.md)
- `AI.md` — **AI 接手入口**（快照、构建、部署、凭据铁律、遗留清单、已知坑）
- `content/` — CI 克隆 ob-content 的位置（gitignore，不入库）
- `.github/workflows/deploy.yml` — push/dispatch/schedule 触发；HTTPS + `secrets.DEPLOY_TOKEN` 拉内容库，构建后 orphan push 到 Pages 仓

## 本地验证

```bash
npm ci                                        # 按锁定版本安装
npm run build                                 # collect + hexo generate（需先有 content/）
npx hexo server                               # http://localhost:4000
```

`content/` 获取（认证方式见 AI.md §6，不要提交到任何仓库）：

```bash
git clone https://github.com/zeek-zhao/ai-obsidian.git content
```

## 发布链

push main（或内容库 dispatch / 每日 schedule）→ Actions 构建 → 推送 gh-pages → https://zeek-zhao.github.io 生效，时效约 2-3 分钟。
