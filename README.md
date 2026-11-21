# Agrolane 农道 · 农业撮合检索工具

> **面向农业中介与供应链整合机构的 B2B 供需检索工作台。** 录入上下游主体，设定检索原点，按地理半径召回，输出可解释、可排序的撮合候选清单。

<p>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-276B56">
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A522.5-43853D">
  <img alt="express" src="https://img.shields.io/badge/express-5.3-000000">
  <img alt="sqlite" src="https://img.shields.io/badge/storage-SQLite-003B57">
  <img alt="deps" src="https://img.shields.io/badge/runtime%20deps-1-brightgreen">
  <img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-276B56">
  <img alt="status" src="https://img.shields.io/badge/status-active-4E9C80">
</p>

<p>
  <a href="#快速开始">快速开始</a> ·
  <a href="#使用教程">使用教程</a> ·
  <a href="#方法论">方法论</a> ·
  <a href="docs/geo-retrieval-and-lbs.md">算法设计</a> ·
  <a href="#faq">FAQ</a> ·
  <a href="CONTRIBUTING.md">贡献指南</a>
</p>

> [!WARNING]
> **免责声明 / Disclaimer**
> 本项目是**检索工具与算法实现**，不是交易平台，不参与定价、担保、结算与物流。系统内所有主体、报价、采购单均来自使用者录入，**项目不提供、也不保证任何真实行情数据**。基于本工具产生的商业决策、合同纠纷、货损与合规责任，由使用者自行承担。
>
> **数据源风险**：内置区域坐标与品类字典为人工整理的参考值（见[数据来源](#数据来源与风险提示)），可能与实际行政区划、市场行情存在偏差；上线前必须用你的自有数据校验，切勿直接用于结算、报关或补贴申报。

---

## 目录

- [为什么需要它](#为什么需要它)
- [特性](#特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [使用教程](#使用教程)
- [方法论](#方法论)
- [接口一览](#接口一览)
- [数据模型](#数据模型)
- [数据来源与风险提示](#数据来源与风险提示)
- [部署建议](#部署建议)
- [测试](#测试)
- [FAQ](#faq)
- [贡献指南](#贡献指南)
- [引用说明](#引用说明)
- [开源协议](#开源协议)
- [致谢与参考](#致谢与参考)

---

## 为什么需要它

县域农业的撮合长期依赖人脑与微信：谁家有多少货、谁在收、运距多少、履约靠不靠谱，全散在中间人的通讯录里。
一旦品类变多、半径变大，人就记不住了。

本工具把这套判断落成可复算的检索流程：

| 传统做法 | 本工具 |
|---|---|
| 通讯录里挨个问"你有没有 20 吨脐橙" | 按品类 + 数量 + 半径 + 供货月份一次召回 |
| 凭印象说"这家还行" | 五维子分（品质/产能/价格/信用/地域）+ 风险提示 |
| 只看距离最近 | 地理召回先筛候选，再按加权模型排序 |
| 结果无法复盘 | 每次检索落库，可回溯条件、候选数与最高分 |
| 报什么价没参照 | 报价分位：同品类有多少家比你便宜 |

面向对象：农业经纪人、产地代办、供应链公司、县域产业平台运营方。**不是**给单个农户或采购商用的下单系统。

---

## 特性

| 能力 | 说明 |
|---|---|
| **Geo 召回** | geohash 前缀区间扫描（走索引）→ haversine 精算，半径与精度自动匹配 |
| **三路召回 + RRF** | geo / content / hot 三路候选用 Reciprocal Rank Fusion 融合，只保证不漏，不追求顺序 |
| **可解释排序** | 加权余弦（10 维）+ 品质信用 + 价格适配 + 地域分，每项子分单独返回 |
| **九类硬过滤** | 半径、品种、月份、产能、等级、履约、信用、认证、场外交易，逐项可放宽 |
| **放宽建议** | 零结果时逐级累加放宽并试跑，给出"放宽到哪一步能找到几家" |
| **组合供货** | 单家不够量时自动给出 2~3 家的组合方案 |
| **台账 CRUD** | 供方（多品类）/ 买方 / 采购单增删改查，写库即参与召回 |
| **LBS 推荐流** | 按原点周围推送货源与采购单，兴趣画像 + 距离衰减 + 时效，含冷启动策略 |
| **检索留痕** | 检索记录与撮合台账分离，撮合只统计确认过的记录 |
| **参数可调** | 阈值、四项权重、距离衰减 λ 存在 `settings` 表，界面即时生效 |
| **零构建前端** | 原生 JS + CSS，无打包器、无框架，改完刷新即可 |
| **零原生依赖** | 数据库用 Node 内置 `node:sqlite`，`npm install` 只装一个 express |

### 界面

| 页面 | 用途 |
|---|---|
| 概览 | 四项指标、周边货源与采购单、预警、品类可供量 |
| 撮合检索 | 左条件面板 + 右候选列表，支持四种排序 |
| 主体台账 | 供方 / 买方 / 采购单三张表，搜索与品类筛选 |
| 检索记录 | 检索历史与撮合台账 |

---

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js ≥ 22.5 | `node:sqlite` 自 22.5 起内置，免原生编译 |
| Web 框架 | Express 5.3 | 唯一运行时依赖 |
| 存储 | SQLite（WAL） | 单文件、可备份、支持前缀区间索引扫描 |
| 前端 | 原生 JS / CSS | 无构建，静态资源由 Express 直出 |
| 测试 | Node 内置 `fetch` + 断言脚本 | `npm test` 起独立进程与临时库 |

---

## 快速开始

### 环境要求

| 项 | 要求 |
|---|---|
| Node.js | ≥ 22.5（推荐 22 LTS / 24 / 25） |
| npm | ≥ 10 |
| 操作系统 | Windows / macOS / Linux |
| 端口 | 默认 3000，可用 `PORT` 覆盖 |

### 方式一：Windows 一键启动

双击 `start.bat`。脚本会检查 Node、按需 `npm install`、检测端口占用、最小化窗口起服务（日志写 `logs/server.log`）、
轮询 `/api/health` 就绪后自动打开浏览器。脚本为纯 ASCII + CRLF，不含中文，避免 cmd 代码页乱码。

关闭标题为 `Agrolane Server` 的窗口即停服。

### 方式二：命令行

```bash
git clone https://github.com/YUN2023c/Agrolane.git
cd agrolane
npm install     # 仅 express 一个依赖
npm start       # http://localhost:3000
```

### 常用命令

| 命令 | 作用 |
|---|---|
| `npm start` | 启动服务（端口 3000） |
| `npm run dev` | 监听文件变化自动重启 |
| `npm test` | 接口冒烟测试（独立端口 + 临时库，不影响开发数据） |
| `npm run seed` | 清空业务数据并重建基础字典（旧库改名备份，不删除） |
| `PORT=8080 npm start` | 换端口 |

首次启动只建表并灌入基础字典：**17 个区域点位 + 14 个品类**。供方、买方、采购单、撮合与检索记录全部为空。
数据库文件默认 `data/agrolane.db`，可用环境变量 `DB_FILE` 指定其他路径。
从旧版本（Locus）升级时，首次启动会自动把 `data/locus.db` 改名为 `data/agrolane.db`，已有新库则不覆盖。

---

## 目录结构

```text
agrolane/
├─ start.bat                  Windows 一键启动（纯 ASCII）
├─ server/
│  ├─ index.js                HTTP 入口：中间件、路由挂载、静态资源、错误出口
│  ├─ db.js                   连接、建表、基础字典写入、设置读写
│  ├─ reference.js            基础字典：区域点位 + 品类（不含业务数据）
│  ├─ geo.js                  geohash 编解码、精度选择、覆盖格、haversine
│  ├─ match.js                三路召回 + RRF + 硬过滤 + 加权排序 + 解释
│  ├─ recommend.js            LBS 推荐流、概览聚合、行情、网格聚合
│  └─ routes/
│     ├─ catalog.js           品类 / 区域 / 枚举 / 算法参数
│     ├─ insights.js          概览、推荐流、行情、网格、埋点
│     ├─ entities.js          供方 / 买方 / 采购单 CRUD、收藏
│     └─ matching.js          执行检索、放宽建议、撮合与检索记录
├─ public/
│  ├─ index.html              应用外壳（侧栏 + 4 个页面 + 抽屉）
│  ├─ styles.css              设计 token 与桌面端布局
│  ├─ app.js                  启动、导航、原点输入
│  └─ js/
│     ├─ core.js              状态、接口层、通用组件
│     ├─ pages.js             四个主页面渲染
│     └─ forms.js             详情、编辑表单、参数面板
├─ scripts/
│  ├─ reset-db.js             重置数据库（旧库改名备份）
│  └─ smoke-test.js           接口冒烟测试（41 项）
├─ docs/
│  ├─ geo-retrieval-and-lbs.md  Geo 召回与 LBS 推荐设计说明
│  └─ github-repo-metadata.md   仓库 description / topics / SEO 清单
├─ data/                      SQLite 数据文件（gitignore）
├─ logs/                      启动日志（gitignore）
├─ CONTRIBUTING.md            贡献指南
├─ THIRD_PARTY_NOTICES.md     第三方组件与许可证声明
├─ CITATION.cff               引用元数据
└─ LICENSE                    MIT
```

| 文件 | 说明 |
|---|---|
| `server/geo.js` | 全部空间计算集中在此，改精度策略只需改这一处 |
| `server/match.js` | 召回、过滤、打分、解释文本 |
| `server/recommend.js` | 推荐流与统计聚合 |
| `public/styles.css` | 设计 token 与基础组件在前，桌面端侧栏布局与响应式规则在末尾 |
| `docs/geo-retrieval-and-lbs.md` | 方法论细节与参考来源 |

---

## 使用教程

### 第 1 步 · 设定检索原点

左侧栏底部填入**纬度 / 经度**，点「应用原点」。

| 字段 | 示例 | 说明 |
|---|---|---|
| 纬度 | `25.3860` | −90 ~ 90 |
| 经度 | `114.9220` | −180 ~ 180 |

系统不申请浏览器定位。坐标只用于两类计算：haversine 距离与 geohash 前缀；区域名由坐标反查最近的区域点位。

### 第 2 步 · 录入台账

「主体台账」→ 新建：

| 类型 | 必填 | 说明 |
|---|---|---|
| 供方 | 名称、区域、至少一个品类 | 坐标由区域中心加抖动生成，写库后立即参与召回 |
| 买方 | 名称、区域、在采品类 | 信用分与账期影响撮合风险提示 |
| 采购单 | 品类、数量、时间窗 | 价格区间、认证要求、半径作为过滤条件 |

供方的品类行需要填「可供月份」；不填时按品类字典的产季自动补全，否则会因季节不匹配被过滤掉。

### 第 3 步 · 发起检索

「撮合检索」→ 选方向 → 设条件 → 开始检索。

| 条件 | 影响 |
|---|---|
| 检索方向 | 为采购单找货源 / 为货源找采购单 |
| 品类 | 决定召回通路与内容向量 |
| 数量 | 参与产能过滤与产能子分 |
| 等级 | 一级品要求一级率 ≥ 40 |
| 半径 | 决定 geohash 精度与前缀覆盖范围，≥9999 表示不限 |
| 最低履约 | 低于该值的主体被过滤 |
| 供货起止 | 与主体可供月份求交集 |
| 认证 | 多选时按 AND 处理 |

结果页可切换排序（匹配度 / 距离 / 价格 / 信用），每张卡片给出五维子分、报价分位、风险提示与召回通路。

### 第 4 步 · 记撮合

点结果卡片的「记撮合」，写入 `matches` 表（`state=confirmed`）。「检索记录 → 撮合」只显示确认过的记录，
自动召回产生的候选不计入台账。

### 第 5 步 · 调参

「算法参数」可改：

| 参数 | 默认 | 作用 |
|---|---|---|
| 履约率下限 | 75% | 硬过滤 |
| 信用分下限 | 60 | 硬过滤 |
| 场外交易上限 | 2 次 | 风控过滤 |
| 产能系数 | 0.8 | 需求量 × 系数 ≤ 可供量 |
| 距离衰减 λ | 60 km | 推荐流 `exp(-d/λ)` |
| 内容 / 品质 / 价格 / 地域权重 | 0.40 / 0.25 / 0.20 / 0.15 | 排序加权，和应为 1 |

参数写入 `settings` 表，保存后立即生效，无需重启。

---

## 方法论

完整推导与参考来源见 **[docs/geo-retrieval-and-lbs.md](docs/geo-retrieval-and-lbs.md)**，这里只给结论。

### 两段式空间检索

```text
原点 + 半径
  → 按半径选 geohash 精度（≤3km→6 位，≤12km→5 位，≤60km→4 位，≤250km→3 位…）
  → 枚举覆盖半径矩形的所有前缀（上限 64 格，避免 SQL 条件爆炸）
  → geohash 前缀区间扫描（走 B-tree 索引）
  → haversine 精算并按半径过滤
```

不用 `ORDER BY haversine(...)`：函数不可索引，等于全表排序。地理条件只做**过滤**，不参与打分器。

### 三路召回 + RRF

| 通路 | 取数 | 作用 |
|---|---|---|
| geo | 半径内、品类匹配 | 保证"近处优先" |
| content | 全量同品类（可带品种） | 保证不漏远处优质货源 |
| hot | 同品类按成交量与信用排序 | 冷门品类兜底 |

三路用 `1/(60+rank)` 融合。分数不可比时只看排名，免归一化、免调参。

### 排序公式

```text
total = 0.40 × 加权余弦(10 维)
      + 0.25 × (履约率 × 0.6 + 信用分 × 0.4)
      + 0.20 × 价格适配度
      + 0.15 × 地域分
      + 10（滞销助农）+ 5（有成交）+ 3（同区域）+ 2 × 兴趣权重
```

10 维向量：一级率、产能匹配、报价存在性、综合信用、履约率、地域分、三项认证、品种命中。
余弦先去均值，避免独热维度整体抬高相似度。

### LBS 推荐流

```text
score = wI × 兴趣 + wD × exp(-距离/λ) + wQ × 质量 + wF × 时效
```

没有行为画像时把兴趣权重让给距离/质量/时效，而不是把兴趣分当 0 把排序压平；同品类最多 2 条，避免整屏单一品类。

---

## 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查与各表条数 |
| GET | `/api/bootstrap` | 品类（含实时均价）、区域、枚举、参数、统计 |
| PATCH | `/api/settings` | 改阈值 / 权重 / 衰减系数 |
| GET | `/api/home` | 概览：指标、预警、品类结构、周边流 |
| GET | `/api/feed` | LBS 推荐流（`kind=demand/supplier/all`） |
| GET | `/api/market/:catId` | 行情：供需缺口、报价区间、分位 |
| GET | `/api/clusters` | geohash 网格聚合 |
| POST | `/api/events` | 行为埋点（view / favorite / detail / match_run / contact） |
| POST | `/api/match` | 执行检索 |
| POST | `/api/match/suggestions` | 累计放宽建议 |
| GET/POST | `/api/matches` | 撮合台账（`state=confirmed` 过滤） |
| GET | `/api/sessions` | 检索记录 |
| GET/POST/PATCH/DELETE | `/api/suppliers` | 供方台账 |
| GET/POST/PATCH/DELETE | `/api/buyers` | 买方台账 |
| GET/POST/PATCH/DELETE | `/api/demands` | 采购单 |
| GET/POST/DELETE | `/api/favorites` | 收藏 |

错误统一返回 `{ "error": "中文说明" }` 与 4xx/5xx 状态码。

---

## 数据模型

| 表 | 作用 | 关键字段 |
|---|---|---|
| `regions` | 区域点位 | `lat`, `lng`, `geohash(7)`, `parent_id` |
| `categories` | 品类字典 | `base_price`, `months`, `varieties`；均价实时汇总 |
| `suppliers` | 供方 | `credit`, `fulfillment`, `private_sales`, `certs`, `geohash` |
| `supplier_cats` | 供方 × 品类 | `supply`, `months`, `grade_a`, `price` |
| `buyers` | 买方 | `type`, `credit`, `pay_days`, `geohash` |
| `buyer_cats` | 买方在采品类 | `(buyer_id, cat_id)` |
| `demands` | 采购单 | `qty`, `price_low/high`, `from/to_date`, `radius`, `status` |
| `matches` | 撮合台账 | `score`, `subs`, `channels`, `state` |
| `search_sessions` | 检索记录 | `criteria`, `result_count`, `top_score` |
| `favorites` | 收藏 | `(entity_type, entity_id)` 唯一 |
| `interactions` | 行为埋点 | `action`, `cat_id`, `created_at` |
| `settings` | 阈值与权重 | `thresholds.*`, `weights.*`, `feed.*` |

索引：`suppliers.geohash`、`buyers.geohash`、`supplier_cats.cat_id`、`supplier_cats.supplier_id`、`demands.cat_id`、`demands.status`、`matches.created_at`。

---

## 数据来源与风险提示

> [!IMPORTANT]
> 本项目**不内置、不采集、不转售**任何真实交易数据。所有业务数据由使用者录入，随库保存，不向外发送。

| 数据 | 来源 | 可信度 | 风险 |
|---|---|---|---|
| 区域点位（17 条：信丰县及 10 镇、赣州、南昌、深圳、广州、东莞、长沙） | 人工整理的行政中心近似坐标 | 中 | 仅作检索中心，**不可用于地籍、测绘与补贴申报** |
| 品类字典（14 条：名称、大类、基准价、产季、亩产） | 公开农业资料与经验值整理 | 中低 | 基准价仅作定价起点参考，非实时行情 |
| 供方 / 买方 / 采购单 / 撮合 / 检索记录 | 使用者录入 | 取决于录入 | 库内自洽不代表外部真实 |
| 品类均价、可供量、价格分位 | 由库内报价实时聚合 | 取决于录入量 | 样本不足时数值无统计意义 |
| 距离、运距 | haversine 球面距离 | 高（几何） | **非路网距离**，实际运费与时效应另算 |

合规提示：

- 不包含个人信息；手机号为录入字段，请勿录入无关个人隐私。
- 埋点只记录动作、品类、坐标与时间，不含身份标识。
- 对外提供服务前需自行补充登录鉴权、操作审计与数据出境评估。
- 涉及农产品质量认证（绿色食品 / 有机 / 地理标志 / 出口备案）时，资质以发证机构核验为准。

---

## 部署建议

| 场景 | 建议 |
|---|---|
| 单机自用 | `npm start` 或 `start.bat`，数据在本地 `data/agrolane.db` |
| 内网多人 | 前置 Nginx 反代 + Basic Auth，定期备份 `.db` 文件 |
| 公网服务 | 先补鉴权与审计，再上 HTTPS；建议把 SQLite 换成 Postgres + PostGIS |
| 数据备份 | 停服后复制 `data/agrolane.db`（WAL 模式需一并复制 `-wal`/`-shm`，或执行 `PRAGMA wal_checkpoint`） |

---

## 测试

```bash
npm test
```

测试会另起进程与临时数据库（空库起，接口现造数据），跑完自动清理，不影响开发库。当前 **41 项断言**：

| 分组 | 覆盖 |
|---|---|
| 空库与字典 | 健康检查、初始为空、14 品类 / 17 区域、无报价时均价为空 |
| 台账录入 | 供方（多品类）、买方、采购单、月份自动补全、均价与可供量实时汇总 |
| 召回与推荐 | 半径收敛、同品类最多 2 条、冷启动标记、行为后画像生效、geohash 聚合 |
| 检索引擎 | 结果结构、五维子分、召回通路、理由与风险、分数区间、漏斗统计 |
| 反向检索 | 为货源找采购单 |
| 零结果 | 放宽建议与累计参数 |
| 台账维护 | 更新、检索、删除级联、删除后均价重算、手工记撮合 |
| 其他 | 收藏、检索记录落库、参数写入 |

前端用无头 Chromium（1440×900）验证过：四页渲染、三类台账新建、检索出结果、记撮合落库、原点切换，控制台无报错。

---

## FAQ

<details>
<summary><b>为什么不用 PostGIS？</b></summary>

县域级数据量（万级主体）用 SQLite 的 B-tree 前缀扫描完全够，且免去部署空间数据库的成本。迁移路径写在[算法设计](docs/geo-retrieval-and-lbs.md)第 6 节。
</details>

<details>
<summary><b>geohash 会不会漏掉边界上的点？</b></summary>

不会。检索枚举的是**覆盖半径矩形的全部前缀格**，不是用户所在的那一格；`<prefix>` 到 `<prefix>\uffff` 的区间写法保证边界格被包含。
</details>

<details>
<summary><b>为什么检索默认没有结果？</b></summary>

业务表初始为空。先录入供方与采购单；若已有数据仍为 0，看空态提示里的主要拒绝原因（产能/月份/半径/认证），点建议可自动放宽。
</details>

<details>
<summary><b>距离是实际运输距离吗？</b></summary>

不是。用的是 haversine 球面直线距离，只用于召回半径与地域分。真实运距、运费与时效需要另接路径规划服务。
</details>

<details>
<summary><b>可以改成手机端使用吗？</b></summary>

可以。窗口小于 860px 时侧栏自动塌成顶部导航，但表格类页面在窄屏体验一般；需要移动优先建议重做信息架构而不是套响应式。
</details>

<details>
<summary><b>数据存在哪里？会上传吗？</b></summary>

只存在本地 `data/agrolane.db`。没有任何外发请求，不接第三方行情或地图 API。
</details>

<details>
<summary><b>支持多用户同时用吗？</b></summary>

SQLite + WAL 支持少量并发读；当前没有鉴权，不适合直接公网多用户。需要多租户请先补鉴权与行级隔离。
</details>

<details>
<summary><b>为什么权重改了结果变化不大？</b></summary>

权重只影响打分，硬过滤先执行。若候选本身只剩一两家，权重对排序的影响会被分数区间压缩。
</details>

<details>
<summary><b>能导入 Excel 台账吗？</b></summary>

当前没有导入入口，可通过 `POST /api/suppliers`、`/api/buyers`、`/api/demands` 批量写入。导入功能在路线图中。
</details>

<details>
<summary><b>为什么品类均价显示"—"？</b></summary>

该品类还没有任何供方报价。系统不做推测填充，录入报价后自动汇总。
</details>

---

## 贡献指南

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。最小流程：

```bash
# 1. fork & clone
git clone https://github.com/YUN2023c/Agrolane.git
cd agrolane

# 2. 建分支
git checkout -b feat/your-feature

# 3. 改完自测
npm test

# 4. 提交（Conventional Commits）
git commit -m "feat(match): add season-aware capacity penalty"

# 5. 发起 Pull Request
```

| 约定 | 要求 |
|---|---|
| 代码风格 | 2 空格缩进、单引号、分号、CommonJS |
| 提交信息 | `feat\|fix\|docs\|refactor\|test\|chore(scope): 简述` |
| 改动范围 | 一次 PR 只做一件事；重排格式请单独提交 |
| 新增接口 | 同步更新 README 接口表与 `npm test` |
| 算法改动 | 说明改动前后的召回率/排序差异，附最小复现数据 |
| 文档 | 代码与文档必须同步，不允许留过期说明 |

---

## 引用说明

学术或文章引用请使用 [CITATION.cff](CITATION.cff)（GitHub 会显示 "Cite this repository"）：

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

引用算法部分时请一并引用[算法设计](docs/geo-retrieval-and-lbs.md)中列出的公开资料。

---

## 开源协议

代码以 **MIT License** 发布，见 [LICENSE](LICENSE)。

第三方组件（Express 及其传递依赖、Node.js 运行时、SQLite）的许可证与版权声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

用于商业项目时请保留版权与许可声明；本项目不提供任何形式的担保。

---

## 致谢与参考

- [Express](https://expressjs.com/) — Web 框架
- [SQLite](https://sqlite.org/) — 嵌入式数据库（Public Domain）
- [Node.js](https://nodejs.org/) — 运行时与内置 `node:sqlite`
- 空间索引与两段式检索思路参考：System Design Sandbox《Geospatial Indexing》、Yelp Nearby Search 系统设计、Real-Time Location-Based Recommendation System 等，出处见[算法设计](docs/geo-retrieval-and-lbs.md)第 5 节

---

<p align="center">
  <sub>Agrolane 农道 · 农业撮合检索 · MIT · 数据本地存储，不采集不上传</sub>
</p>
