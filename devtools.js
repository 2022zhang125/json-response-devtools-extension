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

// Ceiling on the total size of cached bodies. Bodies are pulled as soon as a
// request finishes so DevTools can't evict them out from under us — but that
// makes us the ones holding them, so the oldest get dropped past this mark.
const MAX_CACHED_BYTES = 64 * 1024 * 1024;

// getContent() is not guaranteed to call back — DevTools drops the callback for
// some entries, a navigation clearing the network log mid-flight being the usual
// one. A deadline ensures a selected row does not sit on "正在加载响应体…"
// forever. It does not gate later reads: every body must be requested while the
// onRequestFinished entry still owns it.
const CONTENT_FETCH_TIMEOUT_MS = 10000;

// Cached bodies, keyed by record id: { state, content, encoding, reason,
// waiters }. `state` is "pending" until the fetch settles, then "ok" or "fail".
// A panel that selects a row mid-fetch parks a callback in `waiters`.
const bodyCache = new Map();
let cachedBytes = 0;

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

  // Grab the body now rather than when the row is clicked. DevTools drops its
  // own copy on navigation and under memory pressure, and the gap between a
  // request finishing and the user selecting it is exactly where that happened.
  if (!record.oversized) {
    cacheBody(record.id, request);
  }

  // Drop the oldest records once we're over the cap so memory stays flat.
  if (requests.length > MAX_REQUESTS) {
    const dropped = requests.splice(0, requests.length - MAX_REQUESTS);

    for (const item of dropped) {
      harEntries.delete(item.id);
      dropCachedBody(item.id);
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
      bodyCache.clear();
      cachedBytes = 0;

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

// Pull a body into bodyCache immediately. Deferring getContent() behind a
// concurrency queue is unsafe: one batch of callbacks that never arrives can
// leave every later response waiting until DevTools has already discarded it.
function cacheBody(id, entry) {
  const slot = {
    state: "pending",
    content: "",
    encoding: "",
    reason: "",
    waiters: [],
  };

  bodyCache.set(id, slot);

  let settled = false;
  let timeoutId = 0;

  const settle = (result) => {
    // The deadline below and a late getContent() callback both land here;
    // settling twice would double-count this body against the byte budget.
    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timeoutId);

    Object.assign(slot, result);
    slot.state = result.reason ? "fail" : "ok";

    // The record may have been trimmed or cleared while the read was in flight,
    // in which case it isn't ours to charge against the budget any more.
    if (slot.state === "ok" && bodyCache.get(id) === slot) {
      cachedBytes += slot.content.length;
      evictOverBudget();
    }

    // Waiters are still served even if the slot was evicted above — whoever is
    // watching this row wants the body we just fetched.
    for (const waiter of slot.waiters.splice(0)) {
      waiter(slot);
    }
  };

  timeoutId = setTimeout(
    () => settle({ reason: "timeout" }),
    CONTENT_FETCH_TIMEOUT_MS,
  );

  try {
    entry.getContent((content, encoding) => {
      if (content == null) {
        settle({ reason: "gone" });
        return;
      }

      // Fallback for when the HAR entry reported no usable size up front.
      if (content.length > MAX_CONTENT_BYTES) {
        settle({ reason: "oversized" });
        return;
      }

      settle({ content, encoding: encoding || "" });
    });
  } catch {
    settle({ reason: "gone" });
  }
}

// Oldest first — Map iterates in insertion order, which matches request order.
function evictOverBudget() {
  for (const [id, slot] of bodyCache) {
    if (cachedBytes <= MAX_CACHED_BYTES) {
      return;
    }

    if (slot.state === "ok") {
      dropCachedBody(id);
    }
  }
}

function dropCachedBody(id) {
  const slot = bodyCache.get(id);

  if (!slot) {
    return;
  }

  if (slot.state === "ok") {
    cachedBytes -= slot.content.length;
  }

  bodyCache.delete(id);
}

// Serve a body to the panel. Normally this is a cache hit — the fetch was
// started when the request finished. A miss (dropped for the byte budget) or a
// failed prefetch both fall back to asking DevTools again, from the HAR entry we
// still hold.
function sendContent(port, id) {
  const fail = (reason) =>
    postToPort(port, { type: "request-content", id, ok: false, reason });

  const deliver = (slot) => {
    if (slot.state !== "ok") {
      fail(slot.reason || "gone");
      return;
    }

    postToPort(port, {
      type: "request-content",
      id,
      ok: true,
      content: slot.content,
      encoding: slot.encoding,
    });
  };

  if (requests.find((item) => item.id === id)?.oversized) {
    fail("oversized");
    return;
  }

  const cached = bodyCache.get(id);

  if (cached?.state === "pending") {
    cached.waiters.push(deliver);
    return;
  }

  if (cached?.state === "ok") {
    deliver(cached);
    return;
  }

  const entry = harEntries.get(id);

  if (!entry) {
    fail(cached?.reason || "gone");
    return;
  }

  // Nothing usable cached: either evicted for the byte budget, or the prefetch
  // failed. Retry rather than serving the stale failure — the prefetch fires the
  // instant the request finishes, which is exactly when DevTools is least likely
  // to hand the body over. Asking now, with the row actually selected, is the
  // timing the old lazy path had, and it usually succeeds.
  if (cached) {
    dropCachedBody(id);
  }

  cacheBody(id, entry);

  // Re-read the slot: a throw inside getContent settles it before we get here.
  const started = bodyCache.get(id);

  if (started.state === "pending") {
    started.waiters.push(deliver);
  } else {
    deliver(started);
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
