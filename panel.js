const layoutEl = document.getElementById("layout");
const requestListEl = document.getElementById("requestList");
const resizeHandleEl = document.getElementById("resizeHandle");
const collapseSidebarBtn = document.getElementById("collapseSidebarBtn");
const expandSidebarBtn = document.getElementById("expandSidebarBtn");
const clearRequestsBtn = document.getElementById("clearRequestsBtn");
const jsonViewerEl = document.getElementById("jsonViewer");
const requestViewerEl = document.getElementById("requestViewer");
const tabResponseBtn = document.getElementById("tabResponse");
const tabRequestBtn = document.getElementById("tabRequest");
const searchInputEl = document.getElementById("searchInput");
const searchCountEl = document.getElementById("searchCount");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const toastEl = document.getElementById("toast");

const searchCaseSensitiveBtn = document.getElementById("searchCaseSensitiveBtn");
const searchWholeWordBtn = document.getElementById("searchWholeWordBtn");
const searchRegexBtn = document.getElementById("searchRegexBtn");

let activeTab = "response"; // "response" | "request"

const requests = [];

let activeRequest = null;
let activeJsonText = "";
let activeJsonData = null;
let activeProcessedData = null;

let searchText = "";
let searchMatches = [];
let currentMatchIndex = -1;
let searchCaseSensitive = false;
let searchWholeWord = false;
let searchUseRegex = false;

let sidebarWidth =
  Number(localStorage.getItem(CONFIG.STORAGE_KEYS.SIDEBAR_WIDTH)) || 320;
let isSidebarCollapsed =
  localStorage.getItem(CONFIG.STORAGE_KEYS.SIDEBAR_COLLAPSED) === "true";

applySidebarState();
setupSidebarResize();
setupSidebarCollapse();
updateSearchButtons();
setupClearRequests();
setupSearchToggleButtons();
setupTabs();

// Re-sync prefix config to devtools.js whenever settings are saved in options page
window.addEventListener("storage", (event) => {
  if (
    event.key === CONFIG.STORAGE_KEYS.SWAGGER_CONFIGS ||
    event.key === CONFIG.STORAGE_KEYS.API_PREFIX_STRIP
  ) {
    syncConfigToDevtools();
  }
});

const port = chrome.runtime.connect({
  name: "json-response-panel",
});

// Send current prefix config to devtools.js so it can filter captured requests
function syncConfigToDevtools() {
  port.postMessage({
    type: "sync-config",
    prefixes: getAllPrefixList(),
  });
}

port.onMessage.addListener((message) => {
  if (message.type === "init-requests") {
    requests.length = 0;
    requests.push(...message.requests);
    syncConfigToDevtools();
    renderRequestList();
    return;
  }

  if (message.type === "request-added") {
    requests.push(message.request);
    renderRequestList();
    return;
  }

  if (message.type === "requests-cleared") {
    clearRequestsLocal();
  }
});

// Sliding indicator bar
const indicatorEl = document.createElement("div");
indicatorEl.className = "request-list-indicator";
indicatorEl.style.opacity = "0";
requestListEl.appendChild(indicatorEl);

function moveIndicatorTo(itemEl) {
  if (!itemEl) {
    indicatorEl.style.opacity = "0";
    return;
  }
  indicatorEl.style.opacity = "1";
  indicatorEl.style.top = `${itemEl.offsetTop}px`;
  indicatorEl.style.height = `${itemEl.offsetHeight}px`;
}

function renderRequestList() {
  const existingItems = new Map();
  for (const el of requestListEl.children) {
    if (el.__request) existingItems.set(el.__request, el);
  }

  const toRemove = new Set(existingItems.keys());

  requests.forEach((request, index) => {
    toRemove.delete(request);

    let item = existingItems.get(request);

    if (!item) {
      item = buildRequestItem(request);
      item.style.animationDelay = `${Math.min(index * 18, 120)}ms`;
      item.classList.add("request-item--enter");
      requestListEl.appendChild(item);
    }

    item.classList.toggle("is-active", request === activeRequest);  });

  for (const req of toRemove) {
    existingItems.get(req)?.remove();
  }

  // Sync indicator to current active item (handles init & restore)
  const activeEl = [...requestListEl.children].find(
    (el) => el.__request === activeRequest,
  );
  moveIndicatorTo(activeEl || null);
}

