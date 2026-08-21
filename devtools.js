const requests = [];
const panelPorts = new Set();

// HAR entry objects, keyed by record id. These carry getContent() so they can't
// be cloned across the port — they stay here, and the panel asks for a body by
// id when the user actually selects a row. Kept trimmed in lockstep with
// `requests`.
const harEntries = new Map();

// Metadata records are held in memory for the lifetime of the DevTools session.
// Without a cap a long-lived session grows unbounded and drags the whole
// DevTools window down. panel.js applies the same cap to its own copy.
const MAX_REQUESTS = 300;

// Response bodies larger than this are never fetched — a single multi-megabyte
// payload would freeze the JSON tree renderer anyway.
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

// getContent() is not guaranteed to call back — DevTools drops the callback for
// some entries, a navigation clearing the network log mid-flight being the usual
// one. A deadline ensures a selected row does not sit on "正在加载响应体…"
// forever.
const CONTENT_FETCH_TIMEOUT_MS = 10000;

// URL path prefixes to capture — empty means capture all JSON requests.
// Synced from panel via "sync-config" message.
let urlPrefixes = [];

chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (!isFetchRequest(request)) {
    return;
  }

  // If prefixes are configured, capture any request matching them regardless of Content-Type.
  // If no prefixes are configured, fall back to Content-Type / URL heuristic.
  const prefixMatched = urlPrefixes.length > 0 && isMatchingPrefix(request.request.url);

  if (!prefixMatched && !isJsonRequest(request)) {
    return;
  }

  if (urlPrefixes.length > 0 && !prefixMatched) {
    return;
  }

  // The HAR entry already knows the body size, so an oversized response can be
  // flagged up front and never fetched at all.
  const contentSize = Number(request.response.content?.size ?? 0);

  const record = {
    id: createRequestId(request),
    url: request.request.url,
    method: request.request.method,
    status: request.response.status,
    statusText: request.response.statusText,
    oversized: contentSize > MAX_CONTENT_BYTES,
    resourceType: request._resourceType || "",
    createdAt: Date.now(),
    requestHeaders: request.request.headers || [],
    requestBody: request.request.postData?.text || "",
  };

  record.relativeTimeText = getRelativeTimeText(record.createdAt);

  requests.push(record);
  harEntries.set(record.id, request);

  // Drop the oldest records once we're over the cap so memory stays flat.
  if (requests.length > MAX_REQUESTS) {
    const dropped = requests.splice(0, requests.length - MAX_REQUESTS);

    for (const item of dropped) {
      harEntries.delete(item.id);
    }
  }

  notifyPanels({
    type: "request-added",
    request: record,
  });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "json-response-panel") {
    return;
  }

  panelPorts.add(port);

  port.postMessage({
    type: "init-requests",
    requests,
  });

  port.onMessage.addListener((message) => {
    if (message.type === "clear-requests") {
      requests.length = 0;
      harEntries.clear();

      notifyPanels({
        type: "requests-cleared",
      });
    }

    if (message.type === "sync-config") {
      urlPrefixes = Array.isArray(message.prefixes) ? message.prefixes : [];
    }

    if (message.type === "request-content") {
      sendContent(port, message.id);
    }
  });

  port.onDisconnect.addListener(() => {
    panelPorts.delete(port);
  });
});

function notifyPanels(message) {
  for (const port of [...panelPorts]) {
    postToPort(port, message);
  }
}

function postToPort(port, message) {
  try {
    port.postMessage(message);
  } catch {
    panelPorts.delete(port);
  }
}

// Read a body only when the panel asks for it. Response text is sent straight to
// the panel and is never retained by this DevTools page.
function sendContent(port, id) {
  const record = requests.find((item) => item.id === id);

  if (record?.oversized) {
    postToPort(port, {
      type: "request-content",
      id,
      ok: false,
      reason: "oversized",
    });
    return;
  }

  const entry = harEntries.get(id);

  if (!entry) {
    postToPort(port, {
      type: "request-content",
      id,
      ok: false,
      reason: "gone",
    });
    return;
  }

  let settled = false;
  let timeoutId = 0;

  const settle = (result) => {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timeoutId);
    postToPort(port, { type: "request-content", id, ...result });
  };

  timeoutId = setTimeout(
    () => settle({ ok: false, reason: "timeout" }),
    CONTENT_FETCH_TIMEOUT_MS,
  );

  try {
    entry.getContent((content, encoding) => {
      if (content == null) {
        settle({ ok: false, reason: "gone" });
        return;
      }

      if (content.length > MAX_CONTENT_BYTES) {
        settle({ ok: false, reason: "oversized" });
        return;
      }

      settle({
        ok: true,
        content,
        encoding: encoding || "",
      });
    });
  } catch {
    settle({ ok: false, reason: "gone" });
  }
}

function isFetchRequest(request) {
  return request._resourceType === "fetch" || request._resourceType === "xhr";
}

function isMatchingPrefix(url) {
  // No prefixes configured → capture everything
  if (urlPrefixes.length === 0) {
    return true;
  }

  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }

  return urlPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isJsonRequest(request) {
  const contentTypeHeader = request.response.headers.find(
    (item) => item.name.toLowerCase() === "content-type",
  );

  const contentType = contentTypeHeader?.value || "";
  const url = request.request.url;

  return (
    contentType.toLowerCase().includes("json") ||
    url.toLowerCase().includes("json")
  );
}

function createRequestId(request) {
  return [
    request.startedDateTime || Date.now(),
    request.request.method,
    request.request.url,
    Math.random().toString(16).slice(2),
  ].join("-");
}

function getRelativeTimeText(createdAt) {
  if (!createdAt) {
    return "";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));

  if (diffSeconds < 5) {
    return "刚刚";
  }

  if (diffSeconds < 60) {
    return `${diffSeconds}秒前`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }

  const diffDays = Math.floor(diffHours / 24);

  return `${diffDays}天前`;
}

chrome.devtools.panels.create(
  "JSON Response",
  "icons/icon-32.png",
  "panel.html",
  function () {},
);
