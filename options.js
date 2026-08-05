const toastEl = document.getElementById("toast");

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  window.setTimeout(() => toastEl.classList.add("hidden"), 1500);
}

function loadJSON(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Migration: old single-value format → new array format ────────────────────

function migrate() {
  if (!localStorage.getItem(CONFIG.STORAGE_KEYS.SWAGGER_CONFIGS)) {
    const base = localStorage.getItem(CONFIG.STORAGE_KEYS.SWAGGER_BASE);
    if (base) {
      const suffix =
        localStorage.getItem(CONFIG.STORAGE_KEYS.SWAGGER_SUFFIX) ||
        CONFIG.SWAGGER_URL_SUFFIX;
      const prefixes = loadJSON(
        CONFIG.STORAGE_KEYS.API_PREFIX_STRIP,
        CONFIG.API_PATH_PREFIX_STRIP,
      );
      saveJSON(CONFIG.STORAGE_KEYS.SWAGGER_CONFIGS, [
        { id: uid(), name: "默认", base, suffix, prefixes },
      ]);
    }
  }

  if (!localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_CONFIGS)) {
    const key = localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_KEY);
    if (key) {
      const algorithm =
        localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_ALGORITHM) || "SM4";
      saveJSON(CONFIG.STORAGE_KEYS.DECRYPT_CONFIGS, [
        { id: uid(), name: "默认", algorithm, key },
      ]);
    }
  }
}

migrate();

// ═══════════════════════════════════════════════════════════════════════════════
// Swagger configs
// ═══════════════════════════════════════════════════════════════════════════════

const swaggerConfigListEl = document.getElementById("swaggerConfigList");
const swaggerConfigFormEl = document.getElementById("swaggerConfigForm");
const addSwaggerConfigBtn = document.getElementById("addSwaggerConfigBtn");
const cancelSwaggerConfigBtn = document.getElementById("cancelSwaggerConfigBtn");
const saveSwaggerConfigBtn = document.getElementById("saveSwaggerConfigBtn");
const cfgNameEl = document.getElementById("cfgName");
const cfgBaseEl = document.getElementById("cfgBase");
const cfgSuffixEl = document.getElementById("cfgSuffix");
const cfgPrefixesEl = document.getElementById("cfgPrefixes");

let editingSwaggerId = null;

function getSwaggerConfigs() {
  return loadJSON(CONFIG.STORAGE_KEYS.SWAGGER_CONFIGS, []);
}

function renderSwaggerList() {
  const configs = getSwaggerConfigs();
  swaggerConfigListEl.replaceChildren();

  if (configs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "config-empty";
    empty.textContent = "暂无配置，点击下方按钮添加";
    swaggerConfigListEl.appendChild(empty);
    return;
  }

  configs.forEach((cfg) => {
    const card = document.createElement("div");
    card.className = "config-card";

    const info = document.createElement("div");
    info.className = "config-card-info";

    const name = document.createElement("div");
    name.className = "config-card-name";
    name.textContent = cfg.name || "（无名称）";

    const url = document.createElement("div");
    url.className = "config-card-url";
    url.textContent = `${cfg.base}${cfg.suffix}`;

    const tags = document.createElement("div");
    tags.className = "config-card-tags";
    (cfg.prefixes || []).forEach((p) => {
      const tag = document.createElement("span");
      tag.className = "config-tag";
      tag.textContent = p;
      tags.appendChild(tag);
    });

    info.append(name, url, tags);

    const actions = document.createElement("div");
    actions.className = "config-card-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "icon-button";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => openSwaggerForm(cfg));

    const delBtn = document.createElement("button");
    delBtn.className = "icon-button icon-button--danger";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", () => deleteSwaggerConfig(cfg.id));

    actions.append(editBtn, delBtn);
    card.append(info, actions);
    swaggerConfigListEl.appendChild(card);
  });
}