function buildRequestItem(request) {
  const item = document.createElement("div");
  item.className = "request-item";
  item.__request = request;

  const main = document.createElement("div");
  main.className = "request-item-main";

  const requestApiPath = getRequestName(request.url);

  const name = document.createElement("div");
  name.className = "request-name";
  name.textContent = requestApiPath;
  name.title = `Open Swagger and search ${requestApiPath}`;

  name.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openSwaggerAndSearch(requestApiPath, request.url);
  });

  const time = document.createElement("span");
  time.className = "request-time";
  time.textContent = request.relativeTimeText || "";
  time.title = request.createdAt
    ? new Date(request.createdAt).toLocaleString()
    : "";

  const status = document.createElement("span");
  status.className = `request-status ${getStatusClass(request.status)}`;
  status.textContent = request.status || "-";
  status.title = `${request.status || "-"} ${request.statusText || ""}`;

  const url = document.createElement("div");
  url.className = "request-url";
  url.textContent = request.url;
  url.title = request.url;

  main.append(name, time, status);
  item.append(main, url);

  item.addEventListener("click", () => {
    if (activeRequest === request) return;
    activeRequest = request;
    for (const el of requestListEl.children) {
      if (el === indicatorEl) continue;
      el.classList.toggle("is-active", el.__request === request);
    }
    moveIndicatorTo(item);
    loadRequestContent(request);
  });

  return item;
}

function loadRequestContent(request) {
  activeJsonText = request.content || "";
  renderRequestViewer(request);

  try {
    activeJsonData = JSON.parse(activeJsonText);
    activeProcessedData = tryDecryptFields(activeJsonData);
    renderJson(activeProcessedData);
  } catch (error) {
    activeJsonData = null;
    activeProcessedData = null;
    jsonViewerEl.replaceChildren();

    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = `JSON parse failed: ${error.message}`;

    jsonViewerEl.appendChild(empty);
    resetSearchState();
  }
}

function renderJson(data) {
  jsonViewerEl.replaceChildren();
  searchMatches = [];

  const root = document.createElement("div");
  root.className = "json-tree-root";
  root.appendChild(createJsonNode(data));

  jsonViewerEl.appendChild(root);

  normalizeCurrentMatchIndex();
  updateCurrentMatch(false);
  updateSearchCount();
  updateSearchButtons();
}

function createJsonNode(value, key) {
  if (Array.isArray(value)) {
    return createObjectLikeNode(value, key, "[", "]", `${value.length} items`);
  }

  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    return createObjectLikeNode(value, key, "{", "}", `${keys.length} keys`);
  }

  return createPrimitiveNode(value, key);
}

function createObjectLikeNode(value, key, openToken, closeToken, summary) {
  const node = document.createElement("div");
  node.className = "json-tree-node";

  const line = document.createElement("div");
  line.className = "json-tree-line";

  const toggle = document.createElement("button");
  toggle.className = "json-tree-toggle";
  toggle.textContent = "▾";

  const keyElement = createKeyElement(key);
  const open = createSpan("json-punctuation", openToken);
  const summaryElement = createHighlightedSpan("json-summary", summary);
  summaryElement.title = "Double-click to copy this object or array";

  summaryElement.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    copyText(JSON.stringify(value, null, 2), "JSON copied");
  });

  line.appendChild(toggle);

  if (keyElement) {
    line.appendChild(keyElement);
    line.appendChild(createSpan("json-punctuation", ": "));
  }

  line.append(open, summaryElement);

  const children = document.createElement("div");
  children.className = "json-tree-children";

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);

  for (const [childKey, childValue] of entries) {
    const childNode = createJsonNode(
      childValue,
      Array.isArray(value) ? undefined : childKey,
    );
    children.appendChild(childNode);
  }

  const closeLine = document.createElement("div");
  closeLine.className = "json-tree-line json-tree-close-line";
  closeLine.appendChild(createSpan("json-tree-toggle-placeholder", ""));
  closeLine.appendChild(createSpan("json-punctuation", closeToken));

  toggle.addEventListener("click", () => {
    const collapsed = children.style.display !== "none";
    children.style.display = collapsed ? "none" : "";
    closeLine.style.display = collapsed ? "none" : "";
    toggle.textContent = collapsed ? "▸" : "▾";

    setHighlightedText(
      summaryElement,
      collapsed ? `${openToken}...${closeToken} ${summary}` : summary,
    );
  });

  node.append(line, children, closeLine);
  return node;
}

