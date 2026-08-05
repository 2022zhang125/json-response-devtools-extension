/**
 * GitHub Release update check.
 *
 * Shared by the DevTools panel (silent, throttled check on open) and the
 * settings page (manual "检查更新" button). The dialog carries its own markup
 * and styles so the module can be dropped into any extension page with a single
 * <script> tag.
 */
const UPDATER = (() => {
  const STYLE_ID = "json-response-updater-style";
  const DIALOG_ID = "json-response-updater-dialog";
  const MAX_NOTES_LENGTH = 4000;
  const EXTENSIONS_PAGE = "chrome://extensions";

  let dialogEl = null;

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * @param {object} [options]
   * @param {boolean} [options.silent] Suppress "already latest" / failure UI and
   *   honour both the throttle and the skipped-version choice.
   * @param {(state: string, detail?: object) => void} [options.onStatus]
   *   Progress hook: "checking" | "latest" | "update" | "error" | "throttled".
   * @returns {Promise<object|null>} the release info when an update is available.
   */
  async function checkForUpdates({ silent = true, onStatus } = {}) {
    const notify = (state, detail) => onStatus?.(state, detail);

    if (silent && !isCheckDue()) {
      notify("throttled");
      return null;
    }

    notify("checking");

    let release;

    try {
      release = await fetchLatestRelease();
    } catch (error) {
      notify("error", { error });
      return null;
    }

    localStorage.setItem(CONFIG.STORAGE_KEYS.UPDATE_LAST_CHECK, `${Date.now()}`);
    localStorage.setItem(
      CONFIG.STORAGE_KEYS.UPDATE_LATEST_RELEASE,
      JSON.stringify(release),
    );

    const currentVersion = getCurrentVersion();

    if (compareVersions(release.version, currentVersion) <= 0) {
      notify("latest", { currentVersion, release });
      return null;
    }

    notify("update", { currentVersion, release });

    // A skipped version stays skipped for silent checks only — an explicit
    // "检查更新" always shows what's out there.
    if (silent && getSkippedVersion() === release.version) {
      return release;
    }

    showUpdateDialog(release, currentVersion);

    return release;
  }

  function getCurrentVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return "0.0.0";
    }
  }

  // ── Fetch / compare ─────────────────────────────────────────────────────────

  async function fetchLatestRelease() {
    const response = await fetch(CONFIG.GITHUB.LATEST_RELEASE_API, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!response.ok) {
      throw new Error(`GitHub API responded ${response.status}`);
    }

    const data = await response.json();

    return {
      version: normalizeVersion(data.tag_name),
      tag: data.tag_name || "",
      name: data.name || data.tag_name || "",
      notes: (data.body || "").slice(0, MAX_NOTES_LENGTH),
      pageUrl: data.html_url || CONFIG.GITHUB.RELEASES_PAGE,
      downloadUrl: pickZipAssetUrl(data),
      publishedAt: data.published_at || "",
    };
  }

  function pickZipAssetUrl(release) {
    const assets = Array.isArray(release.assets) ? release.assets : [];

    const zip =
      assets.find((asset) => /release\.zip$/i.test(asset.name || "")) ||
      assets.find((asset) => /\.zip$/i.test(asset.name || ""));

    return zip?.browser_download_url || "";
  }

  function normalizeVersion(tag) {
    return `${tag || ""}`.trim().replace(/^v/i, "");
  }

  // Numeric, segment-by-segment. Returns >0 when `a` is newer than `b`.
  function compareVersions(a, b) {
    const left = splitVersion(a);
    const right = splitVersion(b);
    const length = Math.max(left.length, right.length);

    for (let i = 0; i < length; i++) {
      const diff = (left[i] || 0) - (right[i] || 0);

      if (diff !== 0) {
        return diff > 0 ? 1 : -1;
      }
    }

    return 0;
  }

  function splitVersion(version) {
    return `${version || ""}`
      .split(/[.\-+]/)
      .map((part) => Number.parseInt(part, 10))
      .filter((part) => Number.isFinite(part));
  }

  function isCheckDue() {
    const last = Number(
      localStorage.getItem(CONFIG.STORAGE_KEYS.UPDATE_LAST_CHECK) || 0,
    );

    if (!Number.isFinite(last) || last <= 0) {
      return true;
    }

    return Date.now() - last >= CONFIG.UPDATE_CHECK_INTERVAL_MS;
  }

  function getSkippedVersion() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.UPDATE_SKIPPED_VERSION) || "";
  }

  // ── Dialog ──────────────────────────────────────────────────────────────────

  function showUpdateDialog(release, currentVersion = getCurrentVersion()) {
    ensureStyles();
    closeDialog();

    const overlay = document.createElement("div");
    overlay.id = DIALOG_ID;
    overlay.className = "updater-overlay";

    const card = document.createElement("div");
    card.className = "updater-card";

    card.appendChild(buildHeader(release));
    card.appendChild(buildVersionRow(currentVersion, release.version));

    const notes = buildNotes(release.notes);
    if (notes) {
      card.appendChild(notes);
    }

    const steps = buildSteps(release);
    card.appendChild(steps);

    card.appendChild(buildActions(release, steps));

    overlay.appendChild(card);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeDialog();
      }
    });

    document.addEventListener("keydown", onEscape, true);

    document.body.appendChild(overlay);
    dialogEl = overlay;
  }

  function onEscape(event) {
    if (event.key === "Escape" && dialogEl) {
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
    }
  }

  function closeDialog() {
    document.removeEventListener("keydown", onEscape, true);
    document.getElementById(DIALOG_ID)?.remove();
    dialogEl = null;
  }

  function buildHeader(release) {
    const header = document.createElement("div");
    header.className = "updater-header";

    const title = document.createElement("div");
    title.className = "updater-title";
    title.textContent = "发现新版本";

    const closeBtn = document.createElement("button");
    closeBtn.className = "updater-close";
    closeBtn.type = "button";
    closeBtn.title = "关闭";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeDialog);

    header.append(title, closeBtn);

    if (release.name) {
      const subtitle = document.createElement("div");
      subtitle.className = "updater-subtitle";
      subtitle.textContent = release.name;
      header.appendChild(subtitle);
    }

    return header;
  }

  function buildVersionRow(currentVersion, latestVersion) {
    const row = document.createElement("div");
    row.className = "updater-versions";

    const current = document.createElement("span");
    current.className = "updater-version updater-version--current";
    current.textContent = `当前 v${currentVersion}`;

    const arrow = document.createElement("span");
    arrow.className = "updater-arrow";
    arrow.textContent = "→";

    const latest = document.createElement("span");
    latest.className = "updater-version updater-version--latest";
    latest.textContent = `最新 v${latestVersion}`;

    row.append(current, arrow, latest);
    return row;
  }

  function buildNotes(notes) {
    if (!notes.trim()) {
      return null;
    }

    const wrap = document.createElement("div");
    wrap.className = "updater-notes";

    const title = document.createElement("div");
    title.className = "updater-notes-title";
    title.textContent = "更新内容";

    const body = document.createElement("pre");
    body.className = "updater-notes-body";
    body.textContent = notes;

    wrap.append(title, body);
    return wrap;
  }

  // Chrome extensions cannot replace their own files, so "更新" means: pull the
  // new package and reload it. The steps stay hidden until the download starts.
  function buildSteps(release) {
    const steps = document.createElement("div");
    steps.className = "updater-steps hidden";

    const title = document.createElement("div");
    title.className = "updater-steps-title";
    title.textContent = "下载完成后，按以下步骤更新到最新版本";

    const list = document.createElement("ol");
    list.className = "updater-steps-list";

    const items = [
      release.downloadUrl
        ? "解压后覆盖原来的扩展目录（保持同一目录，配置才不会丢）"
        : "在发布页下载安装包并解压，覆盖原来的扩展目录",
      `打开 ${EXTENSIONS_PAGE}，找到 Custom JSON Response Viewer`,
      "点击「重新加载」按钮，随后重新打开 DevTools 面板即可生效",
    ];

    for (const text of items) {
      const item = document.createElement("li");
      item.textContent = text;
      list.appendChild(item);
    }

    // 配置存在扩展 ID 名下：换目录或先移除再加载，Chrome 会当成另一个扩展。
    const note = document.createElement("div");
    note.className = "updater-steps-note";
    note.textContent =
      "别「移除」旧扩展、也别装到新目录：Chrome 会当成另一个扩展，Swagger 与解密等配置会被清空。已在设置页绑定「设置文件」的话，更新后重新指向该文件即可一键恢复。";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "updater-button updater-button--link";
    copyBtn.textContent = `复制 ${EXTENSIONS_PAGE}`;
    copyBtn.addEventListener("click", () => {
      navigator.clipboard
        .writeText(`${EXTENSIONS_PAGE}/`)
        .then(() => {
          copyBtn.textContent = "已复制，粘贴到地址栏打开";
        })
        .catch(() => {
          copyBtn.textContent = `请手动访问 ${EXTENSIONS_PAGE}`;
        });
    });

    steps.append(title, list, note, copyBtn);
    return steps;
  }

  function buildActions(release, steps) {
    const actions = document.createElement("div");
    actions.className = "updater-actions";

    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "updater-button updater-button--ghost";
    skipBtn.textContent = "忽略此版本";
    skipBtn.addEventListener("click", () => {
      localStorage.setItem(
        CONFIG.STORAGE_KEYS.UPDATE_SKIPPED_VERSION,
        release.version,
      );
      closeDialog();
    });

    const laterBtn = document.createElement("button");
    laterBtn.type = "button";
    laterBtn.className = "updater-button";
    laterBtn.textContent = "稍后再说";
    laterBtn.addEventListener("click", closeDialog);

    const pageBtn = document.createElement("button");
    pageBtn.type = "button";
    pageBtn.className = "updater-button";
    pageBtn.textContent = "查看发布页";
    pageBtn.addEventListener("click", () => openUrl(release.pageUrl));

    const updateBtn = document.createElement("button");
    updateBtn.type = "button";
    updateBtn.className = "updater-button updater-button--primary";
    updateBtn.textContent = "立即更新";
    updateBtn.addEventListener("click", () => {
      openUrl(release.downloadUrl || release.pageUrl);
      steps.classList.remove("hidden");
      updateBtn.textContent = "已开始下载";
      updateBtn.disabled = true;
    });

    actions.append(skipBtn, laterBtn, pageBtn, updateBtn);
    return actions;
  }

  function openUrl(url) {
    if (!url) {
      return;
    }

    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url });
      return;
    }

    window.open(url, "_blank", "noopener");
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE_TEXT;
    document.head.appendChild(style);
  }

  const STYLE_TEXT = `
.updater-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(31, 35, 40, 0.32);
}

.updater-card {
  width: 100%;
  max-width: 460px;
  max-height: 100%;
  overflow: auto;
  padding: 18px 20px 16px;
  border: 1px solid #d0d7de;
  border-radius: 12px;
  background: #ffffff;
  color: #1f2328;
  font-size: 13px;
  line-height: 1.6;
  box-shadow: 0 16px 48px rgba(31, 35, 40, 0.24);
}

.updater-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.updater-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
}

.updater-subtitle {
  width: 100%;
  color: #57606a;
  font-size: 12px;
}

.updater-close {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #57606a;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.updater-close:hover {
  background: #f0f3f6;
  color: #1f2328;
}

.updater-versions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}

.updater-version {
  padding: 2px 8px;
  border: 1px solid #d0d7de;
  border-radius: 999px;
  font-size: 12px;
}

.updater-version--current {
  color: #57606a;
}

.updater-version--latest {
  border-color: #1a7f37;
  background: #dafbe1;
  color: #1a7f37;
}

.updater-arrow {
  color: #8c959f;
}

.updater-notes-title,
.updater-steps-title {
  margin-bottom: 6px;
  color: #57606a;
  font-size: 12px;
  font-weight: 600;
}

.updater-notes-body {
  max-height: 200px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #f6f8fa;
  font-family: inherit;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.updater-steps {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #d4a72c66;
  border-radius: 8px;
  background: #fff8c5;
}

.updater-steps-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
}

.updater-steps-note {
  margin-top: 8px;
  color: #7d4e00;
  font-size: 12px;
  line-height: 1.6;
}

.updater-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.updater-button {
  height: 28px;
  padding: 0 12px;
  border: 1px solid #c9d1d9;
  border-radius: 6px;
  background: #ffffff;
  color: #1f2328;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.updater-button:hover:not(:disabled) {
  background: #f0f3f6;
  border-color: #b0b8c1;
}

.updater-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.updater-button--primary {
  border-color: #1f883d;
  background: #1f883d;
  color: #ffffff;
}

.updater-button--primary:hover:not(:disabled) {
  background: #1a7f37;
  border-color: #1a7f37;
  color: #ffffff;
}

.updater-button--ghost {
  margin-right: auto;
  border-color: transparent;
  color: #57606a;
}

.updater-button--link {
  height: auto;
  margin-top: 8px;
  padding: 0;
  border: none;
  background: transparent;
  color: #0969da;
  text-decoration: underline;
}

.updater-button--link:hover:not(:disabled) {
  background: transparent;
}

#${DIALOG_ID} .hidden {
  display: none;
}
`;

  return {
    checkForUpdates,
    showUpdateDialog,
    compareVersions,
    getCurrentVersion,
    closeDialog,
  };
})();