function openSwaggerForm(cfg = null) {
  editingSwaggerId = cfg ? cfg.id : null;
  cfgNameEl.value = cfg?.name ?? "";
  cfgBaseEl.value = cfg?.base ?? "";
  cfgSuffixEl.value = cfg?.suffix ?? CONFIG.SWAGGER_URL_SUFFIX;
  cfgPrefixesEl.value = (cfg?.prefixes ?? CONFIG.API_PATH_PREFIX_STRIP).join("\n");
  swaggerConfigFormEl.classList.remove("hidden");
  cfgNameEl.focus();
}

function closeSwaggerForm() {
  swaggerConfigFormEl.classList.add("hidden");
  editingSwaggerId = null;
}

function saveSwaggerConfig() {
  const name = cfgNameEl.value.trim();
  const base = cfgBaseEl.value.trim();
  const suffix = cfgSuffixEl.value.trim();
  const prefixes = cfgPrefixesEl.value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!base) { showToast("请填写服务器地址"); cfgBaseEl.focus(); return; }
  if (!suffix) { showToast("请填写 Swagger 页面路径"); cfgSuffixEl.focus(); return; }

  const configs = getSwaggerConfigs();

  if (editingSwaggerId) {
    const idx = configs.findIndex((c) => c.id === editingSwaggerId);
    if (idx >= 0) configs[idx] = { id: editingSwaggerId, name, base, suffix, prefixes };
  } else {
    configs.push({ id: uid(), name, base, suffix, prefixes });
  }

  saveJSON(CONFIG.STORAGE_KEYS.SWAGGER_CONFIGS, configs);
  closeSwaggerForm();
  renderSwaggerList();
  markSettingsChanged();
  showToast("已保存");
}

function deleteSwaggerConfig(id) {
  const configs = getSwaggerConfigs().filter((c) => c.id !== id);
  saveJSON(CONFIG.STORAGE_KEYS.SWAGGER_CONFIGS, configs);
  renderSwaggerList();
  markSettingsChanged();
  showToast("已删除");
}

addSwaggerConfigBtn.addEventListener("click", () => openSwaggerForm());
cancelSwaggerConfigBtn.addEventListener("click", closeSwaggerForm);
saveSwaggerConfigBtn.addEventListener("click", saveSwaggerConfig);

renderSwaggerList();

// ═══════════════════════════════════════════════════════════════════════════════
// Decrypt settings
// ═══════════════════════════════════════════════════════════════════════════════

const decryptEnabledEl = document.getElementById("decryptEnabled");
const decryptOptionsEl = document.getElementById("decryptOptions");
const decryptFieldEl = document.getElementById("decryptField");
const saveDecryptFieldBtn = document.getElementById("saveDecryptField");
const decryptKeyListEl = document.getElementById("decryptKeyList");
const decryptKeyFormEl = document.getElementById("decryptKeyForm");
const addDecryptKeyBtn = document.getElementById("addDecryptKeyBtn");
const cancelDecryptKeyBtn = document.getElementById("cancelDecryptKeyBtn");
const saveDecryptKeyBtn = document.getElementById("saveDecryptKeyBtn");
const dkNameEl = document.getElementById("dkName");
const dkAlgorithmEl = document.getElementById("dkAlgorithm");
const dkValueEl = document.getElementById("dkValue");
const toggleDkVisibilityBtn = document.getElementById("toggleDkVisibility");

let editingKeyId = null;

// ── Enable toggle ─────────────────────────────────────────────────────────────

const decryptEnabled =
  localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_ENABLED) === "true";
decryptEnabledEl.checked = decryptEnabled;
decryptOptionsEl.classList.toggle("decrypt-options--hidden", !decryptEnabled);

decryptEnabledEl.addEventListener("change", () => {
  const enabled = decryptEnabledEl.checked;
  localStorage.setItem(CONFIG.STORAGE_KEYS.DECRYPT_ENABLED, String(enabled));
  decryptOptionsEl.classList.toggle("decrypt-options--hidden", !enabled);
  markSettingsChanged();
});

// ── Target field ──────────────────────────────────────────────────────────────

decryptFieldEl.value =
  localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_FIELD) || "data";

saveDecryptFieldBtn.addEventListener("click", () => {
  const value = decryptFieldEl.value.trim() || "data";
  localStorage.setItem(CONFIG.STORAGE_KEYS.DECRYPT_FIELD, value);
  markSettingsChanged();
  showToast("已保存");
});

decryptFieldEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); saveDecryptFieldBtn.click(); }
});

// ── Key list ──────────────────────────────────────────────────────────────────

function getDecryptKeys() {
  return loadJSON(CONFIG.STORAGE_KEYS.DECRYPT_CONFIGS, []);
}

function renderDecryptKeyList() {
  const keys = getDecryptKeys();
  decryptKeyListEl.replaceChildren();

  if (keys.length === 0) {
    const empty = document.createElement("p");
    empty.className = "config-empty";
    empty.textContent = "暂无密钥，点击右上方按钮添加";
    decryptKeyListEl.appendChild(empty);
    return;
  }

  keys.forEach((k) => {
    const card = document.createElement("div");
    card.className = "config-card";

    const info = document.createElement("div");
    info.className = "config-card-info";

    const name = document.createElement("div");
    name.className = "config-card-name";
    name.textContent = k.name || "（无名称）";

    const meta = document.createElement("div");
    meta.className = "config-card-url";
    meta.textContent = `${k.algorithm} · ${"•".repeat(Math.min(k.key.length, 16))}`;

    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "config-card-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "icon-button";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => openDecryptKeyForm(k));

    const delBtn = document.createElement("button");
    delBtn.className = "icon-button icon-button--danger";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", () => deleteDecryptKey(k.id));

    actions.append(editBtn, delBtn);
    card.append(info, actions);
    decryptKeyListEl.appendChild(card);
  });
}

function openDecryptKeyForm(k = null) {
  editingKeyId = k ? k.id : null;
  dkNameEl.value = k?.name ?? "";
  dkAlgorithmEl.value = k?.algorithm ?? "SM4";
  dkValueEl.value = k?.key ?? "";
  dkValueEl.type = "password";
  toggleEyeIcon(false);
  decryptKeyFormEl.classList.remove("hidden");
  dkNameEl.focus();
}

function closeDecryptKeyForm() {
  decryptKeyFormEl.classList.add("hidden");
  editingKeyId = null;
}

function saveDecryptKey() {
  const name = dkNameEl.value.trim();
  const algorithm = dkAlgorithmEl.value;
  const key = dkValueEl.value.trim();

  if (!key) { showToast("请输入密钥"); dkValueEl.focus(); return; }

  const keys = getDecryptKeys();

  if (editingKeyId) {
    const idx = keys.findIndex((k) => k.id === editingKeyId);
    if (idx >= 0) keys[idx] = { id: editingKeyId, name, algorithm, key };
  } else {
    keys.push({ id: uid(), name, algorithm, key });
  }

  saveJSON(CONFIG.STORAGE_KEYS.DECRYPT_CONFIGS, keys);
  closeDecryptKeyForm();
  renderDecryptKeyList();
  markSettingsChanged();
  showToast("已保存");
}

function deleteDecryptKey(id) {
  const keys = getDecryptKeys().filter((k) => k.id !== id);
  saveJSON(CONFIG.STORAGE_KEYS.DECRYPT_CONFIGS, keys);
  renderDecryptKeyList();
  markSettingsChanged();
  showToast("已删除");
}

// Eye toggle for password field
function toggleEyeIcon(visible) {
  toggleDkVisibilityBtn.querySelector(".eye-icon--on").classList.toggle("hidden", visible);
  toggleDkVisibilityBtn.querySelector(".eye-icon--off").classList.toggle("hidden", !visible);
}

toggleDkVisibilityBtn.addEventListener("click", () => {
  const isPassword = dkValueEl.type === "password";
  dkValueEl.type = isPassword ? "text" : "password";
  toggleEyeIcon(!isPassword);
  dkValueEl.focus();
});

addDecryptKeyBtn.addEventListener("click", () => openDecryptKeyForm());
cancelDecryptKeyBtn.addEventListener("click", closeDecryptKeyForm);
saveDecryptKeyBtn.addEventListener("click", saveDecryptKey);

renderDecryptKeyList();

// ═══════════════════════════════════════════════════════════════════════════════
// Export / Import settings
// ═══════════════════════════════════════════════════════════════════════════════