function createPrimitiveNode(value, key) {
  const line = document.createElement("div");
  line.className = "json-tree-line";

  line.appendChild(createSpan("json-tree-toggle-placeholder", ""));

  const keyElement = createKeyElement(key);

  if (keyElement) {
    line.appendChild(keyElement);
    line.appendChild(createSpan("json-punctuation", ": "));
  }

  line.appendChild(createPrimitiveValue(value));

  return line;
}

function createKeyElement(key) {
  if (key === undefined) {
    return null;
  }

  const isDecrypted = key.startsWith("__dec__");
  const displayKey = isDecrypted ? key.slice(7) : key;

  const keyElement = createHighlightedSpan(
    isDecrypted ? "json-key json-key--decrypted" : "json-key",
    `"${displayKey}"`,
  );
  keyElement.title = isDecrypted
    ? "已解密 — Double-click to copy key"
    : "Double-click to copy key";

  if (isDecrypted) {
    const badge = document.createElement("span");
    badge.className = "json-decrypt-badge";
    badge.textContent = "🔓";
    badge.title = "此字段已自动解密";
    keyElement.appendChild(badge);
  }

  keyElement.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    copyText(displayKey, "Key copied");
  });

  return keyElement;
}

function createPrimitiveValue(value) {
  if (typeof value === "string") {
    const displayValue = JSON.stringify(value);

    if (/^https?:\/\//.test(value)) {
      const link = document.createElement("a");
      link.className = "json-string json-url";
      link.href = value;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = "Double-click to copy value";

      appendHighlightedText(link, displayValue);

      link.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        copyText(value, "Value copied");
      });

      return link;
    }

    const stringElement = createHighlightedSpan("json-string", displayValue);
    stringElement.title = "Double-click to copy value";

    stringElement.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyText(value, "Value copied");
    });

    return stringElement;
  }

  if (typeof value === "number") {
    const numberElement = createHighlightedSpan("json-number", String(value));
    numberElement.title = "Double-click to copy value";
    numberElement.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyText(String(value), "Value copied");
    });
    return numberElement;
  }

  if (typeof value === "boolean") {
    const booleanElement = createHighlightedSpan("json-boolean", String(value));
    booleanElement.title = "Double-click to copy value";
    booleanElement.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyText(String(value), "Value copied");
    });
    return booleanElement;
  }

  if (value === null) {
    const nullElement = createHighlightedSpan("json-null", "null");
    nullElement.title = "Double-click to copy value";
    nullElement.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyText("null", "Value copied");
    });
    return nullElement;
  }

  return createHighlightedSpan("", String(value));
}

