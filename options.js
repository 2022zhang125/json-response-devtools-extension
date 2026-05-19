const swaggerBaseInputEl = document.getElementById("swaggerBaseInput");
const swaggerSuffixInputEl = document.getElementById("swaggerSuffixInput");
const apiPrefixInputEl = document.getElementById("apiPrefixInput");
const saveSwaggerBaseBtn = document.getElementById("saveSwaggerBase");
const saveSwaggerSuffixBtn = document.getElementById("saveSwaggerSuffix");
const saveApiPrefixBtn = document.getElementById("saveApiPrefix");
const decryptEnabledEl = document.getElementById("decryptEnabled");
const decryptOptionsEl = document.getElementById("decryptOptions");
const decryptAlgorithmEl = document.getElementById("decryptAlgorithm");
const decryptKeyEl = document.getElementById("decryptKey");
const decryptFieldEl = document.getElementById("decryptField");
const saveDecryptBtn = document.getElementById("saveDecryptSettings");
const toastEl = document.getElementById("toast");

// ── Swagger settings ──────────────────────────────────────────────────────────

swaggerBaseInputEl.value =
  localStorage.getItem(CONFIG.STORAGE_KEYS.SWAGGER_BASE) || "";

const savedSuffix = localStorage.getItem(CONFIG.STORAGE_KEYS.SWAGGER_SUFFIX);
swaggerSuffixInputEl.value =
  savedSuffix !== null ? savedSuffix : CONFIG.SWAGGER_URL_SUFFIX;
swaggerSuffixInputEl.placeholder = CONFIG.SWAGGER_URL_SUFFIX;

const savedPrefixes = localStorage.getItem(CONFIG.STORAGE_KEYS.API_PREFIX_STRIP);
if (savedPrefixes !== null) {
  try {
    apiPrefixInputEl.value = JSON.parse(savedPrefixes).join("\n");
  } catch {
    apiPrefixInputEl.value = CONFIG.API_PATH_PREFIX_STRIP.join("\n");
  }
} else {
  apiPrefixInputEl.value = CONFIG.API_PATH_PREFIX_STRIP.join("\n");
}

saveSwaggerBaseBtn.addEventListener("click", () => {
  const value = swaggerBaseInputEl.value.trim();
  if (value) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.SWAGGER_BASE, value);
    showToast("Swagger 地址已保存");
  } else {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.SWAGGER_BASE);
    showToast("Swagger 地址已清除");
  }
});

saveSwaggerSuffixBtn.addEventListener("click", () => {
  const value = swaggerSuffixInputEl.value.trim();
  if (value) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.SWAGGER_SUFFIX, value);
  } else {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.SWAGGER_SUFFIX);
  }
  showToast("已保存");
});

saveApiPrefixBtn.addEventListener("click", () => {
  const lines = apiPrefixInputEl.value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  localStorage.setItem(
    CONFIG.STORAGE_KEYS.API_PREFIX_STRIP,
    JSON.stringify(lines),
  );
  showToast("已保存");
});

[
  [swaggerBaseInputEl, saveSwaggerBaseBtn],
  [swaggerSuffixInputEl, saveSwaggerSuffixBtn],
].forEach(([input, btn]) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btn.click();
    }
  });
});

// ── Decrypt settings ──────────────────────────────────────────────────────────

const decryptEnabled =
  localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_ENABLED) === "true";
decryptEnabledEl.checked = decryptEnabled;
decryptOptionsEl.classList.toggle("decrypt-options--hidden", !decryptEnabled);

decryptAlgorithmEl.value =
  localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_ALGORITHM) || "SM4";

decryptKeyEl.value =
  localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_KEY) || "";

decryptFieldEl.value =
  localStorage.getItem(CONFIG.STORAGE_KEYS.DECRYPT_FIELD) || "data";

decryptEnabledEl.addEventListener("change", () => {
  const enabled = decryptEnabledEl.checked;
  localStorage.setItem(CONFIG.STORAGE_KEYS.DECRYPT_ENABLED, String(enabled));
  decryptOptionsEl.classList.toggle("decrypt-options--hidden", !enabled);
});

decryptAlgorithmEl.addEventListener("change", () => {
  localStorage.setItem(CONFIG.STORAGE_KEYS.DECRYPT_ALGORITHM, decryptAlgorithmEl.value);
});

saveDecryptBtn.addEventListener("click", () => {
  const key = decryptKeyEl.value.trim();
  const field = decryptFieldEl.value.trim() || "data";

  if (!key) {
    showToast("请输入密钥");
    decryptKeyEl.focus();
    return;
  }

  localStorage.setItem(CONFIG.STORAGE_KEYS.DECRYPT_KEY, key);
  localStorage.setItem(CONFIG.STORAGE_KEYS.DECRYPT_FIELD, field);
  showToast("解密配置已保存");
});

decryptKeyEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); saveDecryptBtn.click(); }
});

decryptFieldEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); saveDecryptBtn.click(); }
});

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  window.setTimeout(() => toastEl.classList.add("hidden"), 1500);
}
