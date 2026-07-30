# Custom JSON Response Viewer

> 面向后端接口调试的 Chrome / Edge DevTools 扩展。以树形结构展示 JSON 响应与请求载荷，支持多项目 Swagger 跳转、响应/请求双向解密、双 Tab 高级搜索与配置一键导入导出。

---

## 功能特性

### JSON 树形查看器
- 自动拦截页面所有 XHR / Fetch 请求，过滤并展示 JSON 响应（含 404、500 等错误响应）
- 可折叠树形结构，闭合括号 `}` / `]` 与对应开始行对齐，层次清晰
- 双击任意 **Key**、**Value** 或 **对象/数组摘要** 直接复制内容
- URL 类型字符串渲染为可点击链接
- `Ctrl/Cmd + A` 一键复制当前完整响应（格式化 JSON，含解密内容）

### 请求详情（Tab 切换）
右侧支持 **Response** 和 **Request** 双 Tab：
- **Response** — JSON 响应树
- **Request** — 显示顺序：Payload（请求载荷）→ General（URL/Method/Status）→ Request Headers
  - Payload 自动 JSON 解析并以树形展示
  - 表单编码自动解析为键值对
  - 加密的 Payload 字段自动解密（如 `encryptData`）

### 请求列表
- 实时捕获并展示接口路径、HTTP 状态码、相对时间
- 切换请求时导航条平滑上下滑动，视觉反馈清晰
- 拖拽调整面板宽度，可折叠/展开以获得更大浏览区域
- 一键清空全部请求记录
- 配置 API 路径前缀后，自动过滤无关第三方请求，只捕获匹配的接口

### 双 Tab 搜索
- 搜索作用于**当前激活的标签页**：Response 与 Request 各自独立，切换 Tab 后用当前关键词重绘目标面板
- Request 页可搜范围涵盖 General、Request Headers、JSON Payload 树、表单编码与纯文本 Payload
- 实时高亮匹配关键词，`↑` / `↓` 在匹配项间跳转
- 支持三种搜索模式（与 VSCode 一致）：
  - `Aa` 区分大小写（`Alt+C`）
  - 全词匹配（`Alt+W`）
  - `.*` 正则表达式（`Alt+R`）
- `Ctrl/Cmd + F` 快速聚焦搜索框，`Esc` 清除搜索

### 多项目 Swagger 联动
- 点击接口名称自动按**最长前缀匹配**选择对应项目的 Swagger 地址并跳转
- 支持配置多条 Swagger 地址，无需手动切换项目
- 跳转同时将接口路径复制到剪贴板，方便 Swagger 内二次搜索
- 接口名的点击热区仅覆盖文字本身，选中请求时不会误触跳转
- 提供**点击跳转开关**，可一键关闭跳转行为；关闭后接口名恢复为普通文本

### 配置一键导入 / 导出
- 设置页顶部按钮将全部配置（Swagger、点击跳转开关、解密开关、目标字段、密钥列表）导出为 JSON 文件
- 在另一台电脑导入即可同步，导入为**合并**模式：相同配置按业务身份去重更新，不重复添加
- ⚠️ 导出文件包含**解密密钥明文**，请通过可信渠道传输，勿公开分享

### 响应与请求解密
- 支持 SM4（国密）和 AES-128 ECB 两种算法
- **响应**：解密目标字段名匹配的值（默认 `data`，可配置多个），避免误解密
- **请求 Payload**：自动尝试解密所有字符串值（如 `encryptData` 等任意字段名）
- 支持配置多个密钥，解密时依次尝试，方便多项目一次配置随意切换
- 解密字段以 🔓 标识；搜索、`Ctrl+A` 复制均作用于解密后内容

---

## 安装

1. 前往 `chrome://extensions`（Edge 为 `edge://extensions`）
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择本项目目录
4. 安装成功后，打开 DevTools（`F12`）即可看到 **JSON Response** 标签页

---

## 配置

点击浏览器工具栏中的扩展图标打开设置页面。设置页顶部标题右侧提供**点击跳转开关**与**一键导出 / 导入 JSON**按钮。

### 点击跳转开关

控制在面板中点击接口名是否跳转到 Swagger，**默认开启**。关闭后接口名恢复为普通文本（置灰、不可点），彻底避免误触。该偏好保存在本地，并纳入配置导入 / 导出。

### 配置导入 / 导出

- **导出**：将 Swagger 配置、点击跳转开关、解密开关、目标字段、密钥列表打包为 JSON 文件下载。
- **导入**：选择导出的 JSON 文件，以**合并**模式写入——按配置 id 与业务身份（Swagger 按 `服务器地址 + 页面路径`，密钥按 `算法 + 密钥`）去重，命中则更新、未命中才追加，重复导入不会产生副本。
- 导入时对字段做白名单收敛与类型校验，`服务器地址` 或 `密钥` 为空的条目会被丢弃。

> ⚠️ 导出文件包含解密密钥明文，请勿公开分享。

### Swagger 配置

支持添加多条配置，每条包含：

| 字段 | 说明 | 示例 |
|------|------|------|
| 名称 | 便于识别的项目名 | `项目A` |
| 服务器地址 | Swagger 所在服务的根地址 | `http://192.168.1.9:8080` |
| Swagger 页面路径 | 拼接在服务器地址后的路由 | `/loancrm-admin/doc.html#/home` |
| API 路径前缀 | 用于匹配请求归属项目，同时作为请求捕获过滤条件（每行一个） | `/loancrm-admin` |