function createSpan(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function createHighlightedSpan(className, text) {
  const span = document.createElement("span");
  span.className = className;
  appendHighlightedText(span, text);
  return span;
}

function appendHighlightedText(element, text) {
  const query = searchText.trim();

  if (!query) {
    element.textContent = text;
    return;
  }

  const regex = buildSearchRegex(query);

  if (!regex) {
    element.textContent = text;
    return;
  }

  const matches = [...text.matchAll(regex)];

  if (matches.length === 0) {
    element.textContent = text;
    return;
  }

  let lastIndex = 0;

  for (const match of matches) {
    const start = match.index;
    const end = start + match[0].length;

    if (start > lastIndex) {
      element.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }

    const mark = document.createElement("mark");
    mark.className = "json-search-mark";
    mark.textContent = text.slice(start, end);
    element.appendChild(mark);
    searchMatches.push(mark);

    lastIndex = end;
  }

  if (lastIndex < text.length) {
    element.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function buildSearchRegex(query) {
  try {
    let pattern = searchUseRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    if (searchWholeWord) {
      pattern = `\\b${pattern}\\b`;
    }

    const flags = "g" + (searchCaseSensitive ? "" : "i");
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function setHighlightedText(element, text) {
  element.replaceChildren();
  appendHighlightedText(element, text);
}

function updateSearchCount() {
  const query = searchText.trim();

  if (!query) {
    searchCountEl.textContent = "";
    searchCountEl.classList.remove("search-count--error");
    return;
  }

  if (searchUseRegex && !buildSearchRegex(query)) {
    searchCountEl.textContent = "无效正则";
    searchCountEl.classList.add("search-count--error");
    return;
  }

  searchCountEl.classList.remove("search-count--error");

  if (searchMatches.length === 0) {
    searchCountEl.textContent = "0 / 0";
    return;
  }

  searchCountEl.textContent = `${currentMatchIndex + 1} / ${searchMatches.length}`;
}

function normalizeCurrentMatchIndex() {
  if (!searchText.trim() || searchMatches.length === 0) {
    currentMatchIndex = -1;
    return;
  }

  if (currentMatchIndex < 0) {
    currentMatchIndex = 0;
  }

  if (currentMatchIndex >= searchMatches.length) {
    currentMatchIndex = searchMatches.length - 1;
  }
}

function goToSearchMatch(direction) {
  if (searchMatches.length === 0) {
    return;
  }

  if (currentMatchIndex === -1) {
    currentMatchIndex = 0;
  } else {
    currentMatchIndex =
      (currentMatchIndex + direction + searchMatches.length) %
      searchMatches.length;
  }

  updateCurrentMatch(true);
  updateSearchCount();
  updateSearchButtons();
}

function updateCurrentMatch(shouldScroll) {
  for (const matchElement of searchMatches) {
    matchElement.classList.remove("is-current");
  }

  if (currentMatchIndex < 0 || currentMatchIndex >= searchMatches.length) {
    return;
  }

  const currentElement = searchMatches[currentMatchIndex];
  currentElement.classList.add("is-current");

  if (shouldScroll) {
    currentElement.scrollIntoView({
      block: "center",
      inline: "nearest",
    });
  }
}

function updateSearchButtons() {
  const disabled = searchMatches.length === 0;
  prevBtn.disabled = disabled;
  nextBtn.disabled = disabled;
}

function resetSearchState() {
  searchMatches = [];
  currentMatchIndex = -1;
  updateSearchCount();
  updateSearchButtons();
}

searchInputEl.addEventListener("input", () => {
  searchText = searchInputEl.value;
  currentMatchIndex = 0;

  if (activeProcessedData) {
    renderJson(activeProcessedData);
  }
});

searchInputEl.addEventListener("keydown", (event) => {
  event.stopPropagation();

  if (event.key === "Enter") {
    event.preventDefault();
    goToSearchMatch(event.shiftKey ? -1 : 1);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();

    if (searchText) {
      searchText = "";
      searchInputEl.value = "";

      if (activeProcessedData) {
        renderJson(activeProcessedData);
      }
    } else {
      searchInputEl.blur();
    }
  }
});

prevBtn.addEventListener("click", () => {
  goToSearchMatch(-1);
});

nextBtn.addEventListener("click", () => {
  goToSearchMatch(1);
});

document.addEventListener(
  "keydown",
  (event) => {
    const key = event.key.toLowerCase();
    const isModifierPressed = event.ctrlKey || event.metaKey;

    if (!isModifierPressed) {
      return;
    }

    const isSearchFocused = document.activeElement === searchInputEl;

    if (key === "f") {
      event.preventDefault();
      event.stopPropagation();
      searchInputEl.focus();
      searchInputEl.select();
      return;
    }

    if (key === "a" && !isSearchFocused) {
      event.preventDefault();
      event.stopPropagation();
      copyText(getPrettyJsonText(), "Response copied", { flash: true });
    }
  },
  true,
);

function getPrettyJsonText() {
  if (activeProcessedData) {
    return JSON.stringify(activeProcessedData, null, 2);
  }

  if (!activeJsonText) {
    return "";
  }

  try {
    return JSON.stringify(JSON.parse(activeJsonText), null, 2);
  } catch {
    return activeJsonText;
  }
}

function copyText(text, message, options = {}) {
  if (!text) {
    showToast("Nothing to copy");
    return;
  }

  navigator.clipboard
    .writeText(text)
    .then(() => {
      if (options.flash) {
        flashCopyArea();
      }

      showToast(message);
    })
    .catch(() => {
      showToast("Copy failed");
    });
}

function flashCopyArea() {
  const appEl = document.querySelector(".app");

  if (!appEl) {
    return;
  }

  appEl.classList.remove("is-copy-flash");

  requestAnimationFrame(() => {
    appEl.classList.add("is-copy-flash");

    window.setTimeout(() => {
      appEl.classList.remove("is-copy-flash");
    }, 420);
  });
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");

  window.setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 1200);
}

function getRequestName(url) {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;

    return normalizeApiPath(pathname);
  } catch {
    return normalizeApiPath(url);
  }
}

function normalizeApiPath(pathname) {
  if (!pathname) {
    return "";
  }

  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const prefixList = getAllPrefixList();

  for (const prefix of prefixList) {
    if (normalizedPath === prefix) {
      return "/";
    }

    if (normalizedPath.startsWith(`${prefix}/`)) {
      return normalizedPath.slice(prefix.length);
    }
  }

  return normalizedPath;
}

function getStatusClass(status) {
  const statusCode = Number(status);

  if (statusCode >= 200 && statusCode < 300) {
    return "is-success";
  }

  if (statusCode >= 300 && statusCode < 400) {
    return "is-redirect";
  }

  if (statusCode >= 400 && statusCode < 500) {
    return "is-warning";
  }

  if (statusCode >= 500) {
    return "is-error";
  }

  return "is-default";
}

function applySidebarState() {
  sidebarWidth = Math.min(Math.max(sidebarWidth, 220), 720);
  layoutEl.style.setProperty("--request-panel-width", `${sidebarWidth}px`);

  layoutEl.classList.toggle("is-sidebar-collapsed", isSidebarCollapsed);
  expandSidebarBtn.classList.toggle("hidden", !isSidebarCollapsed);
}

function setupSidebarCollapse() {
  collapseSidebarBtn.addEventListener("click", () => {
    if (!activeRequest) {
      showToast("Please select a request first");
      return;
    }

    isSidebarCollapsed = true;
    localStorage.setItem(CONFIG.STORAGE_KEYS.SIDEBAR_COLLAPSED, "true");
    applySidebarState();
  });

  expandSidebarBtn.addEventListener("click", () => {
    isSidebarCollapsed = false;
    localStorage.setItem(CONFIG.STORAGE_KEYS.SIDEBAR_COLLAPSED, "false");
    applySidebarState();
  });
}

function setupSidebarResize() {
  let startX = 0;
  let startWidth = 0;

  resizeHandleEl.addEventListener("mousedown", (event) => {
    if (isSidebarCollapsed) {
      return;
    }

    startX = event.clientX;
    startWidth = sidebarWidth;

    document.body.classList.add("is-resizing");
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    event.preventDefault();
  });

  function handleMouseMove(event) {
    const deltaX = event.clientX - startX;
    sidebarWidth = Math.min(Math.max(startWidth + deltaX, 220), 720);

    layoutEl.style.setProperty("--request-panel-width", `${sidebarWidth}px`);
  }

  function handleMouseUp() {
    document.body.classList.remove("is-resizing");
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);

    localStorage.setItem(CONFIG.STORAGE_KEYS.SIDEBAR_WIDTH, String(sidebarWidth));
  }
}

function setupClearRequests() {
  clearRequestsBtn.addEventListener("click", () => {
    clearRequests();
  });
}

function clearRequests() {
  port.postMessage({
    type: "clear-requests",
  });
}

function clearRequestsLocal() {
  requests.length = 0;

  activeRequest = null;
  activeJsonText = "";
  activeJsonData = null;
  activeProcessedData = null;

  searchText = "";
  searchMatches = [];
  currentMatchIndex = -1;
  searchInputEl.value = "";

  // Remove only request items, keep indicatorEl
  for (const el of [...requestListEl.children]) {
    if (el.__request) el.remove();
  }
  moveIndicatorTo(null);

  jsonViewerEl.replaceChildren();

  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = "Select a JSON request from the left panel.";

  jsonViewerEl.appendChild(empty);

  updateSearchCount();
  updateSearchButtons();

  showToast("Requests cleared");
}

function openSwaggerAndSearch(displayPath, originalUrl) {
  const configs = getSwaggerConfigs();

  if (configs.length === 0) {
    showToast("请先在设置页面配置 Swagger 地址");
    return;
  }

  let originalPathname = displayPath;
  try {
    originalPathname = new URL(originalUrl).pathname;
  } catch {}

  const cfg = findMatchingSwaggerConfig(originalPathname, configs);
  const swaggerUrl = buildSwaggerUrl(cfg.base, cfg.suffix, displayPath);

  navigator.clipboard
    .writeText(displayPath)
    .catch(() => {})
    .finally(() => {
      chrome.tabs.create({ url: swaggerUrl });
      showToast(`Opening Swagger: ${displayPath}`);
    });
}

function buildSwaggerUrl(base, suffix, apiPath) {
  const normalizedBase = base.replace(/\/+$/, "");
  const encodedApiPath = encodeURIComponent(apiPath);
  return `${normalizedBase}${suffix}?jsonResponseSearch=${encodedApiPath}`;
}

function getSwaggerConfigs() {
  const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.SWAGGER_CONFIGS);
  if (stored) {
    try { return JSON.parse(stored); } catch {}
  }
  // Legacy fallback
  const base = localStorage.getItem(CONFIG.STORAGE_KEYS.SWAGGER_BASE) || "";
  if (!base) return [];
  const suffix =
    localStorage.getItem(CONFIG.STORAGE_KEYS.SWAGGER_SUFFIX) ||
    CONFIG.SWAGGER_URL_SUFFIX;
  const prefixesRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.API_PREFIX_STRIP);
  let prefixes = CONFIG.API_PATH_PREFIX_STRIP;
  if (prefixesRaw) { try { prefixes = JSON.parse(prefixesRaw); } catch {} }
  return [{ id: "legacy", name: "", base, suffix, prefixes }];
}

