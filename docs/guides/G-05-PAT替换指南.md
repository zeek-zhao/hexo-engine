# PAT 替换指南（从超管 classic PAT 到最小权限 fine-grained PAT）

> 受控文档 OB-ENG-WEB-PAT v1.0（2026-11-15）。对应 05 规范 §5.1 的遗留项：当前 `NOTIFY_TOKEN` / `DEPLOY_TOKEN` 两个 Actions secret 都临时复用一把 **classic PAT（权限近超管：repo + workflow + admin:* 等）**。本文给出替换到 **fine-grained PAT（最小权限）** 的完整步骤。全程只需网页操作，约 5 分钟。

## 1. 为什么值得换

| | classic PAT（现状） | fine-grained PAT（目标） |
|---|---|---|
| 权限粒度 | 按权限域（repo 域 = 全部仓库读写） | 按仓库 + 按权限逐项勾选 |
| 泄漏影响面 | 全账号所有仓库（含私有内容库） | 只有指定的 2~3 个仓库的指定操作 |
| 过期控制 | 可选永不过期（危险） | 强制设过期日（最长 1 年） |

泄漏场景影响：classic PAT 若泄漏 = 攻击者可读写全部 13 个仓库（包括 1256 篇私有笔记）；fine-grained 若泄漏 = 只能操作指定的公开产物仓的发布动作。

## 2. 两个 secret 的最小权限设计

### NOTIFY_TOKEN（ai-obsidian 用，push 后回调 hexo-engine 触发构建）
- **仓库范围**：`zeek-zhao/hexo-engine`（只要这一个）
- **权限**：
  - Contents: **Read and write**（读私有内容库 + repository_dispatch 权限落在 Contents write 上）
  - Actions: **Read**（可选，查 run 状态用）
- `Metadata: Read-only` 会自动勾上（必须）

### DEPLOY_TOKEN（hexo-engine CI 用，拉内容库 + 推产物）
- **仓库范围**：
  - `zeek-zhao/ai-obsidian`（拉取源内容）
  - `zeek-zhao/zeek-zhao.github.io`（推 gh-pages 产物）
- **权限**：
  - Contents: **Read and write**（ai-obsidian 只读也够，但一个 PAT 两仓库共用一个权限值，取 write）

> 说明：repository_dispatch API 需要目标仓库的 Contents: write（fine-grained 语义下）；若替换后 CI 报 403 dispatch 拒绝，把 NOTIFY_TOKEN 的 hexo-engine Actions 权限升为 Read and write 再试。

## 3. 创建 fine-grained PAT（网页步骤）

1. GitHub 右上角头像 → **Settings** → 左栏最底 **Developer settings**；
2. **Personal access tokens → Fine-grained tokens** → **Generate new token**；
3. 表单：
   - Token name：`hexo-blog-deploy`（随便起，好认即可）
   - Expiration：**90 days**（推荐；到期前 GitHub 会发邮件提醒续期）
   - Resource owner：`zeek-zhao`
   - Repository access：**Only select repositories** → 勾选 `ai-obsidian`、`hexo-engine`、`zeek-zhao.github.io`（三个全勾，一把 token 覆盖两个 secret 的需求；要更严格可建两把分开配）
4. Permissions（Repository permissions）：
   - **Contents: Read and write**
   - Metadata: Read-only（自动）
   - 其余全部 No access
5. **Generate token** → 立刻复制 token 值（`github_pat_…`，**离开页面后不可再看**）。

## 4. 替换两个 secret（二选一）

### 方式 A：网页（推荐，最直观）
1. 打开 `https://github.com/zeek-zhao/ai-obsidian/settings/secrets/actions` → 点 `NOTIFY_TOKEN` → **Update** → 粘贴新 token；
2. 打开 `https://github.com/zeek-zhao/hexo-engine/settings/secrets/actions` → 点 `DEPLOY_TOKEN` → **Update** → 粘贴同一个新 token。

### 方式 B：命令行（WSL gh）
```bash
export GH_TOKEN='<旧token或另一个有 admin 权限的>'  # 更新 secret 本身需要 admin 权限的凭据
gh secret set NOTIFY_TOKEN -R zeek-zhao/ai-obsidian --body '<新token>'
gh secret set DEPLOY_TOKEN  -R zeek-zhao/hexo-engine --body '<新token>'
gh secret list -R zeek-zhao/ai-obsidian
gh secret list -R zeek-zhao/hexo-engine
```

## 5. 验证替换生效

1. **回调链**：对 ai-obsidian 的 `90-OB工程管理/log/` 随便做个小改动提交推送 → 2~3 分钟后 https://github.com/zeek-zhao/hexo-engine/actions 应出现新 run（workflow_dispatch 事件触发成功 = NOTIFY_TOKEN 生效）；
2. **构建链**：该 run 成功 = DEPLOY_TOKEN 拉内容库 + 推 gh-pages 都生效；
3. 任一环节失败：查该 run 日志里第一个 403/401 出现的 step，对照 §2 权限表补权限。

## 6. 收尾：撤销旧 classic PAT（替换验证通过后）

1. Settings → Developer settings → **Personal access tokens → Tokens (classic)**；
2. 找到现有那把（名称带 ghp_ 前缀的那条）→ **Delete**；
3. 全站无自动任务再引用它（notify-publish.yml 用的是 secret 名，不是 token 本身，删除无影响）。

## 7. 续期提醒机制

- fine-grained PAT 到期前 7 天 GitHub 发站内通知 + 邮件；
- 建议：日历提醒设 80 天期；到期当天重复 §3 生成新 token → §4 Update 两个 secret → §5 验证，全程 5 分钟；
- 也可把 Expiration 设 1 年减少频率（安全性略降）。

## 8. 备查

- 本地残留 token 的清理：WSL `~/.bashrc` / 脚本中如有硬编码 ghp_ 旧值，替换后一并删除；
- AI 会话中的 token 引用均来自会话环境变量，不存在落盘；
- 出问题先看 `docs/guides/G-04-SEO-RSS-评论详解.md` §4 的人工事项表，再看本指南 §5 验证方法。