const EXPORT_TYPE = "json-response-devtools-settings";
const EXPORT_VERSION = 1;

const exportSettingsBtn = document.getElementById("exportSettingsBtn");
const importSettingsBtn = document.getElementById("importSettingsBtn");
const importSettingsInputEl = document.getElementById("importSettingsInput");

function buildExportPayload() {
  return {
    type: EXPORT_TYPE,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      swaggerConfigs: getSwaggerConfigs(),
      jumpEnabled:
        localStorage.getItem(CONFIG.STORAGE_KEYS.JUMP_ENABLED) !== "false",
      decryptEnabled:
        localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_ENABLED) === "true",
      decryptField:
        localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_FIELD) || "data",
      decryptConfigs: getDecryptKeys(),
    },
  };
}

function exportSettings() {
  const payload = buildExportPayload();

  if (
    payload.settings.swaggerConfigs.length === 0 &&
    payload.settings.decryptConfigs.length === 0
  ) {
    showToast("暂无配置可导出");
    return;
  }

  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[-:]/g, "")
    .replace("T", "-");

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `json-response-settings-${stamp}.json`;
  link.click();

  // 延迟释放，避免下载尚未开始就被回收
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("已导出配置文件");
}

// 只保留已知字段，避免把导入文件里的任意结构写进 localStorage
function normalizeSwaggerConfig(raw) {
  if (!raw || typeof raw !== "object") return null;

  const base = String(raw.base ?? "").trim();
  if (!base) return null;

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    name: String(raw.name ?? "").trim(),
    base,
    suffix: String(raw.suffix ?? CONFIG.SWAGGER_URL_SUFFIX).trim(),
    prefixes: Array.isArray(raw.prefixes)
      ? raw.prefixes.map((p) => String(p).trim()).filter(Boolean)
      : [],
  };
}

function normalizeDecryptKey(raw) {
  if (!raw || typeof raw !== "object") return null;

  const key = String(raw.key ?? "").trim();
  if (!key) return null;

  const algorithm = raw.algorithm === "AES" ? "AES" : "SM4";

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    name: String(raw.name ?? "").trim(),
    algorithm,
    key,
  };
}

// 先按 id 匹配，再按业务字段去重，避免同一份配置导入多次产生副本
function mergeById(existing, incoming, identity) {
  let added = 0;
  let updated = 0;

  for (const item of incoming) {
    const idx = existing.findIndex(
      (cur) => cur.id === item.id || identity(cur) === identity(item),
    );

    if (idx >= 0) {
      existing[idx] = { ...item, id: existing[idx].id };
      updated += 1;
    } else {
      existing.push(item);
      added += 1;
    }
  }

  return { added, updated };
}

// silent=true 用于设置文件的自动恢复：不弹 toast，只用返回值表示是否成功。
function importSettings(payload, { silent = false } = {}) {
  if (!payload || typeof payload !== "object" || !payload.settings) {
    if (!silent) showToast("文件格式不正确");
    return false;
  }

  if (payload.type !== EXPORT_TYPE) {
    if (!silent) showToast("这不是本扩展导出的配置文件");
    return false;
  }

  const settings = payload.settings;

  const swaggerIncoming = (
    Array.isArray(settings.swaggerConfigs) ? settings.swaggerConfigs : []
  )
    .map(normalizeSwaggerConfig)
    .filter(Boolean);

  const keysIncoming = (
    Array.isArray(settings.decryptConfigs) ? settings.decryptConfigs : []
  )
    .map(normalizeDecryptKey)
    .filter(Boolean);

  const swaggerConfigs = getSwaggerConfigs();
  const swaggerResult = mergeById(
    swaggerConfigs,
    swaggerIncoming,
    (c) => `${c.base}${c.suffix}`,
  );
  saveJSON(CONFIG.STORAGE_KEYS.SWAGGER_CONFIGS, swaggerConfigs);

  const decryptKeys = getDecryptKeys();
  const keyResult = mergeById(
    decryptKeys,
    keysIncoming,
    (k) => `${k.algorithm}:${k.key}`,
  );
  saveJSON(CONFIG.STORAGE_KEYS.DECRYPT_CONFIGS, decryptKeys);

  if (typeof settings.jumpEnabled === "boolean") {
    localStorage.setItem(
      CONFIG.STORAGE_KEYS.JUMP_ENABLED,
      String(settings.jumpEnabled),
    );
    jumpEnabledEl.checked = settings.jumpEnabled;
  }

  if (typeof settings.decryptEnabled === "boolean") {
    localStorage.setItem(
      CONFIG.STORAGE_KEYS.DECRYPT_ENABLED,
      String(settings.decryptEnabled),
    );
    decryptEnabledEl.checked = settings.decryptEnabled;
    decryptOptionsEl.classList.toggle(
      "decrypt-options--hidden",
      !settings.decryptEnabled,
    );
  }

  if (typeof settings.decryptField === "string" && settings.decryptField.trim()) {
    const field = settings.decryptField.trim();
    localStorage.setItem(CONFIG.STORAGE_KEYS.DECRYPT_FIELD, field);
    decryptFieldEl.value = field;
  }

  renderSwaggerList();
  renderDecryptKeyList();

  const added = swaggerResult.added + keyResult.added;
  const updated = swaggerResult.updated + keyResult.updated;

  if (!silent) {
    showToast(`导入完成：新增 ${added} 项，更新 ${updated} 项`);
  }

  return true;
}