function findMatchingSwaggerConfig(pathname, configs) {
  let best = configs[0];
  let bestLen = -1;
  for (const cfg of configs) {
    for (const prefix of (cfg.prefixes || [])) {
      if (
        prefix &&
        pathname.startsWith(prefix) &&
        prefix.length > bestLen
      ) {
        best = cfg;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}

function getAllPrefixList() {
  const configs = getSwaggerConfigs();
  const seen = new Set();
  const list = [];
  for (const cfg of configs) {
    for (const p of cfg.prefixes || []) {
      if (p && !seen.has(p)) { seen.add(p); list.push(p); }
    }
  }
  // Longest prefix first for correct stripping
  list.sort((a, b) => b.length - a.length);
  // Fall back to CONFIG defaults if nothing configured
  if (list.length === 0) return CONFIG.API_PATH_PREFIX_STRIP;
  return list;
}

// ── Decrypt helpers ───────────────────────────────────────────────────────────

function tryDecryptFields(data) {
  if (!data || typeof data !== "object") return data;

  const enabled =
    localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_ENABLED) === "true";
  if (!enabled) return data;

  const keys = getDecryptKeys();
  if (keys.length === 0) return data;

  const fieldRaw =
    localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_FIELD) || "data";
  const fields = fieldRaw
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  if (fields.length === 0) return data;

  return decryptObjectFields(data, fields, keys);
}

function decryptObjectFields(obj, fields, keys) {
  if (Array.isArray(obj)) {
    return obj.map((item) => decryptObjectFields(item, fields, keys));
  }

  if (obj !== null && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (fields.includes(k) && typeof v === "string" && v.length > 0) {
        // Try each key in order until one succeeds
        let decrypted = null;
        for (const keyConfig of keys) {
          decrypted = DECRYPTOR.decrypt(v, keyConfig.algorithm, keyConfig.key);
          if (decrypted) break;
        }
        if (decrypted) {
          try {
            result[`__dec__${k}`] = JSON.parse(decrypted);
          } catch {
            result[`__dec__${k}`] = decrypted;
          }
        } else {
          result[k] = v;
        }
      } else {
        result[k] = decryptObjectFields(v, fields, keys);
      }
    }
    return result;
  }

  return obj;
}

