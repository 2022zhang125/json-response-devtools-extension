/**
 * User-configurable defaults and shared storage keys.
 */
const CONFIG = {
  /** Default Swagger page path suffix. */
  SWAGGER_URL_SUFFIX: "/loancrm-admin/doc.html#/home",

  /** Default API path prefixes to strip for display. */
  API_PATH_PREFIX_STRIP: ["/loancrm-admin"],

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

    // ── Legacy keys (read for migration only) ────────────────────────────────
    SWAGGER_BASE: "json-response-swagger-base-url",
    SWAGGER_SUFFIX: "json-response-swagger-suffix",
    API_PREFIX_STRIP: "json-response-api-prefix-strip",
    DECRYPT_KEY: "json-response-decrypt-key",
    DECRYPT_ALGORITHM: "json-response-decrypt-algorithm",
  },
};
