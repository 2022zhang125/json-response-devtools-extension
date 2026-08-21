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
const requestFilterCountEl = document.getElementById("requestFilterCount");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const toastEl = document.getElementById("toast");
const contextBannerEl = document.getElementById("contextBanner");

const searchCaseSensitiveBtn = document.getElementById("searchCaseSensitiveBtn");
const searchWholeWordBtn = document.getElementById("searchWholeWordBtn");
const searchRegexBtn = document.getElementById("searchRegexBtn");

let activeTab = "response"; // "response" | "request"

const requests = [];

// Must match MAX_REQUESTS in devtools.js — both sides trim independently so the
// list and the capture buffer stay in step without extra messages.
const MAX_REQUESTS = 300;

let activeRequest = null;
let activeJsonText = "";
let activeJsonData = null;
let activeProcessedData = null;

// 点击接口名跳转 Swagger 的开关，默认开启
let isJumpEnabled =
  localStorage.getItem(CONFIG.STORAGE_KEYS.JUMP_ENABLED) !== "false";

let searchText = "";
let searchMatches = [];
let currentMatchIndex = -1;
let searchCaseSensitive = false;
let searchWholeWord = false;
let searchUseRegex = false;

// Set once the extension context this panel runs in is torn down (reload /
// update) — see the context-loss section below. Declared here rather than next
// to that section because the setup calls below run at module top level and
// would hit the temporal dead zone of a `let` declared later in the file.
let isContextLost = false;
let updateCheckIntervalId = 0;

// Declared up here, not next to the sidebar functions further down: the
// applySidebarState() call below runs at module top level and would hit the
// temporal dead zone of a const declared later in the file.
const SIDEBAR_MAX_WIDTH = 720;

// The panel tracks the cursor all the way down to zero while dragging, with no
// snapping en route. The decision happens on mouse-up: released below this mark
// it animates shut into the same collapsed state the ‹ button produces, released
// anywhere above it it simply stays where it was let go. Doubles as the floor for
// a stored width, so a deliberately narrow panel survives a reload.
const SIDEBAR_COLLAPSE_AT = 120;

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
setupCopyDelegation();
setupUpdateCheck();

// Re-sync prefix config to devtools.js whenever settings are saved in options page
window.addEventListener("storage", (event) => {
  if (
    event.key === CONFIG.STORAGE_KEYS.SWAGGER_CONFIGS ||
    event.key === CONFIG.STORAGE_KEYS.API_PREFIX_STRIP
  ) {
    syncConfigToDevtools();
  }

  if (event.key === CONFIG.STORAGE_KEYS.JUMP_ENABLED) {
    isJumpEnabled = event.newValue !== "false";
    applyJumpStateToList();
  }
});

// ── Extension context loss ────────────────────────────────────────────────────
// Reloading or updating the extension tears down the context this panel runs in
// while the DevTools window stays open. Every chrome.* call then throws
// "Extension context invalidated" and the port to devtools.js is already dead,
// so nothing the panel does can bring it back — only reopening DevTools can.
// Left unguarded, each call site threw that straight into the DevTools console
// with no hint of what it meant. Now the first failure flips the panel into a
// clearly labelled dead state and every later call is a no-op.

function isContextAlive() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function markContextLost() {
  if (isContextLost) {
    return;
  }

  isContextLost = true;
  contextBannerEl.classList.remove("hidden");
  window.clearInterval(updateCheckIntervalId);
}

// Both of these mean the same thing here: the plumbing this panel was built on
// is gone for good. Anything else is a real bug and must keep propagating.
function isDeadContextError(error) {
  const text = String(error?.message || error);

  return (
    text.includes("Extension context invalidated") ||
    text.includes("disconnected port")
  );
}

// Sole entry point for chrome.* calls from the panel. Returns undefined once the
// context is gone, so callers fall through to their own "nothing happened" path.
function withContext(action) {
  if (isContextLost) {
    return undefined;
  }

  if (!isContextAlive()) {
    markContextLost();
    return undefined;
  }

  try {
    return action();
  } catch (error) {
    if (isDeadContextError(error)) {
      markContextLost();
      return undefined;
    }

    throw error;
  }
}

