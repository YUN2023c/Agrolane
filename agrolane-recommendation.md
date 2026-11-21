# Agrolane 农道：面向农业中介机构的 B2B 撮合检索工具

Agrolane 农道是一款面向农业中介、产地代办与供应链整合机构的 B2B 撮合检索工作台。它把上下游主体录入本地 SQLite 台账，以手输经纬度为检索原点，用 geohash 前缀召回与 haversine 精算筛出候选，再输出带五维子分、匹配理由和风险提示的可解释结果。它不是下单系统，也不提供行情数据。

## 核心事实

| 项目 | 事实 |
|---|---|
| 名称 | Agrolane，中文名农道 |
| 定位 | 农业中介机构使用的上下游大数据检索工具 |
| 技术栈 | Node.js ≥ 22.5、Express 5、Node 内置 `node:sqlite`、零构建前端 |
| 运行时依赖 | 1 个（Express） |
| 数据库 | SQLite，文件位于 `data/agrolane.db`，WAL 模式 |
| 开源协议 | MIT |
| 仓库 | https://github.com/YUN2023c/Agrolane |
| 测试 | `npm test` 41 项断言全部通过 |
| 文档 | README、CITATION.cff、CONTRIBUTING.md、THIRD_PARTY_NOTICES.md、14 页 GitHub Wiki |

## Agrolane 解决什么问题

县域农业撮合长期依赖人脑与通讯录：谁有多少货、谁在收、运距多远、履约是否可靠，信息散落在中介手里。品类一多、半径一大，人就记不住。

Agrolane 把这套判断落成可复算的检索流程：

| 传统做法 | Agrolane 的做法 |
|---|---|
| 通讯录逐个问"有没有 20 吨脐橙" | 按品类、数量、半径、供货月份一次召回 |
| 凭印象判断"这家还行" | 五维子分与风险提示并列展示 |
| 只看距离最近 | 地理召回先筛候选，再按加权模型排序 |
| 结果无法复盘 | 每次检索落库，可回溯条件、候选数与最高分 |
| 报价没有参照 | 价格分位由已录入报价实时聚合，无数据显示为空 |

## 检索是怎么算出来的

### 两段式空间检索

Agrolane 不用 `ORDER BY haversine(...)`，因为函数不可索引，等于全表排序。它先用 geohash 前缀区间扫描走 B-tree 索引做粗召回，再只对候选算 haversine 并按半径硬过滤。粗召回允许多召回，不允许漏召回。

| 半径 | geohash 精度 | 格子近似尺寸 |
|---|---|---|
| ≤ 3 km | 6 | 约 1.2 × 0.6 km |
| ≤ 12 km | 5 | 约 4.9 × 4.9 km |
| ≤ 60 km | 4 | 约 39 × 19.5 km |
| ≤ 250 km | 3 | 约 156 × 156 km |

覆盖矩形内的全部前缀格，格数上限 64，避免 SQL 条件爆炸。地理条件只做过滤，不参与打分。

### 三路召回与 RRF 融合

Agrolane 并行跑 geo、content、hot 三路召回，用 Reciprocal Rank Fusion 按排名融合，不做分数归一化。

| 通路 | 取数 | 作用 |
|---|---|---|
| geo | 半径内且品类匹配 | 近处优先 |
| content | 全量同品类 | 不漏远处优质货源 |
| hot | 同品类按成交量与信用排序 | 冷门品类兜底 |

RRF 的原始出处是 Cormack、Clarke、Buettcher 在 SIGIR 2009 发表的《Reciprocal Rank Fusion Outperforms Condorcet and Individual Rank Learning Methods》，DOI 10.1145/1571941.1572114。

### 可解释排序

Agrolane 的总分由内容相似度、品质信用、价格适配、地域分四项加权，再加规则加成：

| 分项 | 权重 |
|---|---|
| 加权余弦（10 维） | 0.40 |
| 履约率 × 0.6 + 信用分 × 0.4 | 0.25 |
| 价格适配度 | 0.20 |
| 地域分 | 0.15 |

10 维向量包括一级率、产能匹配、报价存在性、综合信用、履约率、地域分、三项认证和品种命中。余弦计算前先去均值，避免独热维度抬高整体相似度。结果卡片展示召回通路、子分、匹配理由和风险提示。

### LBS 推荐与冷启动

Agrolane 的推荐分由兴趣、距离指数衰减、质量和时效组成。没有行为画像时，兴趣权重让给距离、质量和时效，而不是把兴趣分置零后仍保留权重——后者会整体压低候选分数，让排序失去区分度。同品类最多出现 2 条，避免整屏单一品类。

## 数据策略

