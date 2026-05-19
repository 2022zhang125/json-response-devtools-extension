const swaggerBaseInputEl = document.getElementById("swaggerBaseInput");
const swaggerSuffixInputEl = document.getElementById("swaggerSuffixInput");
const apiPrefixInputEl = document.getElementById("apiPrefixInput");
const saveSwaggerBaseBtn = document.getElementById("saveSwaggerBase");
const saveSwaggerSuffixBtn = document.getElementById("saveSwaggerSuffix");
const saveApiPrefixBtn = document.getElementById("saveApiPrefix");
const toastEl = document.getElementById("toast");

// Load saved values, falling back to CONFIG defaults
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

// Enter key to save for single-line inputs
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

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  window.setTimeout(() => toastEl.classList.add("hidden"), 1500);
}
