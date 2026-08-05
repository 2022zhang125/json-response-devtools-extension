/**
 * User-configurable defaults and shared storage keys.
 */
const CONFIG = {
  /** Default Swagger page path suffix. */
  SWAGGER_URL_SUFFIX: "/loancrm-admin/doc.html#/home",

  /** Default API path prefixes to strip for display. */
  API_PATH_PREFIX_STRIP: ["/loancrm-admin"],

  /** Source repo used for the GitHub Release update check. */
  GITHUB: {
    OWNER: "2022zhang125",
    REPO: "json-response-devtools-extension",
    get LATEST_RELEASE_API() {
      return `https://api.github.com/repos/${this.OWNER}/${this.REPO}/releases/latest`;
    },
    get RELEASES_PAGE() {
      return `https://github.com/${this.OWNER}/${this.REPO}/releases/latest`;
    },
  },

  /** Silent update checks run at most once per this interval. */
  UPDATE_CHECK_INTERVAL_MS: 6 * 60 * 60 * 1000,

  STORAGE_KEYS: {
    // ── New multi-config format ──────────────────────────────────────────────
    /** JSON array of { id, name, base, suffix, prefixes[] } */
    SWAGGER_CONFIGS: "json-response-swagger-configs",
    /** JSON array of { id, name, algorithm, key } */
    DECRYPT_CONFIGS: "json-response-decrypt-configs",

    // ── Decrypt global settings ──────────────────────────────────────────────
    DECRYPT_ENABLED: "json-response-decrypt-enabled",
    DECRYPT_FIELD: "json-response-decrypt-field",

    // ── Sidebar state ────────────────────────────────────────────────────────
    SIDEBAR_WIDTH: "json-response-sidebar-width",
    SIDEBAR_COLLAPSED: "json-response-sidebar-collapsed",

    // ── Panel behavior ───────────────────────────────────────────────────────
    /** "true" | "false"; whether clicking an API name jumps to Swagger. */
    JUMP_ENABLED: "json-response-jump-enabled",

    // ── Settings file (survives extension updates) ───────────────────────────
    /** Display name of the bound settings file. */
    SETTINGS_FILE_NAME: "json-response-settings-file-name",
    /** ISO timestamp of the last successful write/read of that file. */
    SETTINGS_FILE_LAST_SYNC: "json-response-settings-file-last-sync",

    // ── Update check ─────────────────────────────────────────────────────────
    /** Timestamp (ms) of the last GitHub Release check. */
    UPDATE_LAST_CHECK: "json-response-update-last-check",
    /** Version the user chose to skip; no silent popup for it again. */
    UPDATE_SKIPPED_VERSION: "json-response-update-skipped-version",
    /** JSON cache of the last release payload we resolved. */
    UPDATE_LATEST_RELEASE: "json-response-update-latest-release",

    // ── Legacy keys (read for migration only) ────────────────────────────────
    SWAGGER_BASE: "json-response-swagger-base-url",
    SWAGGER_SUFFIX: "json-response-swagger-suffix",
    API_PREFIX_STRIP: "json-response-api-prefix-strip",
    DECRYPT_KEY: "json-response-decrypt-key",
    DECRYPT_ALGORITHM: "json-response-decrypt-algorithm",
  },
};
