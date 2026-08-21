const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadDevtools() {
  let onRequestFinished;
  let onConnect;

  const chrome = {
    devtools: {
      network: {
        onRequestFinished: {
          addListener(listener) {
            onRequestFinished = listener;
          },
        },
      },
      panels: {
        create() {},
      },
    },
    runtime: {
      onConnect: {
        addListener(listener) {
          onConnect = listener;
        },
      },
    },
  };

  const source = fs.readFileSync(
    path.join(__dirname, "..", "devtools.js"),
    "utf8",
  );

  vm.runInNewContext(source, {
    chrome,
    clearTimeout() {},
    setTimeout() {
      return 1;
    },
    URL,
  });

  return { onConnect, onRequestFinished };
}

function connectPanel(onConnect) {
  let onMessage;
  const messages = [];
  const port = {
    name: "json-response-panel",
    postMessage(message) {
      messages.push(message);
    },
    onMessage: {
      addListener(listener) {
        onMessage = listener;
      },
    },
    onDisconnect: {
      addListener() {},
    },
  };

  onConnect(port);

  return {
    messages,
    send(message) {
      onMessage(message);
    },
  };
}

function createJsonRequest(index, getContent) {
  return {
    _resourceType: "fetch",
    startedDateTime: String(index),
    request: {
      url: `https://example.test/api/${index}`,
      method: "GET",
      headers: [],
    },
    response: {
      status: 200,
      statusText: "OK",
      headers: [{ name: "content-type", value: "application/json" }],
      content: { size: 2 },
    },
    getContent,
  };
}

test("does not read a response body until the panel requests it", () => {
  const { onConnect, onRequestFinished } = loadDevtools();
  const panel = connectPanel(onConnect);
  let reads = 0;

  onRequestFinished(
    createJsonRequest(0, (callback) => {
      reads += 1;
      callback('{"ok":true}', "");
    }),
  );

  assert.equal(reads, 0);

  const added = panel.messages.find((message) => message.type === "request-added");
  panel.send({ type: "request-content", id: added.request.id });

  assert.equal(reads, 1);
});

test("reads the response body again on every panel request", () => {
  const { onConnect, onRequestFinished } = loadDevtools();
  const panel = connectPanel(onConnect);
  let reads = 0;

  onRequestFinished(
    createJsonRequest(0, (callback) => {
      reads += 1;
      callback(`{"read":${reads}}`, "");
    }),
  );

  const added = panel.messages.find((message) => message.type === "request-added");
  const request = { type: "request-content", id: added.request.id };

  panel.send(request);
  panel.send(request);

  assert.equal(reads, 2);
  assert.deepEqual(
    panel.messages
      .filter((message) => message.type === "request-content")
      .map((message) => message.content),
    ['{"read":1}', '{"read":2}'],
  );
});
