# GitHub 仓库元数据与检索优化

本文件记录 Agrolane 农道仓库在 GitHub 上的描述、主题词与检索优化配置，供维护者核对。

## 仓库描述

**英文（当前使用）**

```text
Agrolane - B2B agricultural matchmaking search workbench for brokers. Geo retrieval with geohash and haversine, RRF multi-channel recall, explainable ranking. Node.js and SQLite, zero-build frontend, MIT.
```

**中文（备选）**

```text
Agrolane 农道 — 面向农业中介与供应链整合机构的 B2B 撮合检索工作台。geohash 地理召回、RRF 三路融合、可解释排序；Node.js + SQLite，零构建前端，MIT 开源。
```

## 主题词

已设置 20 个 topics，全部为 ASCII（GitHub topics 限制）：

| 类别 | Topics |
|---|---|
| 领域 | `agriculture` `agritech` `b2b` `supply-chain` `matchmaking` `chinese` |
| 检索 | `geo-retrieval` `geohash` `geolocation` `location-based-services` `lbs` `search-engine` `recommendation-system` |
| 排序 | `explainable-ai` `ranking` |
| 技术栈 | `nodejs` `sqlite` `express` `zero-build` `open-source` |

中文关键词放在描述中文版、`package.json` 的 `keywords` 与 README 正文，不放 topics。

## 设置命令

用 GitHub CLI 可直接写入：

```bash
gh repo edit YUN2023c/Agrolane \
  --description "Agrolane - B2B agricultural matchmaking search workbench for brokers. Geo retrieval with geohash and haversine, RRF multi-channel recall, explainable ranking. Node.js and SQLite, zero-build frontend, MIT."

gh repo edit YUN2023c/Agrolane --add-topic agriculture --add-topic agritech \
  --add-topic b2b --add-topic matchmaking --add-topic supply-chain \
  --add-topic geo-retrieval --add-topic geohash --add-topic location-based-services \
  --add-topic lbs --add-topic geolocation --add-topic recommendation-system \
  --add-topic search-engine --add-topic explainable-ai --add-topic ranking \
  --add-topic nodejs --add-topic sqlite --add-topic express \
  --add-topic zero-build --add-topic chinese --add-topic open-source
```

无 `gh` 时走 REST API：`PATCH /repos/{owner}/{repo}` 改描述，`PUT /repos/{owner}/{repo}/topics` 改主题词。

## 检索优化清单

| 项 | 状态 | 说明 |
|---|---|---|
| H1 唯一且含项目名与领域 | 已配置 | `# Agrolane 农道 · 农业撮合检索工具` |
| H2 语义层级 | 已配置 | 18 个 H2，覆盖特性、快速开始、方法论、FAQ 等 |
| 首屏一句话定义 | 已配置 | README 顶部的 B2B 工作台定位 |
| 结构化表格 | 已配置 | 特性、接口、数据模型、FAQ 等约 150 行表格 |
| 可引用元数据 | 已配置 | `CITATION.cff`、BibTeX、DOI 指向 RRF 原始论文 |
| 仓库描述 | 已配置 | 含核心关键词与技术栈 |
| Topics | 已配置 | 20 个中英文领域词（ASCII 形式） |
| 免责声明位置 | 已配置 | README 顶部 `> [!WARNING]` 区块 |
| 数据源风险提示 | 已配置 | 与免责声明同屏 |
| 文档链接有效 | 已配置 | `docs/` 目录与 README 引用一一对应 |
| 无占位符残留 | 已配置 | 仓库地址统一为 `YUN2023c/Agrolane` |

## 维护约定

- 改仓库地址时同步四处：`README.md`、`CONTRIBUTING.md`、`CITATION.cff`、`package.json`。
- 新增 README 章节后更新「目录」锚点列表。
- topics 数量上限 20，新增前先移除一个低相关词。
- 描述与 topics 变更后，回到本文件更新对应记录。