// ── 点击跳转开关 ────────────────────────────────────────────────────────────

const jumpEnabledEl = document.getElementById("jumpEnabled");

// 默认开启：仅当显式存过 "false" 才算关闭
jumpEnabledEl.checked =
  localStorage.getItem(CONFIG.STORAGE_KEYS.JUMP_ENABLED) !== "false";

jumpEnabledEl.addEventListener("change", () => {
  localStorage.setItem(
    CONFIG.STORAGE_KEYS.JUMP_ENABLED,
    String(jumpEnabledEl.checked),
  );
  markSettingsChanged();
  showToast(jumpEnabledEl.checked ? "已开启点击跳转" : "已关闭点击跳转");
});

exportSettingsBtn.addEventListener("click", exportSettings);

importSettingsBtn.addEventListener("click", () => {
  importSettingsInputEl.value = "";
  importSettingsInputEl.click();
});

importSettingsInputEl.addEventListener("change", async () => {
  const file = importSettingsInputEl.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();

    if (importSettings(JSON.parse(text))) {
      markSettingsChanged();
    }
  } catch {
    showToast("文件解析失败，请确认是有效的 JSON");
  }
});

// ── 版本与更新 ──────────────────────────────────────────────────────────────

const currentVersionEl = document.getElementById("currentVersion");
const updateStatusEl = document.getElementById("updateStatus");
const checkUpdateBtn = document.getElementById("checkUpdateBtn");

currentVersionEl.textContent = `v${UPDATER.getCurrentVersion()}`;

checkUpdateBtn.addEventListener("click", () => {
  checkUpdateBtn.disabled = true;

  UPDATER.checkForUpdates({
    silent: false,
    onStatus: (state, detail) => {
      if (state === "checking") {
        updateStatusEl.textContent = "正在检查…";
        return;
      }

      if (state === "latest") {
        updateStatusEl.textContent = "已是最新版本";
        showToast("已是最新版本");
        return;
      }

      if (state === "update") {
        updateStatusEl.textContent = `发现新版本 v${detail.release.version}`;
        return;
      }

      if (state === "error") {
        updateStatusEl.textContent = "检查失败，请稍后重试或手动访问 GitHub Release";
        showToast("检查更新失败");
      }
    },
  }).finally(() => {
    checkUpdateBtn.disabled = false;
  });
});

// ── 设置文件（更新后自动恢复） ────────────────────────────────────────────────
// 扩展的 localStorage 绑定在扩展 ID 上：只要从新目录加载（或先移除再加载），
// Chrome 就当成另一个扩展，配置全部清空。绑定磁盘上的一个 JSON 文件后，配置
// 变更会自动写回文件，新装后再指向同一个文件即可把个性化设置全部找回。

