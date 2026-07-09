# daily-report-v4 在其他 Agent 上运行需要的本地 Skill 文件清单

## 📋 核心发现

**`daily-report-v4-complete.mjs` 脚本本身 ❌ 不引用任何外部 .md skill 文件**。

脚本是**完全独立的可执行文件**，所有的逻辑、参数定义、验证规则都写在代码里。

---

## 🔧 但在其他 Agent 上运行需要的文件

| 文件 | 位置 | 用途 | 是否必需 | 理由 |
|------|------|------|---------|------|
| **thinking-principles.md** | `.kiro/steering/thinking-principles.md` | 第一性原理 + 对抗审查指导 | ✅ **强烈建议** | 确保 Agent 遵循数据真实性和验证原则 |
| **feishu-doc-permissions.md** | `.kiro/steering/feishu-doc-permissions.md` | 飞书文档权限规范 | ✅ **强烈建议** | 创建文档时需要设置正确的权限（陆嘉欣 + MG 群） |
| **daily-report-skill-v4.md** | `.kiro/steering/daily-report-skill-v4.md` | v4 SKILL 完整参考手册 | ⚠️ **参考用** | 了解 v4 的设计、原则、排查指南（可选但有帮助） |
| **SKILL-v4-migration-guide.md** | `.kiro/steering/SKILL-v4-migration-guide.md` | v4 迁移指南 + 版本对比 | ⚠️ **参考用** | 理解 v4 与 v1/v3 的差异，便于学习（可选） |

---

## 📦 实际需要复制到其他 Agent 的文件

```
如果要在其他 Agent 上运行 daily-report-v4，需要复制的最小文件集合：

1. 【必需】
   └─ daily-report-v4-complete.mjs
      └─ 脚本本体，包含所有逻辑、参数、验证规则

2. 【强烈建议】
   ├─ thinking-principles.md
   │  └─ 指导 Agent 遵循第一性原理和对抗审查
   └─ feishu-doc-permissions.md
      └─ 飞书文档权限配置规范

3. 【参考用】可选复制
   ├─ daily-report-skill-v4.md
   │  └─ 完整 SKILL 文档（Part 1-10，排查指南）
   └─ SKILL-v4-migration-guide.md
      └─ 迁移指南（理解 v4 设计）
```

---

## ⚙️ 脚本的环境依赖（非 .md 文件）

脚本运行时需要的环境配置：

| 项 | 类型 | 位置/配置 | 检查方式 |
|------|------|---------|---------|
| **bi-analyse-client** | npm 全局包 | `npm root -g`/`@aidea/bi-analyse-client` | `npm list -g @aidea/bi-analyse-client` |
| **@larksuite/cli** | npm 全局包 | `npm root -g`/`@larksuite/cli` | `npm list -g @larksuite/cli` |
| **飞书 App ID** | 环境变量/硬编码 | `.mjs` 脚本中或 `process.env` | `echo $FEISHU_*_CHAT_ID` |
| **OmniEye API 权限** | MCP 服务配置 | `.kiro/settings/mcp.json` 中的 `bi-analyse-client` | 检查 MCP 配置 |
| **飞书 Token** | 隐式/运行时 | 由 `@larksuite/cli` 使用 | 需要在本地已授权 |

---

## 🚀 完整的部署步骤（其他 Agent）

### 第 1 步：复制脚本
```bash
# 从原 Agent 复制到新 Agent
scp -r daily-report-v4-complete.mjs <new-agent>:/path/to/project/
scp -r *.md <new-agent>:/path/to/project/.kiro/steering/
```

### 第 2 步：检查环境
```bash
cd /path/to/project
npm list -g @aidea/bi-analyse-client
npm list -g @larksuite/cli

# 如果缺失，安装
npm install -g @aidea/bi-analyse-client
npm install -g @larksuite/cli
```

### 第 3 步：配置飞书群号（可选，不设则运行时提示）
```bash
export FEISHU_TEST_CHAT_ID=oc_44ce402d9ee9d0f901b61e6885cc33b1
export FEISHU_FORMAL_CHAT_ID=oc_9b0689b9a37e1eebf014fb39d8c78638
```

### 第 4 步：检查 MCP 配置
```bash
cat .kiro/settings/mcp.json | grep -A 10 "bi-analyse-client"
```

### 第 5 步：运行脚本
```bash
node daily-report-v4-complete.mjs --doc-url "https://..." --push-to test
```

---

## 📝 脚本内部结构（代码注释）

脚本包含的 Part：
- **Part 1**: 环境检查（npm 路径、依赖验证）
- **Part 2**: 日期计算（CUR、PREV、DS30、GAP 日期）
- **Part 3**: 数据获取（6 个接口调用）
- **Part 4**: 数据验证（4 层验证）
- **Part 5**: Trend30 计算
- **Part 6**: 卡片组装
- **Part 7**: 飞书文档读取
- **Part 8**: 卡片推送
- **Part 9**: 主流程

所有规则都在代码注释中，不依赖外部 skill 文件。

---

## 📚 推荐文件对照表

### 场景 1：只想跑脚本，不需要理解原理
```
需要文件：
  ✅ daily-report-v4-complete.mjs

可选：
  ⚠️ thinking-principles.md（避免数据错误）
```

### 场景 2：要在新 Agent 上完整部署
```
需要文件：
  ✅ daily-report-v4-complete.mjs
  ✅ thinking-principles.md
  ✅ feishu-doc-permissions.md
  
可选参考：
  ⚠️ daily-report-skill-v4.md
  ⚠️ SKILL-v4-migration-guide.md
```

### 场景 3：要学习 v4 的设计，为新需求定制
```
需要文件：
  ✅ daily-report-v4-complete.mjs
  ✅ daily-report-skill-v4.md（Part 1-10 完整参考）
  ✅ SKILL-v4-migration-guide.md（版本对比）
  ✅ thinking-principles.md（设计原则）
  ✅ feishu-doc-permissions.md
```

---

## 总结

| 问题 | 答案 |
|------|------|
| **daily-report-v4 需要外部 skill 文件才能运行吗？** | ❌ 不需要，脚本完全独立 |
| **最少需要复制哪些文件到其他 Agent？** | 1 个脚本 + 2-3 个参考文档（强烈建议） |
| **skill 文件的作用是什么？** | 指导原则、权限规范、排查参考，但非运行依赖 |
| **是否可以直接跑脚本而不管 .md 文件？** | ✅ 可以，但会失去指导和规范检查 |