配置了 API 路径前缀后，DevTools 面板只会捕获路径匹配的请求，自动过滤掉第三方 CDN、统计、地图等无关请求。未配置时捕获全部 JSON 请求。

### 响应解密

| 字段 | 说明 |
|------|------|
| 启用解密 | 全局开关，同时控制响应和请求 Payload 解密 |
| 目标字段名 | 响应需要解密的字段名，多个用英文逗号分隔，默认 `data` |
| 密钥列表 | 每条含名称、算法（SM4 / AES-128）、密钥；解密时依次尝试 |

> 配置保存后立即生效，DevTools 面板无需刷新。

---

## 使用流程

1. 打开 DevTools（`F12`），切换到 **JSON Response** 面板
2. 刷新页面或正常操作，左侧列表自动收集匹配的 JSON 请求
3. 点击任意请求，右侧默认展示 **Response** 树形 JSON（加密字段自动解密）
4. 切换到 **Request** Tab 查看 Payload、URL、Method、Headers
5. 在顶部搜索框输入关键词，实时高亮定位；搜索作用于当前 Tab，可切换大小写、全词、正则模式
6. 点击接口名称（蓝色），自动跳转到对应项目的 Swagger 文档（可在设置页关闭该跳转）

---

## 默认值修改

编辑根目录 `config.js` 可更改出厂默认值：

```js
const CONFIG = {
  // Swagger 页面路径默认值（用户未配置时的回退）
  SWAGGER_URL_SUFFIX: "/your-app/doc.html#/home",

  // API 路径前缀默认值（用户未配置时的回退）
  API_PATH_PREFIX_STRIP: ["/your-app"],
};
```

---

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + F` | 聚焦搜索框（Response / Request 均可用） |
| `Enter` | 跳转到下一个匹配项 |
| `Shift + Enter` | 跳转到上一个匹配项 |
| `Esc` | 清除搜索内容 / 取消聚焦 |
| `Ctrl/Cmd + A` | 复制当前完整 JSON 响应 |
| `Alt + C` | 切换区分大小写 |
| `Alt + W` | 切换全词匹配 |
| `Alt + R` | 切换正则表达式模式 |

---

## 打包发布

使用 PowerShell 调用 .NET API 打包，保留 `lib/` 与 `icons/` 子目录结构：

```powershell
Add-Type -Assembly System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open('release.zip', 'Create')
# 根目录文件 + lib/、icons/ 子目录文件依次添加
$zip.Dispose()
```

> 不要使用 `Compress-Archive`——它会把子目录文件打平到根目录，导致 `lib/crypto-js.js` 无法加载（解密功能失效）、`icons/` 下的图标全部丢失。

---

## 文件结构

```
├── manifest.json          # 扩展描述与权限声明
├── config.js              # 默认值与 Storage Key 定义
├── background.js          # Service Worker，处理图标点击（打开设置页）
├── devtools.html          # DevTools 入口页
├── devtools.js            # 注册面板，捕获并过滤网络请求（含 Headers/Payload）
├── panel.html             # JSON 查看器面板页面（含 Response/Request Tab）
├── panel.js               # 面板逻辑（树形渲染、搜索、Swagger 跳转、解密）
├── panel.css              # 面板样式
├── decrypt.js             # SM4 / AES 解密封装
├── options.html           # 设置页面
├── options.js             # 设置页逻辑（Swagger 多配置、解密多密钥管理）
├── options.css            # 设置页样式
├── swagger-content.js     # Swagger 自动定位接口脚本（按需注入，不是常驻内容脚本）
├── icons/                 # 各尺寸图标（16/32/48/128；512 为源图，仅用于重新生成）
└── lib/
    ├── crypto-js.js       # CryptoJS（AES 加解密，按需懒加载）
    └── sm4.js             # sm-crypto SM4（国密加解密，按需懒加载）
```

## 性能说明

为了避免拖慢浏览器与 DevTools，扩展做了以下约束，修改代码时请勿破坏：

- **`swagger-content.js` 不是常驻内容脚本。** 它只在面板打开 Swagger 标签页后，由
  `panel.js` 通过 `chrome.scripting.executeScript` 注入到那一个标签页。若把它重新写回
  `manifest.json` 的 `content_scripts`，每次页面导航都会多一次脚本拉取与解析。
- **`lib/crypto-js.js` + `lib/sm4.js`（约 200 KB）由 `panel.js` 懒加载**，只在解密开关
  打开且配置了密钥时才请求，不要在 `panel.html` 里用 `<script>` 直接引入。
- **图标必须使用 `icons/` 下对应尺寸的文件。** 早期版本在 16/48/128 三个位置都填了同一张
  1024×1024（1.3 MB）大图，浏览器启动时要反复解码。
- **请求历史有上限**：`devtools.js` 与 `panel.js` 各自的 `MAX_REQUESTS`（300）必须保持一致，
  超过 5 MB 的响应体会被跳过（`MAX_CONTENT_BYTES`）。
- **JSON 树的复制用事件委托**（`markCopyable()` + `setupCopyDelegation()`）。不要给每个节点
  单独 `addEventListener("dblclick")`——一个 160 KB 的响应会产生两万多个节点。
