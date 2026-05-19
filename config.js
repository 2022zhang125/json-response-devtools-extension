/**
 * User-configurable defaults and shared storage keys.
 * Defaults are used when the user has not saved a custom value in the settings page.
 */
const CONFIG = {
  /** Swagger page path appended after the base URL when opening Swagger. */
  SWAGGER_URL_SUFFIX: "/loancrm-admin/doc.html#/home",

  /** URL path prefixes to strip when displaying API names in the request list. */
  API_PATH_PREFIX_STRIP: ["/loancrm-admin"],

  STORAGE_KEYS: {
    SWAGGER_BASE: "json-response-swagger-base-url",
    SWAGGER_SUFFIX: "json-response-swagger-suffix",
    API_PREFIX_STRIP: "json-response-api-prefix-strip",
    SIDEBAR_WIDTH: "json-response-sidebar-width",
    SIDEBAR_COLLAPSED: "json-response-sidebar-collapsed",
    DECRYPT_ENABLED: "json-response-decrypt-enabled",
    DECRYPT_ALGORITHM: "json-response-decrypt-algorithm",
    DECRYPT_KEY: "json-response-decrypt-key",
    DECRYPT_FIELD: "json-response-decrypt-field",
  },
};
