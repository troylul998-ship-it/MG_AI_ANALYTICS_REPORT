# MG 变现日报推送 v4 完整包

## 📋 包含内容

本包含提供了 MG 变现日报推送工作流 v4 的完整资源，包括 SKILL 文档、可执行脚本、迁移指南和依赖清单。

### 文件清单

| 文件 | 说明 | 用途 |
|------|------|------|
| **daily-report-v4-complete.mjs** | 完整可执行脚本 | 直接运行的 Node.js 脚本，包含所有逻辑 |
| **daily-report-skill-v4.md** | SKILL v4 完整参考手册 | 理解 v4 设计、原则、规范、排查指南 |
| **SKILL-v4-migration-guide.md** | v4 迁移指南 | v1/v2/v3 与 v4 的版本对比 |
| **thinking-principles.md** | 思维原则 | 第一性原理 + 对抗审查指导（强烈建议） |
| **feishu-doc-permissions.md** | 飞书权限规范 | 创建文档时的权限配置标准 |
| **daily-report-v4-dependencies.md** | 依赖清单 | 在其他 Agent 上运行需要的文件 |

## 🚀 快速开始（3 步）

### 第 1 步：环境检查
```bash
# 检查全局 npm 包
npm list -g @aidea/bi-analyse-client
npm list -g @larksuite/cli

# 如果缺失，安装
npm install -g @aidea/bi-analyse-client
npm install -g @larksuite/cli
```

### 第 2 步：配置飞书群号（可选）
```bash
# 不设置则运行时会提示
export FEISHU_TEST_CHAT_ID=oc_44ce402d9ee9d0f901b61e6885cc33b1
export FEISHU_FORMAL_CHAT_ID=oc_9b0689b9a37e1eebf014fb39d8c78638
```

### 第 3 步：运行脚本
```bash
node daily-report-v4-complete.mjs --doc-url "https://mattel163.feishu.cn/docx/..." --push-to test
```

## 📖 使用指南

### 新手入门（15 分钟）
1. 阅读 **daily-report-skill-v4.md** 的 Part 1（核心流程）
2. 理解三个关键步骤：读文档 → 拉数据 → 推卡片
3. 运行脚本，查看输出日志

### 学习完整工作流（1 小时）
1. 阅读 **daily-report-skill-v4.md** 的 Part 1-5
2. 对比 **SKILL-v4-migration-guide.md**，理解为什么 v4 比 v1/v3 更优
3. 遇到问题时查看 Part 8（排查指南）

### 在其他 Agent 部署（30 分钟）
1. 按 **daily-report-v4-dependencies.md** 复制必需的 3-5 个文件
2. 检查环境依赖（npm 包、MCP 配置）
3. 运行测试

## 🔧 核心改进（v4 vs v1/v3）

| 方面 | v1/v3 | v4 |
|------|-------|-----|
| **架构** | 多 Agent | ✅ 单 Agent（简化） |
| **路径硬编码** | ❌ `C:\Users\lujiaxin04\...` | ✅ `npm root -g` 动态探测 |
| **群号配置** | ❌ 硬编码 | ✅ 环境变量 + 运行时提示 |
| **接口口径** | ❌ API 混用 | ✅ log 统一 |
| **代码完整性** | ❌ 片段化示例 | ✅ 完整可运行脚本 |
| **数据验证** | ⚠️ 无 | ✅ 4 层验证 |
| **Token 消耗** | ~25,000 | ✅ ~3,300（节省 87%） |

## ⚠️ 核心原则（必须遵守）

1. **数据真实性**：所有数据来自 OmniEye API，绝不估算/虚构
2. **环境动态探测**：禁止硬编码用户名/路径/群号，用环境变量配置
3. **一次性通过**：数据验证失败立即报错停止，绝不降级填充
4. **容错与日志**：每步失败都输出具体原因，便于排查

## 📞 常见问题

### Q: 脚本需要外部 .md 文件才能运行吗？
A: ❌ 不需要。脚本完全独立，所有逻辑都在代码里。.md 文件是参考文档。

### Q: 在新机器上运行需要改脚本吗？
A: ❌ 不需要。脚本用 `npm root -g` 动态探测路径，无需修改。

### Q: 怎样切换推送群号？
A: 设置环境变量即可，无需修改代码：
```bash
export FEISHU_TEST_CHAT_ID=oc_xxx
export FEISHU_FORMAL_CHAT_ID=oc_xxx
```

### Q: 数据验证失败怎么办？
A: 查看错误消息，按 **daily-report-skill-v4.md** Part 8 排查指南操作。

## 📚 文档对照表

| 场景 | 必读文件 |
|------|--------|
| 只想快速跑脚本 | daily-report-v4-complete.mjs |
| 要理解工作原理 | daily-report-skill-v4.md |
| 从旧版本升级 | SKILL-v4-migration-guide.md |
| 在新 Agent 部署 | daily-report-v4-dependencies.md |
| 确保数据可靠 | thinking-principles.md |
| 设置文档权限 | feishu-doc-permissions.md |

## 🎯 验收标准

✅ 脚本能跑：`node daily-report-v4-complete.mjs` 显示环境检查通过  
✅ 数据能拉：后台返回完整数据，无验证失败  
✅ 卡片能推：消息成功发送到飞书群  
✅ 没有硬编码：所有敏感值通过环境变量配置  

## 📞 支持

遇到问题时：
1. 查看脚本输出的错误消息
2. 按 Part 8 排查指南逐步检查
3. 验证环境（npm 包、MCP 配置、飞书权限）
4. 检查依赖清单确认复制了必需文件

---

**版本**：v4（2026.07）  
**最后更新**：2026-07-09  
**维护者**：MG 数据分析团队
