# hexo-engine

Hexo 装配车间：拉取私有内容库 ob-content，按 frontmatter（`published: true` 且 `status: published`）过滤转换，构建静态页，产物由 CI 推送到 username.github.io。

## 结构

- `bin/collect.js` — 消费端四步转换：识别 → 过滤 → 转换 → 落位（含发布黑名单目录：`99-Archive`/`90-OB工程管理`/`00-Inbox`/`10-灵感`）
- `_config.yml` — Hexo 站点配置（abbrlink 短链，主题 Butterfly）
- `content/` — CI 克隆 ob-content 的位置（gitignore，不入库）

## 本地验证（Docker，WSL 内执行）

```bash
git clone git@github.com:zeek-zhao/ai-obsidian.git content   # 内容库
docker run --rm -v "$PWD":/app -w /app node:20 npm install
docker run --rm -v "$PWD":/app -w /app node:20 npm run build
docker run --rm -p 4000:4000 -v "$PWD":/app -w /app node:20 npx hexo server -i 0.0.0.0
```

浏览器打开 http://localhost:4000 验证。
