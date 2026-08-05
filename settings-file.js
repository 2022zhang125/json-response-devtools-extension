/**
 * "设置文件" —— 把配置绑定到磁盘上的一个 JSON 文件。
 *
 * 扩展的 localStorage 属于扩展 ID，一旦从新目录加载（或先移除再加载），Chrome
 * 会当成另一个扩展，配置随之清空。绑定一个本地文件后：
 *   - 配置变化时自动写回该文件；
 *   - 新装/更新后配置为空时，从该文件自动恢复。
 *
 * 文件句柄（FileSystemFileHandle）存在 IndexedDB 里，浏览器重启后仍然有效，
 * 只是可能需要用户点一次授权（浏览器安全模型要求手势，无法完全零点击）。
 */
const SETTINGS_FILE = (() => {
  const DB_NAME = "json-response-settings";
  const DB_VERSION = 1;
  const STORE_NAME = "handles";
  const HANDLE_KEY = "settings-file";

  const FILE_TYPES = [
    {
      description: "扩展设置文件",
      accept: { "application/json": [".json"] },
    },
  ];

  function isSupported() {
    return (
      typeof window !== "undefined" &&
      typeof window.showOpenFilePicker === "function" &&
      typeof window.showSaveFilePicker === "function" &&
      typeof indexedDB !== "undefined"
    );
  }

  // ── IndexedDB ───────────────────────────────────────────────────────────────

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, run) {
    const db = await openDb();

    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = run(tx.objectStore(STORE_NAME));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function getHandle() {
    if (!isSupported()) {
      return null;
    }

    try {
      return (await withStore("readonly", (store) => store.get(HANDLE_KEY))) || null;
    } catch {
      return null;
    }
  }

  async function saveHandle(handle) {
    try {
      await withStore("readwrite", (store) => store.put(handle, HANDLE_KEY));
      return true;
    } catch {
      return false;
    }
  }

  async function clearHandle() {
    try {
      await withStore("readwrite", (store) => store.delete(HANDLE_KEY));
      return true;
    } catch {
      return false;
    }
  }

  // ── 权限 / 读写 ─────────────────────────────────────────────────────────────

  // request=true 必须在用户手势里调用，否则浏览器直接拒绝。
  async function ensurePermission(handle, { request = false } = {}) {
    if (!handle?.queryPermission) {
      return "denied";
    }

    const options = { mode: "readwrite" };

    try {
      let state = await handle.queryPermission(options);

      if (state !== "granted" && request) {
        state = await handle.requestPermission(options);
      }

      return state;
    } catch {
      return "denied";
    }
  }

  async function readJson(handle) {
    const file = await handle.getFile();
    const text = await file.text();

    return JSON.parse(text);
  }

  async function writeJson(handle, data) {
    const writable = await handle.createWritable();

    try {
      await writable.write(JSON.stringify(data, null, 2));
    } finally {
      await writable.close();
    }
  }

  // ── 选择文件 ────────────────────────────────────────────────────────────────

  async function pickExisting() {
    const [handle] = await window.showOpenFilePicker({
      types: FILE_TYPES,
      multiple: false,
      excludeAcceptAllOption: false,
    });

    return handle || null;
  }

  async function pickNew(suggestedName = "json-response-settings.json") {
    return await window.showSaveFilePicker({
      suggestedName,
      types: FILE_TYPES,
    });
  }

  // 用户在选择器里点了取消时抛的是 AbortError，属于正常流程，不该当成错误提示。
  function isAbortError(error) {
    return error?.name === "AbortError";
  }

  return {
    isSupported,
    getHandle,
    saveHandle,
    clearHandle,
    ensurePermission,
    readJson,
    writeJson,
    pickExisting,
    pickNew,
    isAbortError,
  };
})();