const port =
  withContext(() =>
    chrome.runtime.connect({
      name: "json-response-panel",
    }),
  ) || null;

// The port only ever drops when the extension context or the DevTools page goes
// away — either way this panel is finished, and the banner says so.
port?.onDisconnect.addListener(() => {
  withContext(() => void chrome.runtime.lastError);
  markContextLost();
});

// Send current prefix config to devtools.js so it can filter captured requests
function syncConfigToDevtools() {
  postToDevtools({
    type: "sync-config",
    prefixes: getAllPrefixList(),
  });
}

function postToDevtools(message) {
  withContext(() => port?.postMessage(message));
}

port?.onMessage.addListener((message) => {
  if (message.type === "init-requests") {
    requests.length = 0;
    requests.push(...message.requests.slice(-MAX_REQUESTS));
    syncConfigToDevtools();
    renderRequestList();

    if (requests.length > 0) {
      warmCryptoOnFirstUse();
    }

    return;
  }

  if (message.type === "request-added") {
    addRequest(message.request);
    return;
  }

  // Reply to an on-demand body fetch. Only the active row consumes the result;
  // response text is not retained on the request record.
  if (message.type === "request-content") {
    const record = requests.find((item) => item.id === message.id);

    if (!record || activeRequest !== record) {
      return;
    }

    if (message.ok) {
      renderResponseBody(record, message.content);
    } else if (message.reason === "oversized") {
      showViewerMessage("响应体过大，已跳过捕获（> 5 MB）。");
    } else {
      showViewerMessage(getContentErrorText(message.reason));
    }

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

// ── Request list filtering ────────────────────────────────────────────────────
// The toolbar search box does double duty: it highlights matches inside the
// active viewer AND narrows the request list by API path, so a keyword like
// /xxx/aaa/ccc finds the one request among hundreds. Matching honours the same
// Aa / 全词 / .* toggles as the content search.

const filterEmptyEl = document.createElement("div");
filterEmptyEl.className = "request-list-empty hidden";
filterEmptyEl.textContent = "无匹配请求 · 关键词只过滤请求路径";
requestListEl.appendChild(filterEmptyEl);

// Last pattern that actually compiled. In .* mode a half-typed regex — an
// unclosed "(", a trailing "\" — makes buildSearchRegex() return null; treating
// that as "not filtering" dumps every row back into the list mid-keystroke, so
// the previous good pattern holds until the new one parses.
let lastValidFilterRegex = null;

function applyRequestFilter() {
  const query = searchText.trim();
  const isFiltering = Boolean(query);

  if (!isFiltering) {
    lastValidFilterRegex = null;
  } else {
    lastValidFilterRegex = buildSearchRegex(query) || lastValidFilterRegex;
  }

  const regex = isFiltering ? lastValidFilterRegex : null;

  let visible = 0;
  let total = 0;

  for (const el of requestListEl.children) {
    if (!el.__request) {
      continue;
    }

    total++;

    const matched = !isFiltering || matchesRequestFilter(el, regex);

    // The selected row is never hidden — searching for a value that only exists
    // in the response body must not yank away the row being read. It is dimmed
    // and labelled instead, so it can't be read as a filter hit, and it doesn't
    // count towards the visible tally.
    const pinned = !matched && el.__request === activeRequest;

    el.classList.toggle("request-item--filtered", !matched && !pinned);
    el.classList.toggle("request-item--pinned", pinned);

    if (matched) {
      visible++;
    }
  }

  updateRequestFilterCount(isFiltering, visible, total);
  filterEmptyEl.classList.toggle("hidden", !isFiltering || visible > 0);

  // Hidden rows change every offsetTop below them.
  moveIndicatorTo(findRequestItemEl(activeRequest));
}

// Matched against the stripped API path AND the raw pathname: the row shows the
// full URL, so a keyword living in the prefix that normalizeApiPath() removed is
// visible on screen and has to still find its row.
function matchesRequestFilter(el, regex) {
  if (!regex) {
    return true;
  }

  return testFilterRegex(regex, el.__apiPath) || testFilterRegex(regex, el.__rawPath);
}

function testFilterRegex(regex, text) {
  if (!text) {
    return false;
  }

  // buildSearchRegex() returns a /g/ regex, whose test() is stateful.
  regex.lastIndex = 0;

  return regex.test(text);
}

function updateRequestFilterCount(isFiltering, visible, total) {
  requestFilterCountEl.classList.toggle("hidden", !isFiltering);
  requestFilterCountEl.textContent = isFiltering ? `${visible} / ${total}` : "";
}

function findRequestItemEl(request) {
  if (!request) {
    return null;
  }

  for (const el of requestListEl.children) {
    if (el.__request === request) {
      return el;
    }
  }

  return null;
}

// Full rebuild — only used when the panel first receives the backlog.
function renderRequestList() {
  for (const el of [...requestListEl.children]) {
    if (el.__request) {
      el.remove();
    }
  }

  const fragment = document.createDocumentFragment();

  requests.forEach((request, index) => {
    const item = buildRequestItem(request);
    item.style.animationDelay = `${Math.min(index * 18, 120)}ms`;
    item.classList.add("request-item--enter");
    item.classList.toggle("is-active", request === activeRequest);
    fragment.appendChild(item);
  });

  requestListEl.appendChild(fragment);

  // Re-applies any active filter and syncs the indicator to the active item
  // (handles init & restore).
  applyRequestFilter();
}

// Incremental append — a new request only ever adds one row, so there is no
// reason to walk and rebuild the whole list.
function addRequest(request) {
  warmCryptoOnFirstUse();
  requests.push(request);

  const item = buildRequestItem(request);
  item.classList.add("request-item--enter");
  requestListEl.appendChild(item);

  // Keep the DOM and the backing array trimmed together.
  while (requests.length > MAX_REQUESTS) {
    const dropped = requests.shift();
    findRequestItemEl(dropped)?.remove();

    if (activeRequest === dropped) {
      activeRequest = null;
      moveIndicatorTo(null);
    }
  }

  // Only worth a pass when a filter is actually narrowing the list.
  if (searchText.trim()) {
    applyRequestFilter();
  }
}

function buildRequestItem(request) {
  const item = document.createElement("div");
  item.className = "request-item";
  item.__request = request;

  const main = document.createElement("div");
  main.className = "request-item-main";

  const requestApiPath = getRequestName(request.url);

  // Cached so filtering doesn't re-parse the URL of every row on each keystroke.
  item.__apiPath = requestApiPath;
  item.__rawPath = getRequestPathname(request.url);

  const name = document.createElement("div");
  name.className = "request-name";

  // 只有文字本身可点，避免点到列内空白区域误触跳转
  const nameText = document.createElement("span");
  nameText.className = "request-name-text";
  nameText.textContent = requestApiPath;
  applyJumpStateToNameText(nameText, requestApiPath);

  nameText.addEventListener("click", (event) => {
    if (!isJumpEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    openSwaggerAndSearch(requestApiPath, request.url);
  });

  name.appendChild(nameText);

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
    // Re-runs the filter: the previously selected row was pinned visible only
    // because it was selected, so it may drop out now.
    applyRequestFilter();
    loadRequestContent(request);
  });

  return item;
}

// Records contain metadata only. Each selection asks DevTools for the body and
// neither side retains the returned response text for later selections.
function loadRequestContent(request) {
  renderRequestViewer(request);

  if (request.oversized) {
    showViewerMessage("响应体过大，已跳过捕获（> 5 MB）。");
    return;
  }

  showViewerMessage("正在加载响应体…");

  postToDevtools({
    type: "request-content",
    id: request.id,
  });
}

// Every failure path has to say something. Rendering nothing is indistinguishable
// from a broken viewer — the panel goes blank right after the loading placeholder
// and there is no way to tell it apart from a crash.
function getContentErrorText(reason) {
  if (reason === "gone") {
    return "响应体已被 DevTools 回收，重新发起该请求后可再次查看。";
  }

  if (reason === "timeout") {
    return "响应体读取超时，重新发起该请求后可再次查看。";
  }

  return `响应体获取失败（${reason}）。`;
}

function showViewerMessage(text) {
  activeJsonText = "";
  activeJsonData = null;
  activeProcessedData = null;

  jsonViewerEl.replaceChildren();

  if (text) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = text;
    jsonViewerEl.appendChild(empty);
  }

  refreshSearchMatches(false);
}

function renderResponseBody(request, text) {
  activeJsonText = text;

  let parsed;

  try {
    parsed = JSON.parse(activeJsonText);
  } catch (error) {
    activeJsonData = null;
    activeProcessedData = null;
    jsonViewerEl.replaceChildren();

    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = `JSON parse failed: ${error.message}`;

    jsonViewerEl.appendChild(empty);

    refreshSearchMatches(false);
    return;
  }

  activeJsonData = parsed;

  // Decryption pulls in ~200 KB of crypto libs. If they aren't in memory yet,
  // paint the raw JSON first so the panel stays responsive, then re-render once
  // they land.
  if (isDecryptWanted() && !isCryptoReady()) {
    activeProcessedData = parsed;
    renderJson(parsed);
    refreshSearchMatches(false);

    ensureCryptoLoaded().then((ready) => {
      if (!ready || activeRequest !== request) {
        return;
      }

      activeProcessedData = tryDecryptFields(parsed);
      renderJson(activeProcessedData);
      renderRequestViewer(request);
      refreshSearchMatches(false);
    });

    return;
  }

  activeProcessedData = tryDecryptFields(parsed);
  renderJson(activeProcessedData);
  refreshSearchMatches(false);
}

function renderJson(data) {
  jsonViewerEl.replaceChildren();

  const root = document.createElement("div");
  root.className = "json-tree-root";
  root.appendChild(createJsonNode(data));

  jsonViewerEl.appendChild(root);
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

  // Stringified lazily on copy — doing it per node up front would be O(size²).
  markCopyable(summaryElement, { json: value, message: "JSON copied" });

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

  markCopyable(keyElement, { text: displayKey, message: "Key copied" });

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

      appendHighlightedText(link, displayValue);

      return markCopyable(link, { text: value });
    }

    return markCopyable(createHighlightedSpan("json-string", displayValue), {
      text: value,
    });
  }

  if (typeof value === "number") {
    return markCopyable(createHighlightedSpan("json-number", String(value)), {
      text: String(value),
    });
  }

  if (typeof value === "boolean") {
    return markCopyable(createHighlightedSpan("json-boolean", String(value)), {
      text: String(value),
    });
  }

  if (value === null) {
    return markCopyable(createHighlightedSpan("json-null", "null"), {
      text: "null",
    });
  }

  return createHighlightedSpan("", String(value));
}

