# Third-Party Notices / 第三方组件声明

本文档列出 Agrolane（农道 · 农业撮合检索工具）在分发与运行时所依赖的第三方组件、版本与许可证。
本项目自身代码以 **MIT License** 发布（见 [LICENSE](LICENSE)），下列组件的版权归各自作者所有。

> 生成方式：依据 `package-lock.json` 逐个解析 `version` 与 `license` 字段。
> 升级依赖后请用 `npm ls --all` 或 `npx license-checker --summary` 复核本文档。

---

## 1. 汇总

| 类别 | 组件数 | 许可证分布 |
|---|---|---|
| 运行时直接依赖 | 1（`express`） | MIT 1 |
| 运行时传递依赖 | 64 | MIT 59 / ISC 4 / BSD-3-Clause 1 |
| 前端第三方库 | 0 | 原生 JS + CSS，无框架、无打包器 |
| 测试框架 | 0 | Node 内置 `fetch` + 断言脚本 |
| 运行时平台 | Node.js、SQLite | 见第 4 节 |

合计 npm 包 **65 个**，全部为宽松许可证（MIT / ISC / BSD-3-Clause），无 GPL / AGPL / SSPL 类传染性许可证。

---

## 2. 依赖清单

下表为 `package-lock.json` 中的全部 npm 包（含直接依赖 `express`），按包名排序。

| 包 | 版本 | 许可证 |
|---|---|---|
| `accepts` | 2.0.0 | MIT |
| `body-parser` | 2.4.0 | MIT |
| `bytes` | 3.1.2 | MIT |
| `call-bind-apply-helpers` | 1.0.2 | MIT |
| `call-bound` | 1.0.4 | MIT |
| `content-disposition` | 2.0.1 | MIT |
| `content-type` | 2.1.0 | MIT |
| `cookie` | 0.7.2 | MIT |
| `cookie-signature` | 1.2.2 | MIT |
| `debug` | 4.4.3 | MIT |
| `depd` | 2.0.0 | MIT |
| `dunder-proto` | 1.0.1 | MIT |
| `ee-first` | 1.1.1 | MIT |
| `encodeurl` | 2.0.3 | MIT |
| `es-define-property` | 1.0.1 | MIT |
| `es-errors` | 1.3.0 | MIT |
| `es-object-atoms` | 1.1.2 | MIT |
| `escape-html` | 1.0.3 | MIT |
| `etag` | 1.8.1 | MIT |
| `express` | 5.3.0 | MIT |
| `finalhandler` | 2.1.1 | MIT |
| `forwarded` | 0.2.0 | MIT |
| `fresh` | 2.0.0 | MIT |
| `function-bind` | 1.1.2 | MIT |
| `get-intrinsic` | 1.3.0 | MIT |
| `get-proto` | 1.0.1 | MIT |
| `gopd` | 1.2.0 | MIT |
| `has-symbols` | 1.1.0 | MIT |
| `hasown` | 2.0.4 | MIT |
| `http-errors` | 2.0.1 | MIT |
| `iconv-lite` | 0.7.3 | MIT |
| `inherits` | 2.0.4 | ISC |
| `ipaddr.js` | 1.9.1 | MIT |
| `is-promise` | 4.0.0 | MIT |
| `math-intrinsics` | 1.1.0 | MIT |
| `media-typer` | 1.1.1 | MIT |
| `merge-descriptors` | 2.0.0 | MIT |
| `mime-db` | 1.54.0 | MIT |
| `mime-types` | 3.0.2 | MIT |
| `ms` | 2.1.3 | MIT |
| `negotiator` | 1.1.0 | MIT |
| `object-inspect` | 1.14.0 | MIT |
| `on-finished` | 2.4.2 | MIT |
| `once` | 1.4.0 | ISC |
| `parseurl` | 1.3.3 | MIT |
| `path-to-regexp` | 8.4.2 | MIT |
| `proxy-addr` | 2.0.8 | MIT |
| `qs` | 6.17.1 | BSD-3-Clause |
| `range-parser` | 1.3.0 | MIT |
| `raw-body` | 3.0.2 | MIT |
| `router` | 2.3.0 | MIT |
| `safer-buffer` | 2.1.2 | MIT |
| `send` | 1.2.1 | MIT |
| `serve-static` | 2.2.1 | MIT |
| `setprototypeof` | 1.2.0 | ISC |
| `side-channel` | 1.1.1 | MIT |
| `side-channel-list` | 1.0.1 | MIT |
| `side-channel-map` | 1.0.1 | MIT |
| `side-channel-weakmap` | 1.0.2 | MIT |
| `statuses` | 2.0.2 | MIT |
| `toidentifier` | 1.0.1 | MIT |
| `type-is` | 2.1.0 | MIT |
| `unpipe` | 1.0.0 | MIT |
| `vary` | 1.1.2 | MIT |
| `wrappy` | 1.0.2 | ISC |

---

## 3. 许可证原文

### 3.1 MIT License

适用于上表中标注 `MIT` 的全部组件（含 `express`）。

```text
MIT License

Copyright (c) <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

各包的具体版权人见其包内 `LICENSE` 文件。

### 3.2 ISC License

适用于 `inherits`、`once`、`setprototypeof`、`wrappy`。

```text
ISC License

Copyright (c) <year> <copyright holders>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### 3.3 BSD-3-Clause License

适用于 `qs`（Express 的查询字符串解析依赖）。

```text
BSD 3-Clause License

Copyright (c) <year> <copyright holders>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

---

## 4. 运行时平台与内嵌组件

| 组件 | 版本要求 | 许可证 | 说明 |
|---|---|---|---|
| Node.js | ≥ 22.5 | MIT | 运行时。其发行包内还包含 V8（BSD-3-Clause）、libuv（MIT）、OpenSSL（Apache-2.0）、ICU（Unicode License）、zlib（zlib License）、c-ares（MIT）、llhttp（MIT）、nghttp2（MIT）等组件，完整清单见 Node.js 发行包内的 `LICENSE` 文件 |
| `node:sqlite` | Node.js 内置 | MIT（模块代码） | 通过 Node.js 官方模块调用 SQLite |
| SQLite | 内置版本随 Node.js 发行 | Public Domain | <https://sqlite.org/copyright.html> |

本项目**不打包** Node.js 与 SQLite 二进制，使用系统或运行环境自带的版本，因此不额外分发其许可证文本；
若你以容器镜像或可执行文件形式再分发，请一并附上 Node.js 发行包内的 `LICENSE`。

---

## 5. 开发与测试工具（不随产品分发）

| 工具 | 用途 | 是否列入依赖 |
|---|---|---|
| Playwright / Chromium | 本地界面回归截图（开发期人工验证） | 否，未写入 `package.json` |
| git / npm CLI | 版本与依赖管理 | 否 |

凡未写入 `dependencies` / `devDependencies` 的工具，均不属于本项目的分发范围。

---

## 6. 合规提示

1. **保留声明**：再分发本项目的源码或构建产物时，须保留本文件、`LICENSE` 以及各依赖包内的许可证与版权声明。
2. **商标**：`Agrolane` 为本项目名称，不授予任何商标许可；第三方名称（Express、Node.js、SQLite 等）归各自权利人所有。
3. **无担保**：所有第三方组件均按其原始许可证"按现状"提供，本项目作者不对其适用性、安全性、无侵权性作任何担保。
4. **安全更新**：依赖存在漏洞时，请在本仓库提 Issue 或直接升级 `package.json` 并重新生成本文档。

---

<sub>最后核对：2026-11-21 · 依据 `package-lock.json` 锁定的 `express@5.3.0` 依赖树</sub>