function getDecryptKeys() {
  const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_CONFIGS);
  if (stored) {
    try {
      return JSON.parse(stored).filter((k) => k.key && k.algorithm);
    } catch {}
  }
  // Legacy fallback
  const key = localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_KEY) || "";
  const algorithm =
    localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_ALGORITHM) || "SM4";
  if (key) return [{ algorithm, key }];
  return [];
}

// Like tryDecryptFields but tries ALL string values regardless of field name.
// Used for request payload where field names may not match the configured target fields.
function tryDecryptPayload(data) {
  if (!data || typeof data !== "object") return data;

  const enabled =
    localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_ENABLED) === "true";
  if (!enabled) return data;

  const keys = getDecryptKeys();
  if (keys.length === 0) return data;

  return decryptAllStringFields(data, keys);
}

function decryptAllStringFields(obj, keys) {
  if (Array.isArray(obj)) {
    return obj.map((item) => decryptAllStringFields(item, keys));
  }

  if (obj !== null && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && v.length > 0) {
        let decrypted = null;
        for (const keyConfig of keys) {
          decrypted = DECRYPTOR.decrypt(v, keyConfig.algorithm, keyConfig.key);
          if (decrypted) break;
        }
        if (decrypted) {
          try {
            result[`__dec__${k}`] = JSON.parse(decrypted);
          } catch {
            result[`__dec__${k}`] = decrypted;
          }
        } else {
          result[k] = v;
        }
      } else {
        result[k] = decryptAllStringFields(v, keys);
      }
    }
    return result;
  }

  return obj;
}

