# Custom JSON Response Viewer

一款面向后端接口调试的 Chrome DevTools 扩展，以树形结构展示 JSON 响应，并支持一键跳转 Swagger 文档。

---

## 功能特性

### JSON 树形查看器
- 自动拦截页面中所有 XHR / Fetch 请求，过滤出 JSON 响应
- 以可折叠的树形结构展示 JSON 数据，层次清晰
- 双击任意 **Key**、**Value** 或 **对象/数组节点** 可直接复制内容
- URL 类型的字符串值渲染为可点击链接
- `Ctrl/Cmd + A` 一键复制当前完整响应（格式化后的 JSON）

### 请求列表
- 左侧面板实时显示捕获到的 JSON 请求，包含接口路径、HTTP 状态码和相对时间
- 支持拖拽调整面板宽度，可折叠/展开以获得更大查看区域
- 一键清空所有请求记录

### 响应搜索
- 顶部搜索框实时高亮匹配关键词
- `↑` / `↓` 按钮或 `Enter` / `Shift+Enter` 在匹配项间跳转
- `Ctrl/Cmd + F` 快速聚焦搜索框，`Esc` 清除搜索

### Swagger 联动
- 点击请求列表中的接口名称，自动打开 Swagger 文档并定位到对应接口
- 同时将接口路径复制到剪贴板，方便在 Swagger 内搜索

---

## 安装

1. 前往 `chrome://extensions`，开启右上角 **开发者模式**
2. 点击 **加载已解压的扩展程序**，选择本项目目录
3. 安装完成后，DevTools 面板中出现 **JSON Response** 标签页

---

## 配置

点击浏览器工具栏中的扩展图标，打开设置页面，可配置以下三项：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| **服务地址** | Swagger 所在服务器的根地址 | `http://192.168.1.9:8080` |
| **页面路径** | Swagger UI 的路由路径，拼接在服务地址之后 | `/loancrm-admin/doc.html#/home` |
| **去除的路径前缀** | 请求列表显示 API 名称时自动去除的前缀，每行一个 | `/loancrm-admin` |

配置保存后立即生效，DevTools 面板无需刷新。

> **默认值**在 `config.js` 中定义，修改该文件可更改出厂默认值。

---

## 使用

1. 打开 Chrome DevTools（`F12`），切换到 **JSON Response** 面板
2. 刷新页面或正常操作，左侧列表自动收集 JSON 接口请求
3. 点击任意请求，右侧展示树形 JSON 内容
4. 在顶部搜索框输入关键词，高亮定位匹配结果
5. 点击接口名称（蓝色链接），在新标签页打开 Swagger 并跳转到对应接口

---

## 自定义

**更改默认配置**：编辑 `config.js`

```js
const CONFIG = {
  SWAGGER_URL_SUFFIX: "/your-app/doc.html#/home",  // Swagger 页面路径
  API_PATH_PREFIX_STRIP: ["/your-app"],             // 需要去除的路径前缀
};
```

---

## 文件结构

```
├── manifest.json          # 扩展描述与权限声明
├── config.js              # 用户可配置的默认值和 Storage Key 定义
├── background.js          # Service Worker，处理图标点击事件
├── devtools.html          # DevTools 入口页
├── devtools.js            # 注册 DevTools 面板，捕获网络请求
├── panel.html             # JSON 查看器面板页面
├── panel.js               # 面板交互逻辑（树形渲染、搜索、侧边栏）
├── panel.css              # 面板样式
├── options.html           # 设置页面
├── options.js             # 设置页逻辑（读写 localStorage）
├── options.css            # 设置页样式
└── swagger-content.js     # 注入页面的内容脚本（Swagger 联动）
```

---

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + F` | 聚焦搜索框 |
| `Enter` | 跳转到下一个匹配项 |
| `Shift + Enter` | 跳转到上一个匹配项 |
| `Esc` | 清除搜索 / 取消聚焦 |
| `Ctrl/Cmd + A` | 复制当前完整 JSON 响应 |