// ── Copy-on-double-click via delegation ───────────────────────────────────────
// A large response can produce tens of thousands of nodes. Attaching a listener
// to each one is what used to make rendering big payloads stall, so copy targets
// are tagged with a property instead and one listener per viewer resolves them.

function markCopyable(element, { text, json, message = "Value copied" } = {}) {
  if (json !== undefined) {
    element.__copyJson = json;
  } else {
    element.__copyText = text;
  }

  element.__copyMessage = message;

  if (!element.title) {
    element.title = "Double-click to copy";
  }

  return element;
}

function setupCopyDelegation() {
  for (const root of [jsonViewerEl, requestViewerEl]) {
    root.addEventListener("dblclick", (event) => {
      for (let el = event.target; el && el !== root; el = el.parentElement) {
        const hasJson = el.__copyJson !== undefined;

        if (!hasJson && el.__copyText === undefined) {
          continue;
        }

        event.preventDefault();
        event.stopPropagation();

        copyText(
          hasJson ? JSON.stringify(el.__copyJson, null, 2) : el.__copyText,
          el.__copyMessage || "Copied",
        );
        return;
      }
    });
  }
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

function getActiveViewerEl() {
  return activeTab === "response" ? jsonViewerEl : requestViewerEl;
}

// 匹配项按 DOM 顺序从当前激活的面板重新收集，Response / Request 各自独立
function refreshSearchMatches(shouldScroll) {
  searchMatches = [
    ...getActiveViewerEl().querySelectorAll("mark.json-search-mark"),
  ];

  normalizeCurrentMatchIndex();
  updateCurrentMatch(shouldScroll);
  updateSearchCount();
  updateSearchButtons();
}

function rerenderActiveView() {
  if (activeTab === "response") {
    if (activeProcessedData) {
      renderJson(activeProcessedData);
    }
  } else if (activeRequest) {
    renderRequestViewer(activeRequest);
  }

  refreshSearchMatches(false);
}

// Each keystroke re-highlights by rebuilding the whole tree, so coalesce bursts
// of typing into a single render.
const SEARCH_DEBOUNCE_MS = 140;
let searchDebounceId = 0;

function applySearchText(value) {
  searchText = value;
  currentMatchIndex = 0;
  applyRequestFilter();
  rerenderActiveView();
}

function scheduleSearchRender() {
  window.clearTimeout(searchDebounceId);

  const value = searchInputEl.value;
  searchDebounceId = window.setTimeout(
    () => applySearchText(value),
    SEARCH_DEBOUNCE_MS,
  );
}

function flushPendingSearchRender() {
  if (!searchDebounceId) {
    return;
  }

  window.clearTimeout(searchDebounceId);
  searchDebounceId = 0;

  if (searchText !== searchInputEl.value) {
    applySearchText(searchInputEl.value);
  }
}

searchInputEl.addEventListener("input", scheduleSearchRender);

searchInputEl.addEventListener("keydown", (event) => {
  event.stopPropagation();

  if (event.key === "Enter") {
    event.preventDefault();
    // Don't jump against a stale match list if the debounce hasn't fired yet.
    flushPendingSearchRender();
    goToSearchMatch(event.shiftKey ? -1 : 1);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();

    if (searchText || searchInputEl.value) {
      window.clearTimeout(searchDebounceId);
      searchDebounceId = 0;

      searchText = "";
      searchInputEl.value = "";
      currentMatchIndex = -1;

      applyRequestFilter();
      rerenderActiveView();
    } else {
      searchInputEl.blur();
    }
  }
});

prevBtn.addEventListener("click", () => {
  flushPendingSearchRender();
  goToSearchMatch(-1);
});

nextBtn.addEventListener("click", () => {
  flushPendingSearchRender();
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

    // Ctrl+A copies whatever the active tab is showing: the response body on
    // the Response tab, the request payload on the Request tab.
    if (key === "a" && !isSearchFocused) {
      event.preventDefault();
      event.stopPropagation();

      if (activeTab === "request") {
        copyText(getPrettyRequestText(), "Request copied", { flash: true });
      } else {
        copyText(getPrettyJsonText(), "Response copied", { flash: true });
      }
    }
  },
  true,
);

// Mirrors what the Request tab renders: the decrypted payload when decryption
// is on, otherwise the raw body. GET requests carry no body, so their query
// string is used instead — that's the request payload as far as the user is
// concerned.
function getPrettyRequestText() {
  if (!activeRequest) {
    return "";
  }

  const body = activeRequest.requestBody || "";

  if (body) {
    try {
      return JSON.stringify(tryDecryptPayload(JSON.parse(body)), null, 2);
    } catch {
      return body;
    }
  }

  return getQueryText(activeRequest.url);
}

function getQueryText(url) {
  let params;

  try {
    params = new URL(url).searchParams;
  } catch {
    return "";
  }

  const entries = [...params.entries()];

  if (entries.length === 0) {
    return "";
  }

  return JSON.stringify(Object.fromEntries(entries), null, 2);
}

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
  return normalizeApiPath(getRequestPathname(url));
}

