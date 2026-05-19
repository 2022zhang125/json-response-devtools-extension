const requests = [];
const panelPorts = new Set();

chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (!isFetchRequest(request)) {
    return;
  }

  if (!isJsonRequest(request)) {
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
  });

  port.onDisconnect.addListener(() => {
    panelPorts.delete(port);
  });
});

function notifyPanels(message) {
  for (const port of panelPorts) {
    port.postMessage(message);
  }
}

function isFetchRequest(request) {
  // 只要 fetch：
  return request._resourceType === "fetch" || request._resourceType === "xhr";
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
  "",
  "panel.html",
  function () {},
);
