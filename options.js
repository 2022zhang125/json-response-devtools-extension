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
  showToast("已保存");
}

function deleteSwaggerConfig(id) {
  const configs = getSwaggerConfigs().filter((c) => c.id !== id);
  saveJSON(CONFIG.STORAGE_KEYS.SWAGGER_CONFIGS, configs);
  renderSwaggerList();
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
});

// ── Target field ──────────────────────────────────────────────────────────────

decryptFieldEl.value =
  localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_FIELD) || "data";

saveDecryptFieldBtn.addEventListener("click", () => {
  const value = decryptFieldEl.value.trim() || "data";
  localStorage.setItem(CONFIG.STORAGE_KEYS.DECRYPT_FIELD, value);
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
  showToast("已保存");
}

function deleteDecryptKey(id) {
  const keys = getDecryptKeys().filter((k) => k.id !== id);
  saveJSON(CONFIG.STORAGE_KEYS.DECRYPT_CONFIGS, keys);
  renderDecryptKeyList();
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
