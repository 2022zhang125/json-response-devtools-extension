const requests = [];
const panelPorts = new Set();

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

  request.getContent((content, encoding) => {
    const record = {
      id: createRequestId(request),
      url: request.request.url,
      method: request.request.method,
      status: request.response.status,
      statusText: request.response.statusText,
      content: content || "",
      encoding: encoding || "",
      resourceType: request._resourceType || "",
      createdAt: Date.now(),
      requestHeaders: request.request.headers || [],
      requestBody: request.request.postData?.text || "",
    };

    record.relativeTimeText = getRelativeTimeText(record.createdAt);

    requests.push(record);

    notifyPanels({
      type: "request-added",
      request: record,
    });
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

      notifyPanels({
        type: "requests-cleared",
      });
    }

    if (message.type === "sync-config") {
      urlPrefixes = Array.isArray(message.prefixes) ? message.prefixes : [];
    }
  });

  port.onDisconnect.addListener(() => {
    panelPorts.delete(port);
  });
});

function notifyPanels(message) {
  for (const port of [...panelPorts]) {
    try {
      port.postMessage(message);
    } catch {
      panelPorts.delete(port);
    }
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
  "json-response-devtools-icon-512.png",
  "panel.html",
  function () {},
);