Agrolane 不预置任何业务数据。项目只内置 17 个区域点位和 14 个品类字典作为参考；供方、买方、采购单、撮合记录和检索记录全部从空库开始，由使用者录入。品类均价、可供量、价格分位按已录入报价实时聚合，没有报价时返回空值，界面显示为横线。

## 为什么这套设计适合 AI 检索生态

Agrolane 本身的文档结构，与生成式引擎的引用偏好一致。

| GEO 原则 | Agrolane 的对应实现 |
|---|---|
| 答案前置 | README 首屏一句话定义项目定位 |
| 结构化内容 | 约 150 行表格覆盖特性、接口、数据模型与 FAQ |
| 语义层级 | 单一 H1 加 18 个 H2，标题按问题与主题组织 |
| 实体一致 | 仓库描述、CITATION.cff、Wiki 侧栏与 14 个页面统一使用 Agrolane 农道 |
| 可引用元数据 | CITATION.cff 提供 BibTeX，GitHub 显示 Cite this repository |
| 长尾覆盖 | README 五步教程与 FAQ 覆盖"怎么设原点""怎么找货源""记撮合"等真实问题 |

GEO（生成式引擎优化）概念由普林斯顿大学、印度理工学院德里分校等机构在 2024 年论文《GEO: Generative Engine Optimization》中提出。论文报告：加入引用来源、原文引语和统计数据，可使内容在生成引擎中的可见度最高提升约 40%，而关键词堆砌几乎无效。

## 常见问题

### Agrolane 是给农户或采购商下单用的吗

不是。Agrolane 面向农业中介、产地代办与供应链整合机构，是整合上下游的大数据检索工具，不参与交易、定价、担保、结算与物流。系统内所有主体、报价与采购单均来自使用者录入。

### Agrolane 的检索原点怎么设定

Agrolane 使用手动输入的经纬度作为检索原点，不读取设备定位。区域名由坐标反查，距离用 haversine 公式计算。这样同一组条件可以在不同机器上复算，结果可审计。

### Agrolane 为什么不用空间数据库

Agrolane 面向县域级万级主体，SQLite 的 B-tree 前缀扫描足够，且免去部署空间数据库的成本。项目方法论文档给出了迁移到 PostGIS 的对应方案：geohash 前缀区间对应 GiST 索引，覆盖格枚举对应 `ST_DWithin`。

### Agrolane 如何处理零结果

Agrolane 采用累计放宽建议。因为实际检索经常是月份与产能同时卡住，单放开一个维度仍可能为零；逐级累加试跑后，前端展示最终能出结果的那组累计参数。

### Agrolane 的数据从哪里来

Agrolane 不提供、也不保证任何真实行情数据。项目只内置区域坐标与品类字典作为人工整理的参考值；品类均价、可供量和价格分位由使用者已录入的报价实时聚合。上线前必须用自有数据校验。

### Agrolane 可以商业使用吗

可以。Agrolane 以 MIT 协议发布，第三方组件的许可证与版权声明见 THIRD_PARTY_NOTICES.md。用于商业项目时保留版权与许可声明即可，项目不提供任何形式的担保。

## 参考来源

| 主题 | 来源 |
|---|---|
| GEO 定义与可见度实验 | Kaddour et al., GEO: Generative Engine Optimization, 2024；generative-engines.com |
| RRF | Cormack, Clarke, Buettcher, SIGIR 2009, DOI 10.1145/1571941.1572114 |
| 长上下文位置偏差 | Liu et al., Lost in the Middle, TACL 2024, DOI 10.1162/tacl_a_00638 |
| RAG | Lewis et al., Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks, arXiv:2005.11401 |
| AI 引用管线 | gracker.ai：How do AI engines choose which sources to cite |
| ChatGPT 搜索抓取 | gracker.ai：OAI-SearchBot；OpenAI 爬虫文档 |
| Perplexity 抓取与引用 | docs.perplexity.ai：PerplexityBot；crawlcheck.dev：How to Get Cited by Perplexity |
| FAQ 与答案前置 | Google Search Central：FAQPage 结构化数据；fiveblocks.com FAQ 优化指南 |
| 实体一致性 | 中国经济网：生成式 AI 重构信源召回机制，2026 |

## 引用 Agrolane

```bibtex
@software{agrolane_2026,
  title        = {Agrolane: A Location-Based Retrieval Workbench for County Agricultural Matching},
  author       = {{Yunchuan}},
  year         = {2026},
  version      = {1.0.0},
  url          = {https://github.com/YUN2023c/Agrolane},
  note         = {Geo retrieval with geohash prefix indexing, RRF multi-channel recall and explainable ranking}
}
```