const settingsFileNameEl = document.getElementById("settingsFileName");
const settingsFileStatusEl = document.getElementById("settingsFileStatus");
const settingsFileAlertEl = document.getElementById("settingsFileAlert");
const settingsFileBoundActionsEl = document.getElementById("settingsFileBoundActions");
const bindSettingsFileBtn = document.getElementById("bindSettingsFileBtn");
const createSettingsFileBtn = document.getElementById("createSettingsFileBtn");
const restoreSettingsFileBtn = document.getElementById("restoreSettingsFileBtn");
const saveSettingsFileBtn = document.getElementById("saveSettingsFileBtn");
const unbindSettingsFileBtn = document.getElementById("unbindSettingsFileBtn");

let settingsFileHandle = null;
let settingsFilePermission = "prompt";
let settingsFileSyncTimer = 0;

function hasAnySettings() {
  return getSwaggerConfigs().length > 0 || getDecryptKeys().length > 0;
}

// 任何配置写入后调用：把最新配置刷回绑定的文件（合并写，延迟防抖）
function markSettingsChanged() {
  renderSettingsFileState();

  if (!settingsFileHandle || settingsFilePermission !== "granted") {
    return;
  }

  window.clearTimeout(settingsFileSyncTimer);
  settingsFileSyncTimer = window.setTimeout(() => {
    void writeSettingsFile({ silent: true });
  }, 400);
}

async function writeSettingsFile({ silent = false } = {}) {
  if (!settingsFileHandle) {
    return false;
  }

  try {
    await SETTINGS_FILE.writeJson(settingsFileHandle, buildExportPayload());
    localStorage.setItem(
      CONFIG.STORAGE_KEYS.SETTINGS_FILE_LAST_SYNC,
      new Date().toISOString(),
    );

    renderSettingsFileState();

    if (!silent) {
      showToast("已写入设置文件");
    }

    return true;
  } catch {
    settingsFilePermission = "prompt";
    renderSettingsFileState("写入失败，可能是文件被移动或权限已过期，请重新选择设置文件。");

    if (!silent) {
      showToast("写入设置文件失败");
    }

    return false;
  }
}

async function restoreFromSettingsFile({ silent = false } = {}) {
  if (!settingsFileHandle) {
    return false;
  }

  let payload;

  try {
    payload = await SETTINGS_FILE.readJson(settingsFileHandle);
  } catch {
    renderSettingsFileState("读取失败，文件可能已被移动或删除，请重新选择设置文件。");

    if (!silent) {
      showToast("读取设置文件失败");
    }

    return false;
  }

  const imported = importSettings(payload, { silent });

  if (imported) {
    localStorage.setItem(
      CONFIG.STORAGE_KEYS.SETTINGS_FILE_LAST_SYNC,
      new Date().toISOString(),
    );
  }

  renderSettingsFileState();
  return imported;
}

function renderSettingsFileState(overrideStatus) {
  const name = settingsFileHandle
    ? settingsFileHandle.name ||
      localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS_FILE_NAME) ||
      "settings.json"
    : "";

  settingsFileNameEl.textContent = name || "未绑定";
  settingsFileBoundActionsEl.classList.toggle("hidden", !settingsFileHandle);

  const lastSync = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS_FILE_LAST_SYNC);
  const lastSyncText = lastSync
    ? `最近同步：${new Date(lastSync).toLocaleString()}`
    : "尚未同步";

  if (overrideStatus) {
    settingsFileStatusEl.textContent = overrideStatus;
  } else if (!SETTINGS_FILE.isSupported()) {
    settingsFileStatusEl.textContent =
      "当前浏览器不支持文件绑定，请用页面顶部的「一键导出 / 导入 JSON」备份配置。";
  } else if (!settingsFileHandle) {
    settingsFileStatusEl.textContent =
      "尚未绑定设置文件，配置只保存在当前扩展中，换目录加载或重装后会丢失。";
  } else if (settingsFilePermission === "granted") {
    settingsFileStatusEl.textContent = `配置变更会自动写入该文件 · ${lastSyncText}`;
  } else {
    settingsFileStatusEl.textContent =
      "浏览器需要你再次确认文件访问权限：点击「从文件恢复」或「立即写入文件」即可授权。";
  }

  settingsFileAlertEl.classList.toggle(
    "hidden",
    hasAnySettings() || Boolean(settingsFileHandle),
  );
}

