const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadDevtools() {
  let onRequestFinished;

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
        addListener() {},
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

  return { onRequestFinished };
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

test("starts reading every response body as soon as its request finishes", () => {
  const { onRequestFinished } = loadDevtools();
  const started = [];

  for (let index = 0; index < 5; index += 1) {
    onRequestFinished(
      createJsonRequest(index, () => {
        started.push(index);
        // Deliberately leave the read pending. A stalled earlier read must not
        // keep a later response body waiting until DevTools has discarded it.
      }),
    );
  }

  assert.deepEqual(started, [0, 1, 2, 3, 4]);
});
