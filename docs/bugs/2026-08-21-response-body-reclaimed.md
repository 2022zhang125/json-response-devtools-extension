# 响应体被 DevTools 回收

## 现象

突发产生多条 XHR / Fetch 请求时，选择请求可能显示“响应体已被 DevTools 回收，重新发起该请求后可再次查看”。

## 根因

响应体虽然采用预取缓存，但 `getContent()` 被限制为 4 路并发。当前四个调用的回调未返回时，后续请求一直停留在队列中；等待期间 DevTools 可能释放这些尚未读取的响应体。

## 修复

- 每个 `onRequestFinished` 事件立即调用对应请求的 `getContent()`，不再通过并发队列延迟读取。
- 保留单次读取的 10 秒超时、5 MB 单体限制、64 MB 缓存预算和失败后重试。
- 增加突发请求回归测试，确保较早读取挂起时后续请求仍会立即开始读取。

## 验证

- `node --test tests/devtools.test.js`
- 全仓 JavaScript 文件通过 `node --check`
- `manifest.json` 可正常解析
- `git diff --check` 无错误