// 授权必须发生在用户手势里，所以所有需要权限的按钮都先走这一步。
async function ensureSettingsFileAccess() {
  if (!settingsFileHandle) {
    return false;
  }

  settingsFilePermission = await SETTINGS_FILE.ensurePermission(settingsFileHandle, {
    request: true,
  });

  renderSettingsFileState();

  if (settingsFilePermission !== "granted") {
    showToast("未获得文件访问权限");
    return false;
  }

  return true;
}

async function bindSettingsFile(handle, { restoreFirst }) {
  settingsFileHandle = handle;
  settingsFilePermission = await SETTINGS_FILE.ensurePermission(handle, {
    request: true,
  });

  if (settingsFilePermission !== "granted") {
    showToast("未获得文件访问权限");
    renderSettingsFileState();
    return;
  }

  await SETTINGS_FILE.saveHandle(handle);
  localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS_FILE_NAME, handle.name || "");

  // 已有文件先合并回本地，再把合并后的结果写回去——两边都不会丢东西。
  if (restoreFirst) {
    await restoreFromSettingsFile({ silent: true });
  }

  await writeSettingsFile({ silent: true });

  renderSettingsFileState();
  showToast(`已绑定设置文件：${handle.name || ""}`);
}

bindSettingsFileBtn.addEventListener("click", async () => {
  try {
    const handle = await SETTINGS_FILE.pickExisting();

    if (handle) {
      await bindSettingsFile(handle, { restoreFirst: true });
    }
  } catch (error) {
    if (!SETTINGS_FILE.isAbortError(error)) {
      showToast("选择文件失败");
    }
  }
});

createSettingsFileBtn.addEventListener("click", async () => {
  try {
    const handle = await SETTINGS_FILE.pickNew();

    if (handle) {
      await bindSettingsFile(handle, { restoreFirst: false });
    }
  } catch (error) {
    if (!SETTINGS_FILE.isAbortError(error)) {
      showToast("创建文件失败");
    }
  }
});

restoreSettingsFileBtn.addEventListener("click", async () => {
  if (await ensureSettingsFileAccess()) {
    await restoreFromSettingsFile();
  }
});

saveSettingsFileBtn.addEventListener("click", async () => {
  if (await ensureSettingsFileAccess()) {
    await writeSettingsFile();
  }
});

unbindSettingsFileBtn.addEventListener("click", async () => {
  await SETTINGS_FILE.clearHandle();
  localStorage.removeItem(CONFIG.STORAGE_KEYS.SETTINGS_FILE_NAME);
  localStorage.removeItem(CONFIG.STORAGE_KEYS.SETTINGS_FILE_LAST_SYNC);

  settingsFileHandle = null;
  settingsFilePermission = "prompt";

  renderSettingsFileState();
  showToast("已解除绑定");
});

async function initSettingsFile() {
  if (!SETTINGS_FILE.isSupported()) {
    bindSettingsFileBtn.disabled = true;
    createSettingsFileBtn.disabled = true;
    renderSettingsFileState();
    return;
  }

  settingsFileHandle = await SETTINGS_FILE.getHandle();

  if (!settingsFileHandle) {
    renderSettingsFileState();
    return;
  }

  settingsFilePermission = await SETTINGS_FILE.ensurePermission(settingsFileHandle);

  if (settingsFilePermission === "granted") {
    // 配置为空说明这是刚更新/重装后的全新安装，直接恢复；否则只把本地配置
    // 刷回文件，避免把用户刚删掉的配置从旧文件里合并回来。
    if (hasAnySettings()) {
      await writeSettingsFile({ silent: true });
    } else {
      const restored = await restoreFromSettingsFile({ silent: true });

      if (restored) {
        showToast(`已从 ${settingsFileHandle.name || "设置文件"} 恢复配置`);
      }
    }
  }

  renderSettingsFileState();
}

void initSettingsFile();