// ── Search toggle buttons ─────────────────────────────────────────────────────

function setupSearchToggleButtons() {
  function applyToggle(btn, getter, setter) {
    btn.classList.toggle("is-active", getter());
    btn.addEventListener("click", () => {
      setter(!getter());
      btn.classList.toggle("is-active", getter());
      triggerSearchRerender();
    });
  }

  applyToggle(
    searchCaseSensitiveBtn,
    () => searchCaseSensitive,
    (v) => { searchCaseSensitive = v; },
  );

  applyToggle(
    searchWholeWordBtn,
    () => searchWholeWord,
    (v) => { searchWholeWord = v; },
  );

  applyToggle(
    searchRegexBtn,
    () => searchUseRegex,
    (v) => { searchUseRegex = v; },
  );

  // Alt+C / Alt+W / Alt+R shortcuts (matches VSCode)
  document.addEventListener("keydown", (event) => {
    if (!event.altKey) return;
    const key = event.key.toLowerCase();

    if (key === "c") {
      event.preventDefault();
      searchCaseSensitiveBtn.click();
    } else if (key === "w") {
      event.preventDefault();
      searchWholeWordBtn.click();
    } else if (key === "r") {
      event.preventDefault();
      searchRegexBtn.click();
    }
  }, true);
}

function triggerSearchRerender() {
  currentMatchIndex = 0;
  if (activeTab === "response" && activeProcessedData) {
    renderJson(activeProcessedData);
  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function setupTabs() {
  tabResponseBtn.addEventListener("click", () => switchTab("response"));
  tabRequestBtn.addEventListener("click", () => switchTab("request"));
}

function switchTab(tab) {
  activeTab = tab;
  tabResponseBtn.classList.toggle("is-active", tab === "response");
  tabRequestBtn.classList.toggle("is-active", tab === "request");
  jsonViewerEl.classList.toggle("hidden", tab !== "response");
  requestViewerEl.classList.toggle("hidden", tab !== "request");

  // Search only applies to response tab
  const searchDisabled = tab !== "response";
  searchInputEl.disabled = searchDisabled;
  searchInputEl.style.opacity = searchDisabled ? "0.4" : "";
}

// ── Request viewer ────────────────────────────────────────────────────────────

function renderRequestViewer(request) {
  requestViewerEl.replaceChildren();

  if (!request) return;

  // ── General info ──────────────────────────────────────────────────────────
  const section = (title) => {
    const el = document.createElement("div");
    el.className = "req-section";
    const h = document.createElement("div");
    h.className = "req-section-title";
    h.textContent = title;
    el.appendChild(h);
    return el;
  };

  // Payload (first)
  const body = request.requestBody || "";
  if (body) {
    const payloadSection = section("Payload");
    let parsed = null;
    try { parsed = JSON.parse(body); } catch {}

    if (parsed) {
      const processed = tryDecryptPayload(parsed);
      const treeWrap = document.createElement("div");
      treeWrap.className = "req-payload-tree";

      // Temporarily redirect searchMatches to avoid polluting response search
      const savedMatches = searchMatches;
      searchMatches = [];
      const root = document.createElement("div");
      root.className = "json-tree-root";
      root.appendChild(createJsonNode(processed));
      treeWrap.appendChild(root);
      searchMatches = savedMatches;

      payloadSection.appendChild(treeWrap);
    } else {
      // Raw body (form-encoded or plain text)
      const raw = document.createElement("div");
      raw.className = "req-raw-body";
      try {
        const params = new URLSearchParams(body);
        const hasKeys = [...params.keys()].length > 0;
        if (hasKeys) {
          params.forEach((v, k) => payloadSection.appendChild(makeKVRow(k, v)));
        } else {
          raw.textContent = body;
          payloadSection.appendChild(raw);
        }
      } catch {
        raw.textContent = body;
        payloadSection.appendChild(raw);
      }
    }
    requestViewerEl.appendChild(payloadSection);
  }

  // General
  const general = section("General");
  const generalRows = [
    ["Request URL", request.url],
    ["Request Method", request.method],
    ["Status Code", `${request.status} ${request.statusText}`],
  ];
  generalRows.forEach(([k, v]) => general.appendChild(makeKVRow(k, v)));
  requestViewerEl.appendChild(general);

  // Request Headers
  if (request.requestHeaders && request.requestHeaders.length > 0) {
    const headersSection = section("Request Headers");
    request.requestHeaders.forEach(({ name, value }) => {
      headersSection.appendChild(makeKVRow(name, value));
    });
    requestViewerEl.appendChild(headersSection);
  }
}

function makeKVRow(key, value) {
  const row = document.createElement("div");
  row.className = "req-kv-row";

  const k = document.createElement("span");
  k.className = "req-kv-key";
  k.textContent = key;

  const v = document.createElement("span");
  v.className = "req-kv-value";
  v.textContent = value;
  v.title = "Double-click to copy";
  v.addEventListener("dblclick", (e) => {
    e.preventDefault();
    copyText(value, "Copied");
  });

  row.append(k, v);
  return row;
}