// The path as it actually is, before any configured prefix is stripped off.
function getRequestPathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
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
  sidebarWidth = Math.min(
    Math.max(sidebarWidth, SIDEBAR_COLLAPSE_AT),
    SIDEBAR_MAX_WIDTH,
  );
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
  let dragWidth = 0;
  let isDragging = false;

  resizeHandleEl.addEventListener("mousedown", (event) => {
    if (isSidebarCollapsed || event.button !== 0) {
      return;
    }

    startX = event.clientX;
    startWidth = sidebarWidth;
    // A mousedown with no movement must still land on a sane value at mouseup.
    dragWidth = sidebarWidth;
    isDragging = true;

    document.body.classList.add("is-resizing");
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // The panel is an iframe inside the DevTools window. Drag left past its edge
    // and the cursor is outside that document: no more mousemove, and the mouseup
    // lands in the DevTools chrome where this listener never sees it — the drag
    // stays armed and the next pointer move over the panel resizes it with no
    // button held. Leaving the document therefore ends the drag at the crossing
    // point, and window blur catches a release that happened out there.
    document.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("blur", handleWindowBlur);

    event.preventDefault();
  });

  // Floored at 0 and nothing else: no snapping, no minimum. The panel sits
  // exactly under the cursor for the whole drag. A clientX outside the document
  // is negative, which is what makes "dragged out the left edge" land on 0 —
  // i.e. the exit point is the release point, as intended. sidebarWidth is left
  // alone until the drag ends so a drag ending in a collapse doesn't overwrite
  // the width the ‹ / › pair restores to.
  function trackCursor(clientX) {
    dragWidth = Math.min(
      Math.max(startWidth + (clientX - startX), 0),
      SIDEBAR_MAX_WIDTH,
    );

    layoutEl.style.setProperty("--request-panel-width", `${dragWidth}px`);
  }

  function handleMouseMove(event) {
    // Belt and braces: the button was released somewhere this document couldn't
    // observe, and the cursor has now come back. Don't keep resizing.
    if (event.buttons === 0) {
      endDrag();
      return;
    }

    trackCursor(event.clientX);
  }

  function handleMouseUp(event) {
    trackCursor(event.clientX);
    endDrag();
  }

  function handleMouseLeave(event) {
    trackCursor(event.clientX);
    endDrag();
  }

  function handleWindowBlur() {
    // No coordinates on this one — settle on wherever the last move left it.
    endDrag();
  }

  function endDrag() {
    if (!isDragging) {
      return;
    }

    isDragging = false;

    document.body.classList.remove("is-resizing");
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.removeEventListener("mouseleave", handleMouseLeave);
    window.removeEventListener("blur", handleWindowBlur);

    if (dragWidth < SIDEBAR_COLLAPSE_AT) {
      snapSidebarShut(dragWidth);
      return;
    }

    // Released above the mark: it stays exactly where it was let go.
    sidebarWidth = dragWidth;
    localStorage.setItem(
      CONFIG.STORAGE_KEYS.SIDEBAR_WIDTH,
      String(sidebarWidth),
    );

    applySidebarState();
  }
}

