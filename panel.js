const layoutEl = document.getElementById("layout");
const requestListEl = document.getElementById("requestList");
const resizeHandleEl = document.getElementById("resizeHandle");
const collapseSidebarBtn = document.getElementById("collapseSidebarBtn");
const expandSidebarBtn = document.getElementById("expandSidebarBtn");
const clearRequestsBtn = document.getElementById("clearRequestsBtn");
const jsonViewerEl = document.getElementById("jsonViewer");
const searchInputEl = document.getElementById("searchInput");
const searchCountEl = document.getElementById("searchCount");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const toastEl = document.getElementById("toast");

const requests = [];

let activeRequest = null;
let activeJsonText = "";
let activeJsonData = null;

let searchText = "";
let searchMatches = [];
let currentMatchIndex = -1;

let sidebarWidth =
  Number(localStorage.getItem(CONFIG.STORAGE_KEYS.SIDEBAR_WIDTH)) || 320;
let isSidebarCollapsed =
  localStorage.getItem(CONFIG.STORAGE_KEYS.SIDEBAR_COLLAPSED) === "true";

applySidebarState();
setupSidebarResize();
setupSidebarCollapse();
updateSearchButtons();
setupClearRequests();

const port = chrome.runtime.connect({
  name: "json-response-panel",
});

port.onMessage.addListener((message) => {
  if (message.type === "init-requests") {
    requests.length = 0;
    requests.push(...message.requests);

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

function renderRequestList() {
  requestListEl.replaceChildren();

  requests.forEach((request) => {
    const item = document.createElement("div");
    item.className = `request-item ${
      request === activeRequest ? "is-active" : ""
    }`;

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
      openSwaggerAndSearch(requestApiPath);
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
      activeRequest = request;
      renderRequestList();
      loadRequestContent(request);
    });

    requestListEl.appendChild(item);
  });
}

function loadRequestContent(request) {
  activeJsonText = request.content || "";

  try {
    activeJsonData = JSON.parse(activeJsonText);
    renderJson(activeJsonData);
  } catch (error) {
    activeJsonData = null;
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
  closeLine.className = "json-tree-line";
  closeLine.appendChild(createSpan("json-tree-toggle-placeholder", ""));
  closeLine.appendChild(createSpan("json-punctuation", closeToken));
  children.appendChild(closeLine);

  toggle.addEventListener("click", () => {
    const collapsed = children.style.display !== "none";
    children.style.display = collapsed ? "none" : "";
    toggle.textContent = collapsed ? "▸" : "▾";

    setHighlightedText(
      summaryElement,
      collapsed ? `${openToken}...${closeToken} ${summary}` : summary,
    );
  });

  node.append(line, children);
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

  const keyElement = createHighlightedSpan("json-key", `"${key}"`);
  keyElement.title = "Double-click to copy key";

  keyElement.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    copyText(key, "Key copied");
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
  const normalizedSearchText = searchText.trim();

  if (!normalizedSearchText) {
    element.textContent = text;
    return;
  }

  const lowerText = text.toLowerCase();
  const lowerSearchText = normalizedSearchText.toLowerCase();

  let startIndex = 0;
  let matchIndex = lowerText.indexOf(lowerSearchText, startIndex);

  if (matchIndex === -1) {
    element.textContent = text;
    return;
  }

  while (matchIndex !== -1) {
    if (matchIndex > startIndex) {
      element.appendChild(
        document.createTextNode(text.slice(startIndex, matchIndex)),
      );
    }

    const mark = document.createElement("mark");
    mark.className = "json-search-mark";
    mark.textContent = text.slice(
      matchIndex,
      matchIndex + normalizedSearchText.length,
    );
    element.appendChild(mark);

    searchMatches.push(mark);

    startIndex = matchIndex + normalizedSearchText.length;
    matchIndex = lowerText.indexOf(lowerSearchText, startIndex);
  }

  if (startIndex < text.length) {
    element.appendChild(document.createTextNode(text.slice(startIndex)));
  }
}

function setHighlightedText(element, text) {
  element.replaceChildren();
  appendHighlightedText(element, text);
}

function updateSearchCount() {
  if (!searchText.trim()) {
    searchCountEl.textContent = "";
    return;
  }

  if (searchMatches.length === 0) {
    searchCountEl.textContent = "0 / 0";
    return;
  }

  searchCountEl.textContent = `${currentMatchIndex + 1} / ${
    searchMatches.length
  }`;
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

  if (activeJsonData) {
    renderJson(activeJsonData);
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

      if (activeJsonData) {
        renderJson(activeJsonData);
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

  let prefixList = CONFIG.API_PATH_PREFIX_STRIP;
  const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.API_PREFIX_STRIP);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        prefixList = parsed;
      }
    } catch {
      // use CONFIG default
    }
  }

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

  searchText = "";
  searchMatches = [];
  currentMatchIndex = -1;
  searchInputEl.value = "";

  requestListEl.replaceChildren();

  jsonViewerEl.replaceChildren();

  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = "Select a JSON request from the left panel.";

  jsonViewerEl.appendChild(empty);

  updateSearchCount();
  updateSearchButtons();

  showToast("Requests cleared");
}

function openSwaggerAndSearch(apiPath) {
  const swaggerBaseUrl =
    localStorage.getItem(CONFIG.STORAGE_KEYS.SWAGGER_BASE) || "";

  if (!swaggerBaseUrl) {
    showToast("请先在设置页面配置 Swagger 地址");
    return;
  }

  const swaggerUrl = buildSwaggerUrl(swaggerBaseUrl, apiPath);

  navigator.clipboard
    .writeText(apiPath)
    .catch(() => {})
    .finally(() => {
      chrome.tabs.create({ url: swaggerUrl });
      showToast(`Opening Swagger: ${apiPath}`);
    });
}

function buildSwaggerUrl(baseUrl, apiPath) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const encodedApiPath = encodeURIComponent(apiPath);
  const suffix =
    localStorage.getItem(CONFIG.STORAGE_KEYS.SWAGGER_SUFFIX) ||
    CONFIG.SWAGGER_URL_SUFFIX;

  return `${normalizedBaseUrl}${suffix}?jsonResponseSearch=${encodedApiPath}`;
}
