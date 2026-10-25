# REA Typora Project · 0.5.0

一个以 Typora 编辑体验为目标、分阶段实现的独立 macOS Markdown 编辑器。应用名称为 **REA Markdown**，使用 **Swift / AppKit + WKWebView + Milkdown Crepe**。目前可以在本机打开、编辑、保存 Markdown，并处理本地图片与图片剪贴板。

**当前是可运行的阶段版本，不是完整 Typora 替代品。** 项目与 Typora 官方无隶属关系。图标采用项目所有者指定的 Typora 原版图标，资源归属和许可证边界见 [第三方声明](THIRD_PARTY_NOTICES.md)。

[下载 0.5.0](https://github.com/TheShyWR/REA-Typora-Project/releases/tag/v0.5.0) · [版本记录](CHANGELOG.md) · [完成度评估](docs/PROGRESS.md) · [验收说明](docs/VALIDATION.md)

## 目前能做什么

- 打开和保存 UTF-8 `.md`、`.markdown`、`.txt`，支持新建、另存为。
- 排版编辑与源码模式切换；基础标题、行内格式、列表、引用、任务列表、表格和代码编辑由 Milkdown 提供。基础列表键盘操作已有原版样例对照，其他复杂行为仍需补测。
- 无编辑保存保留原始字节，包括 UTF-8 BOM 和 CRLF；无法可靠往返的语法自动进入源码保护，可继续编辑保存，不将它误当作已完整支持的富文本语法。
- 检测磁盘文件外部修改，避免直接覆盖；本地恢复草稿支持异常退出后的未保存内容恢复。
- 显示本地图片，保留中文相对路径和替代文本；插入按钮自动复制图片到文档旁的附件目录。
- 排版模式支持图片粘贴。已实测从 macOS 预览复制图片内容、从 Finder 复制 PNG 文件；撤销、重做、保存并重启重开后仍可显示。
- 基础大纲、单层文件列表、查找、段落专注和明暗主题切换；提供初步 PDF 导出入口，完整排版和资源质量尚未验收。

## 完成度：约 35%

截至 0.5.0，按 macOS 功能范围和实际验证证据加权，估计完成 **约 35%**，合理区间 **30%–40%**。这是工程判断，不是自动测得的兼容率，也不是“写完五个版本就完成一半”。

当前进展主要集中在文件读写、恢复和基础图片流程。Typora 式符号显隐与精确选区、真实输入法候选态、扩展语法、递归文件树与搜索替换、附件迁移、完整主题与打字机、导出、多窗口及性能仍有较大缺口。详见 [评分口径与证据](docs/PROGRESS.md)。

## 下载与运行

在 [Releases](https://github.com/TheShyWR/REA-Typora-Project/releases) 下载 `REA-Markdown-0.5.0-macos-arm64.zip`，解压后打开 `REA Markdown.app`。运行不需要 Node.js；本地文件编辑不需要网络。

- 当前发布包：Apple Silicon / arm64。
- 构建目标：macOS 13.0+；尚未在全部旧系统版本验收。
- 签名：本机 ad-hoc 签名，没有 Developer ID 签名或 Apple 公证。
- `.sha256` 文件用于校验下载包。

## 从源码构建

需要 macOS、Xcode 或含 macOS SDK 的 Command Line Tools，以及 Node.js 22.12+（本机验证使用 Node.js 24）。

```sh
git clone https://github.com/TheShyWR/REA-Typora-Project.git
cd REA-Typora-Project
npm ci
npm run build:mac
open "release/REA Markdown.app"
```

`npm start` 会构建并打开；`npm run package:mac` 生成 ZIP 和 SHA-256 文件。构建采用当前 Mac 的 CPU 架构，Intel 构建尚未验收。构建中现有的 WebKit 文件类型 API 弃用、IIFE 动态语言加载警告尚未全部消除。

## 图片与文档安全

先保存文档，再插入或粘贴图片。附件保存在 `<文档名>.assets/`，Markdown 使用相对链接。允许 PNG、JPEG、GIF、WebP；实机测试集中在 PNG。单张或一次粘贴/拖放批次总量最多 20 MB。

文件拖入排版区域已接入持久化导入流程，实际跨窗口拖放手势仍待验收。源码模式请使用顶部“图片”按钮。移动文档时需同时携带附件并保持目录结构；跨目录另存为不会自动迁移附件。撤销插图不会自动删除附件。

草稿存放在 `~/Library/Application Support/local.rea.markdown/Recovery/`，是本机明文恢复文件；显式保存才更新原文档。恢复不能保证捕获异常终止瞬间尚未从 WebKit 发出的字符；保存冲突检测也不是跨进程事务锁。

## 工程结构

```text
src/                      Web 编辑器、图片、源码保护和样式
native/                   AppKit / WebKit 桥及文档、图片存储
  Resources/AppIcon.icns   应用图标（第三方资源）
scripts/                  构建、打包、第三方许可收集
docs/                     完成度、验收和第三方许可
index.html                编辑器页面入口
vite.config.js            Web 资源构建配置
package.json              开发依赖与命令
package-lock.json         可复现依赖锁定
CHANGELOG.md              0.1.0—0.5.0 阶段记录
LICENSE                   仓库原有 MIT 许可证
THIRD_PARTY_NOTICES.md     第三方归属与许可证边界
```

`node_modules/`、`build/`、`dist/`、`release/` 是本机构建产物，不提交 Git。旧 Electron 实验、REA 分析转储、测试脚本和临时样例已按项目所有者要求移出发布工程；验收结论保留在文档中，本仓库当前不提供 `npm test` 命令。历史测试不等于每个未来提交都会自动验证。

## 五个版本的开发过程

| 版本 | 阶段目标 | 实际进展 |
|---|---|---|
| 0.1.0 | 先做出能运行的本机编辑器 | 建立原生窗口与 Web 编辑器，完成 Markdown 打开、编辑、保存和源码切换；尝试过的 Electron 路径后来移除 |
| 0.2.0 | 优先保证文档可靠性 | 增加原始字节基线、外部修改冲突检查、恢复草稿、BOM/CRLF 保留和源码保护 |
| 0.3.0 | 开始对照原版编辑行为 | 修复模式往返焦点，调整列表序列化，实现段落专注；部分列表和模式切换序列与 Typora 对照通过 |
| 0.4.0 | 补齐本地图片和附件 | 支持中文路径显示、保留 alt 与路径、原生图片选择器、附件复制及文档上下文隔离 |
| 0.5.0 | 图片剪贴板持久化 | 支持预览/Finder 图片粘贴，先写附件再插入；加入批次校验、导入期间保护和文档切换取消；接入拖放流程 |

这些是实际开发阶段的整理，**不是五个可以逐个检出的历史提交**。仓库保留原始初始化提交，首个完整工程快照为 0.5.0；本次整理另补应用图标、便携构建脚本和发布文档，没有将未实现功能计作完成。

## 许可证与来源

保留仓库原有 MIT 许可证，适用于本项目自有代码。Milkdown、Vite 及其依赖遵循各自许可证。Typora 图标不在本项目 MIT 授权范围内，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。

REA 用于早期本机架构与行为研究；它不是编辑器运行或构建依赖。本仓库不包含 Typora 专有程序、编辑器源代码或授权系统。