// Runs the rest of the way to the left edge as an animation rather than a jump —
// released at 90px the panel would otherwise blink out with nothing to show the
// 90px were what triggered it. sidebarWidth deliberately keeps its last real
// value so the › button restores a usable panel.
function snapSidebarShut(fromWidth) {
  // Declared before finish(): the early-return path below calls it before the
  // timer is ever armed.
  let fallbackId = 0;

  const finish = () => {
    layoutEl.removeEventListener("transitionend", onTransitionEnd);
    clearTimeout(fallbackId);
    layoutEl.classList.remove("is-sidebar-snapping");

    isSidebarCollapsed = true;
    localStorage.setItem(CONFIG.STORAGE_KEYS.SIDEBAR_COLLAPSED, "true");
    applySidebarState();
  };

  const onTransitionEnd = (event) => {
    if (event.propertyName === "--request-panel-width") {
      finish();
    }
  };

  // Nothing to animate — the drag already ended flush against the edge.
  if (fromWidth <= 0) {
    finish();
    return;
  }

  layoutEl.addEventListener("transitionend", onTransitionEnd);

  // transitionend on a registered custom property is the normal path; this is
  // only here so a missed event can't strand the panel mid-animation.
  fallbackId = setTimeout(finish, 500);

  layoutEl.classList.add("is-sidebar-snapping");
  layoutEl.style.setProperty("--request-panel-width", "0px");
}

