const requestListEl = document.getElementById("requestList");
const jsonViewerEl = document.getElementById("jsonViewer");
const searchInputEl = document.getElementById("searchInput");
const searchCountEl = document.getElementById("searchCount");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const toastEl = document.getElementById("toast");

const requests = [];
let activeRequest = null;
let activeJsonText = "";
let searchText = "";
let searchMatches = [];
let currentMatchIndex = -1;

chrome.devtools.network.onRequestFinished.addListener(request => {
  const contentTypeHeader = request.response.headers.find(
    item => item.name.toLowerCase() === "content-type",
  );

  const contentType = contentTypeHeader?.value || "";
  const url = request.request.url;

  if (!contentType.toLowerCase().includes("json") && !url.toLowerCase().includes("json")) {
    return;
  }

  requests.push(request);
  renderRequestList();
});

function renderRequestList() {
  requestListEl.replaceChildren();

  requests.forEach((request, index) => {
    const item = document.createElement("div");
    item.className = `request-item ${request === activeRequest ? "is-active" : ""}`;

    const name = document.createElement("div");
    name.className = "request-name";
    name.textContent = getRequestName(request.request.url);

    const url = document.createElement("div");
    url.className = "request-url";
    url.textContent = request.request.url;

    item.append(name, url);

    item.addEventListener("click", () => {
      activeRequest = request;
      renderRequestList();
      loadRequestContent(request);
    });

    requestListEl.appendChild(item);
  });
}

function loadRequestContent(request) {
  request.getContent((content, encoding) => {
    activeJsonText = content || "";

    try {
      const data = JSON.parse(activeJsonText);
      renderJson(data);
    } catch (error) {
      jsonViewerEl.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = `JSON parse failed: ${error.message}`;
      jsonViewerEl.appendChild(empty);
    }
  });
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

  summaryElement.addEventListener("dblclick", event => {
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
    const childNode = createJsonNode(childValue, Array.isArray(value) ? undefined : childKey);
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

  keyElement.addEventListener("dblclick", event => {
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

      link.addEventListener("dblclick", event => {
        event.preventDefault();
        event.stopPropagation();
        copyText(value, "Value copied");
      });

      return link;
    }

    const stringElement = createHighlightedSpan("json-string", displayValue);
    stringElement.title = "Double-click to copy value";

    stringElement.addEventListener("dblclick", event => {
      event.preventDefault();
      event.stopPropagation();
      copyText(value, "Value copied");
    });

    return stringElement;
  }

  if (typeof value === "number") {
    const numberElement = createHighlightedSpan("json-number", String(value));
    numberElement.title = "Double-click to copy value";
    numberElement.addEventListener("dblclick", () => copyText(String(value), "Value copied"));
    return numberElement;
  }

  if (typeof value === "boolean") {
    const booleanElement = createHighlightedSpan("json-boolean", String(value));
    booleanElement.title = "Double-click to copy value";
    booleanElement.addEventListener("dblclick", () => copyText(String(value), "Value copied"));
    return booleanElement;
  }

  if (value === null) {
    const nullElement = createHighlightedSpan("json-null", "null");
    nullElement.title = "Double-click to copy value";
    nullElement.addEventListener("dblclick", () => copyText("null", "Value copied"));
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
      element.appendChild(document.createTextNode(text.slice(startIndex, matchIndex)));
    }

    const mark = document.createElement("mark");
    mark.className = "json-search-mark";
    mark.textContent = text.slice(matchIndex, matchIndex + normalizedSearchText.length);
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
      (currentMatchIndex + direction + searchMatches.length) % searchMatches.length;
  }

  updateCurrentMatch(true);
  updateSearchCount();
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

searchInputEl.addEventListener("input", () => {
  searchText = searchInputEl.value;
  currentMatchIndex = 0;

  if (activeJsonText) {
    try {
      renderJson(JSON.parse(activeJsonText));
    } catch {}
  }
});

searchInputEl.addEventListener("keydown", event => {
  event.stopPropagation();

  if (event.key === "Enter") {
    event.preventDefault();
    goToSearchMatch(event.shiftKey ? -1 : 1);
  }

  if (event.key === "Escape") {
    event.preventDefault();
    searchText = "";
    searchInputEl.value = "";

    if (activeJsonText) {
      try {
        renderJson(JSON.parse(activeJsonText));
      } catch {}
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
  event => {
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
      copyText(getPrettyJsonText(), "Response copied");
    }
  },
  true,
);

function getPrettyJsonText() {
  try {
    return JSON.stringify(JSON.parse(activeJsonText), null, 2);
  } catch {
    return activeJsonText;
  }
}

function copyText(text, message) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(message);
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
    return parsedUrl.pathname.split("/").filter(Boolean).pop() || parsedUrl.hostname;
  } catch {
    return url;
  }
}