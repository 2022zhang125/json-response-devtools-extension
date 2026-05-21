# Custom JSON Response Viewer

> 面向后端接口调试的 Chrome / Edge DevTools 扩展。以树形结构展示 JSON 响应，支持多项目 Swagger 跳转、响应解密与高级搜索。

---

## 功能特性

### JSON 树形查看器
- 自动拦截页面所有 XHR / Fetch 请求，过滤并展示 JSON 响应（含 404、500 等错误响应）
- 可折叠树形结构，层次清晰，支持大数据量浏览
- 双击任意 **Key**、**Value** 或 **对象/数组摘要** 直接复制内容
- URL 类型字符串渲染为可点击链接
- `Ctrl/Cmd + A` 一键复制当前完整响应（格式化 JSON，含解密内容）

### 请求列表
- 实时捕获并展示接口路径、HTTP 状态码、相对时间
- 切换请求时导航条平滑上下滑动，视觉反馈清晰
- 拖拽调整面板宽度，可折叠/展开以获得更大浏览区域
- 一键清空全部请求记录
- 配置 API 路径前缀后，自动过滤无关第三方请求，只捕获匹配的接口

### 响应搜索
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

### 响应解密
- 支持 SM4（国密）和 AES-128 ECB 两种算法
- 自动解密指定字段（默认 `data`），以树形展示解密后内容
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

点击浏览器工具栏中的扩展图标打开设置页面。

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
| 启用解密 | 全局开关 |
| 目标字段名 | 需要解密的 JSON 字段，多个用英文逗号分隔，默认 `data` |
| 密钥列表 | 每条含名称、算法（SM4 / AES-128）、密钥；解密时依次尝试 |

> 配置保存后立即生效，DevTools 面板无需刷新。

---

## 使用流程

1. 打开 DevTools（`F12`），切换到 **JSON Response** 面板
2. 刷新页面或正常操作，左侧列表自动收集匹配的 JSON 请求
3. 点击任意请求，右侧展示树形 JSON 内容（加密字段自动解密）
4. 在顶部搜索框输入关键词，实时高亮定位；可切换大小写、全词、正则模式
5. 点击接口名称（蓝色），自动跳转到对应项目的 Swagger 文档

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
| `Ctrl/Cmd + F` | 聚焦搜索框 |
| `Enter` | 跳转到下一个匹配项 |
| `Shift + Enter` | 跳转到上一个匹配项 |
| `Esc` | 清除搜索内容 / 取消聚焦 |
| `Ctrl/Cmd + A` | 复制当前完整 JSON 响应 |
| `Alt + C` | 切换区分大小写 |
| `Alt + W` | 切换全词匹配 |
| `Alt + R` | 切换正则表达式模式 |

---

## 文件结构

```
├── manifest.json          # 扩展描述与权限声明
├── config.js              # 默认值与 Storage Key 定义
├── background.js          # Service Worker，处理图标点击（打开设置页）
├── devtools.html          # DevTools 入口页
├── devtools.js            # 注册面板，捕获并过滤网络请求
├── panel.html             # JSON 查看器面板页面
├── panel.js               # 面板逻辑（树形渲染、搜索、Swagger 跳转、解密）
├── panel.css              # 面板样式
├── decrypt.js             # SM4 / AES 解密封装
├── options.html           # 设置页面
├── options.js             # 设置页逻辑（Swagger 多配置、解密多密钥管理）
├── options.css            # 设置页样式
├── swagger-content.js     # 注入页面的脚本（Swagger 自动定位接口）
└── lib/
    ├── crypto-js.js       # CryptoJS（AES 加解密）
    └── sm4.js             # sm-crypto SM4（国密加解密）
```