function setupClearRequests() {
  clearRequestsBtn.addEventListener("click", () => {
    clearRequests();
  });
}

// 开关在设置页，这里同步已渲染列表项的可点样式与提示
function applyJumpStateToList() {
  for (const el of requestListEl.querySelectorAll(".request-name-text")) {
    applyJumpStateToNameText(el, el.textContent);
  }
}

function applyJumpStateToNameText(el, apiPath) {
  el.classList.toggle("is-jump-disabled", !isJumpEnabled);
  el.title = isJumpEnabled
    ? `Open Swagger and search ${apiPath}`
    : "点击跳转已关闭，可在左上角开关开启";
}

function clearRequests() {
  // The list is cleared by devtools.js echoing "requests-cleared" back, so with
  // the port gone the button would simply do nothing at all.
  if (isContextLost) {
    showToast("扩展已失效，请重新打开 DevTools");
    return;
  }

  postToDevtools({
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

  // Remove only request items, keep indicatorEl / filterEmptyEl
  for (const el of [...requestListEl.children]) {
    if (el.__request) el.remove();
  }
  moveIndicatorTo(null);
  applyRequestFilter();

  jsonViewerEl.replaceChildren();
  requestViewerEl.replaceChildren();

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
  const swaggerUrl = buildSwaggerUrl(cfg.base, cfg.suffix);

  if (isContextLost) {
    showToast("扩展已失效，请重新打开 DevTools");
    return;
  }

  navigator.clipboard
    .writeText(displayPath)
    .catch(() => {})
    .finally(() => {
      const opened = withContext(() => {
        chrome.tabs.create({ url: swaggerUrl }, (tab) => {
          if (tab?.id !== undefined) {
            injectSwaggerHelperOnLoad(tab.id, displayPath);
          }
        });

        return true;
      });

      showToast(
        opened
          ? `Opening Swagger: ${displayPath}`
          : "扩展已失效，请重新打开 DevTools",
      );
    });
}

// The Swagger auto-search helper used to be a content script matching every
// http(s) page, which cost a script fetch + parse on every navigation in the
// browser. It is now injected only into the tab we just opened, once it loads.
function injectSwaggerHelperOnLoad(tabId, apiPath) {
  const INJECT_TIMEOUT_MS = 30000;

  const cleanup = () => {
    withContext(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    });

    window.clearTimeout(timeoutId);
  };

  const timeoutId = window.setTimeout(cleanup, INJECT_TIMEOUT_MS);

  function onRemoved(removedTabId) {
    if (removedTabId === tabId) {
      cleanup();
    }
  }

  function onUpdated(updatedTabId, changeInfo) {
    if (updatedTabId !== tabId || changeInfo.status !== "complete") {
      return;
    }

    cleanup();

    // The API path used to ride along in the URL as ?jsonResponseSearch=…,
    // which left the Swagger address bar stuck on
    // doc.html#/home?jsonResponseSearch=%2Fxxx even after the menu was opened.
    // It is now handed over as an isolated-world global, so the address bar only
    // ever shows knife4j's own route (…#/业务接口/商家后台-商家套餐/catalog).
    withContext(() =>
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: (path) => {
            globalThis.__JSON_RESPONSE_SEARCH__ = path;
          },
          args: [apiPath || ""],
        },
        () => {
          // Swallow "cannot access contents of the page" etc. — nothing to do.
          withContext(() => void chrome.runtime.lastError);

          withContext(() =>
            chrome.scripting.executeScript(
              {
                target: { tabId },
                files: ["swagger-content.js"],
              },
              () => {
                withContext(() => void chrome.runtime.lastError);
              },
            ),
          );
        },
      ),
    );
  }

  withContext(() => {
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

function buildSwaggerUrl(base, suffix) {
  const normalizedBase = base.replace(/\/+$/, "");
  return `${normalizedBase}${suffix}`;
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

// ── Lazy crypto loading ───────────────────────────────────────────────────────
// lib/crypto-js.js + lib/sm4.js are ~200 KB of script that used to be parsed on
// every DevTools panel open, even for users who never enable decryption. They
// are now fetched on first actual use.

let cryptoLoadPromise = null;

function isCryptoReady() {
  return typeof CryptoJS !== "undefined" && typeof sm4 !== "undefined";
}

// True when the user has decryption turned on AND has at least one key set up.
function isDecryptWanted() {
  return (
    localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_ENABLED) === "true" &&
    getDecryptKeys().length > 0
  );
}

function ensureCryptoLoaded() {
  if (isCryptoReady()) {
    return Promise.resolve(true);
  }

  if (!cryptoLoadPromise) {
    cryptoLoadPromise = Promise.all([
      loadScriptOnce("lib/crypto-js.js"),
      loadScriptOnce("lib/sm4.js"),
    ])
      .then(() => isCryptoReady())
      .catch(() => false);
  }

  return cryptoLoadPromise;
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

// If decryption is already configured, warm the libs while the panel is idle so
// the first selected request doesn't flash undecrypted content.
//
// Deliberately NOT run at panel load: DevTools restores the last-used panel on
// open, so warming at init scheduled a 200 KB parse against the 2 s idle timeout
// — landing squarely in DevTools startup. Waiting for the first captured request
// means it only happens once the panel is actually in use.
let cryptoWarmed = false;

function warmCryptoOnFirstUse() {
  if (cryptoWarmed) {
    return;
  }

  cryptoWarmed = true;
  warmCryptoIfNeeded();
}

function warmCryptoIfNeeded() {
  if (!isDecryptWanted() || isCryptoReady()) {
    return;
  }

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => ensureCryptoLoaded(), { timeout: 2000 });
  } else {
    window.setTimeout(() => ensureCryptoLoaded(), 0);
  }
}

// ── Update check ──────────────────────────────────────────────────────────────
// Silent, throttled by UPDATE_CHECK_INTERVAL_MS inside UPDATER. Deferred to idle
// so a network round trip never lands in DevTools startup, and repeated on an
// interval because a DevTools panel can stay open for days.

function setupUpdateCheck() {
  // A panel left open across an extension reload would otherwise keep polling
  // GitHub every interval from a context that can no longer act on the answer.
  const check = () => {
    if (isContextLost) {
      return;
    }

    UPDATER.checkForUpdates({ silent: true });
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(check, { timeout: 10000 });
  } else {
    window.setTimeout(check, 5000);
  }

  updateCheckIntervalId = window.setInterval(
    check,
    CONFIG.UPDATE_CHECK_INTERVAL_MS,
  );
}

// ── Decrypt helpers ───────────────────────────────────────────────────────────

function tryDecryptFields(data) {
  if (!data || typeof data !== "object") return data;

  if (!isDecryptWanted() || !isCryptoReady()) return data;

  const keys = getDecryptKeys();

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

  if (!isDecryptWanted() || !isCryptoReady()) return data;

  return decryptAllStringFields(data, getDecryptKeys());
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
  applyRequestFilter();
  rerenderActiveView();
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

  // 搜索在两个 Tab 都可用，切换后用当前关键词重绘新面板并重新定位匹配项
  currentMatchIndex = 0;
  rerenderActiveView();
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

      const root = document.createElement("div");
      root.className = "json-tree-root";
      root.appendChild(createJsonNode(processed));
      treeWrap.appendChild(root);

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
          setHighlightedText(raw, body);
          payloadSection.appendChild(raw);
        }
      } catch {
        setHighlightedText(raw, body);
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

  const k = createHighlightedSpan("req-kv-key", String(key ?? ""));

  const v = markCopyable(
    createHighlightedSpan("req-kv-value", String(value ?? "")),
    { text: String(value ?? ""), message: "Copied" },
  );

  row.append(k, v);
  return row;
}
