# 贡献指南 · Contributing

感谢你愿意改进 Agrolane（农道 · 农业撮合检索工具）。本文说明本地开发、代码约定、提交规范与评审标准。

- [开始之前](#开始之前)
- [本地开发](#本地开发)
- [代码结构约定](#代码结构约定)
- [提交信息规范](#提交信息规范)
- [Pull Request 清单](#pull-request-清单)
- [算法改动的额外要求](#算法改动的额外要求)
- [文档同步](#文档同步)
- [报告问题](#报告问题)
- [行为准则](#行为准则)

---

## 开始之前

| 事项 | 说明 |
|---|---|
| 先搜 Issue | 避免重复劳动，已有讨论请直接跟进 |
| 小改动直接 PR | 错别字、注释、样式微调无需先开 Issue |
| 大改动先讨论 | 新增页面、改数据模型、换存储方案请先开 Issue 对齐 |
| 不要提交数据文件 | `data/*.db`、`logs/`、`node_modules/` 已在 `.gitignore` |

---

## 本地开发

```bash
git clone https://github.com/YUN2023c/Agrolane.git
cd agrolane
npm install          # 仅 express
npm run dev          # 带 --watch 的启动方式
npm test             # 41 项接口断言，独立端口 + 临时库
```

| 命令 | 用途 |
|---|---|
| `npm start` | 生产式启动，端口 3000 |
| `npm run dev` | 文件变更自动重启 |
| `npm test` | 提交前必跑 |
| `npm run seed` | 清空业务数据、重建基础字典（旧库改名备份） |

前端无构建步骤：改完 `public/` 下文件刷新浏览器即可。修改 `server/` 下代码需重启（或用 `npm run dev`）。

---

## 代码结构约定

| 目录 | 职责 | 不要做的事 |
|---|---|---|
| `server/geo.js` | 全部空间计算 | 不要在路由里重写 geohash 或距离公式 |
| `server/match.js` | 召回、过滤、打分、解释 | 不要把 SQL 拼装散落到多处 |
| `server/recommend.js` | 推荐流与统计聚合 | 不要在页面里做聚合计算 |
| `server/routes/*` | 参数校验 + 调用引擎 + 响应 | 不要写业务算法 |
| `public/js/core.js` | 状态、接口层、通用组件 | 不要在这里做页面渲染 |
| `public/js/pages.js` | 页面渲染与事件绑定 | 每个渲染函数要能重复执行 |
| `public/js/forms.js` | 抽屉与表单 | 表单校验错误用 `toast`，不要 alert |

风格约定：

| 项 | 约定 |
|---|---|
| 缩进 / 引号 / 分号 | 2 空格 / 单引号 / 必写 |
| 模块体系 | CommonJS（`require` / `module.exports`） |
| 异步 | `async/await`，异常在边界处 `try/catch` 并返回 `{ error }` |
| 命名 | 数据库字段 `snake_case`，接口与前端 `camelCase`，映射集中在路由层 |
| 注释 | 只解释"为什么"，不复述代码；算法段落写清取舍 |
| 中文文案 | 面向中介方口径，避免"我要买/我要卖"这类 C 端表达 |

---

## 提交信息规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)：

```text
<type>(<scope>): <subject>
```

| type | 用途 | 示例 |
|---|---|---|
| `feat` | 新功能 | `feat(match): add season-aware capacity penalty` |
| `fix` | 修复缺陷 | `fix(geo): cover boundary cells at dateline` |
| `docs` | 文档 | `docs(readme): add data source disclaimer` |
| `refactor` | 不改变行为 | `refactor(recommend): extract market aggregation` |
| `test` | 测试 | `test(smoke): cover manual match record` |
| `chore` | 构建、依赖 | `chore(deps): bump express to 5.3.1` |

scope 建议：`geo` / `match` / `recommend` / `entities` / `ui` / `docs` / `deps`。

---

## Pull Request 清单

提交前逐项自查：

- [ ] `npm test` 全绿，且新增行为有对应断言
- [ ] 只做一件事，没有顺手重构无关文件
- [ ] 新增/修改接口已同步 README「接口一览」
- [ ] 新增/修改表结构已同步 README「数据模型」，并对旧库做兼容处理
- [ ] 没有提交 `data/`、`logs/`、`node_modules/`、个人截图
- [ ] 前端改动在 1440×900 与 1024×768 下自测过
- [ ] 中文文案口径统一为中介 / 供应链整合方视角

评审关注点：正确性 > 可解释性 > 一致性 > 性能。涉及排序与召回的改动，请附前后对比数据。

---

## 算法改动的额外要求

| 要求 | 说明 |
|---|---|
| 说明动机 | 解决什么场景问题，现有公式哪里不够 |
| 给出对比 | 同一批数据下改动前后的候选数、Top-3 变化、分数分布 |
| 保留解释性 | 新特征必须能进入 `reason` 或 `subs`，不允许出现"黑盒加分" |
| 参数进表 | 新增权重/阈值写入 `settings`，不要硬编码 |
| 兜底不退化 | 无数据、单候选、跨季等边界必须有可预期行为 |

---

## 文档同步

代码与文档必须同时更新。以下改动视为"文档未完成"：

- 改了接口但 README 表格未更新
- 改了表结构但「数据模型」未更新
- 改了算法但 `docs/geo-retrieval-and-lbs.md` 与 README「方法论」不一致
- 新增依赖但 `THIRD_PARTY_NOTICES.md` 未重新生成

重新生成依赖声明：

```bash
npx license-checker --summary
npm ls --all
```

---

## 报告问题

提交 Issue 时请附：

| 项 | 示例 |
|---|---|
| 环境 | Node 版本、操作系统、浏览器 |
| 复现步骤 | 原点坐标、检索条件、录入的数据样例 |
| 期望 / 实际 | 期望 3 条候选，实际 0 条 |
| 报错 | 控制台或 `logs/server.log` 的相关片段 |
| 数据影响 | 是否涉及已有台账（避免误删用户数据） |

---

## 行为准则

- 对事不对人；技术分歧用数据和可复现例子说话。
- 不提交含真实个人隐私、真实商业合同、未授权数据的样例。
- 不接受把本项目包装成"官方行情数据源"或"交易担保平台"的用法。
