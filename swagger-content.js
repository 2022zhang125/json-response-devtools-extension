// Injected on demand by panel.js (chrome.scripting.executeScript) into the
// Swagger/knife4j tab it just opened. This is NOT a static content script — it
// must never run on ordinary pages.
(function () {
  const searchText = getSearchText();

  // Legacy links may still carry the marker in the URL — drop it so the address
  // bar is left with knife4j's own route once the menu is opened.
  stripSearchParamFromUrl();

  if (!searchText) {
    return;
  }

  tryAutoSearch(searchText);

  // panel.js seeds this global in the same isolated world right before injecting
  // this file; the URL form is only a fallback for older links.
  function getSearchText() {
    const fromGlobal = globalThis.__JSON_RESPONSE_SEARCH__;

    if (typeof fromGlobal === "string" && fromGlobal) {
      return fromGlobal;
    }

    return getSearchTextFromUrl();
  }

  function getSearchTextFromUrl() {
    const match = window.location.href.match(/[?&]jsonResponseSearch=([^&]+)/);

    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }

    return "";
  }

  function stripSearchParamFromUrl() {
    const url = window.location.href;

    if (!url.includes("jsonResponseSearch=")) {
      return;
    }

    const cleaned = url
      .replace(/([?&])jsonResponseSearch=[^&]*/, "$1")
      .replace(/\?&/, "?")
      .replace(/[?&]$/, "");

    try {
      window.history.replaceState(null, "", cleaned);
    } catch {}
  }

  // Poll for an element until it shows up, then hand it to `onFound`.
  // Returns immediately; polling stops on success or after `maxAttempts`.
  function waitFor(find, onFound, maxAttempts) {
    let attempts = 0;

    const timer = window.setInterval(() => {
      attempts++;

      const found = find();

      if (found) {
        window.clearInterval(timer);
        onFound(found);
        return;
      }

      if (attempts >= maxAttempts) {
        window.clearInterval(timer);
      }
    }, 100);
  }

  function tryAutoSearch(searchText) {
    waitFor(findSwaggerSearchInput, (input) => {
      input.focus();
      setNativeInputValue(input, searchText);

      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      for (const type of ["keydown", "keyup"]) {
        input.dispatchEvent(
          new KeyboardEvent(type, {
            key: "Enter",
            code: "Enter",
            bubbles: true,
          }),
        );
      }

      openMatchedMenu(searchText);
    }, 60);
  }

  function findSwaggerSearchInput() {
    return (
      document.querySelector('input[placeholder="输入文档关键字搜索"]') ||
      document.querySelector("input.ant-select-search__field") ||
      document.querySelector("input.ant-input.ant-select-search__field")
    );
  }

  function setNativeInputValue(input, value) {
    const inputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;

    inputValueSetter?.call(input, value);
  }

  function openMatchedMenu(apiPath) {
    let attempts = 0;
    const maxAttempts = 80;

    const timer = window.setInterval(() => {
      attempts++;

      const matchedLink = findMatchedKnife4jLink(apiPath);

      if (matchedLink) {
        clickElement(matchedLink);
        window.clearInterval(timer);
        return;
      }

      const firstMenu = findFirstExpandableMenu();

      if (firstMenu) {
        clickElement(firstMenu);

        const firstSubMenuLink = findFirstKnife4jSubMenuLink();

        if (firstSubMenuLink) {
          clickElement(firstSubMenuLink);
          window.clearInterval(timer);
          return;
        }
      }

      if (attempts >= maxAttempts) {
        window.clearInterval(timer);
      }
    }, 100);
  }

  function getKnife4jLinks() {
    return Array.from(
      document.querySelectorAll("a.knife4j-menu-left-style[href]"),
    ).filter(isVisibleElement);
  }

  function findMatchedKnife4jLink(apiPath) {
    const normalizedApiPath = normalizeText(apiPath);
    const normalizedMethodName = normalizeText(getApiMethodName(apiPath));

    const links = getKnife4jLinks();

    const hrefOf = (link) => {
      const raw = link.getAttribute("href") || "";
      try {
        return normalizeText(decodeURIComponent(raw));
      } catch {
        return normalizeText(raw);
      }
    };

    return (
      links.find((link) => hrefOf(link).includes(normalizedApiPath)) ||
      links.find((link) => hrefOf(link).includes(normalizedMethodName)) ||
      null
    );
  }

  function findFirstKnife4jSubMenuLink() {
    return getKnife4jLinks()[0] || null;
  }

  function getApiMethodName(apiPath) {
    const path = `${apiPath || ""}`.split("?")[0].replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean);

    return parts[parts.length - 1] || path;
  }

  function findFirstExpandableMenu() {
    const candidates = [
      ...document.querySelectorAll(".knife4j-menu .ant-menu-submenu-title"),
      ...document.querySelectorAll(".ant-menu-submenu-title"),
    ];

    return candidates.find(isVisibleElement) || null;
  }

  function isVisibleElement(element) {
    if (!element) {
      return false;
    }

    const rect = element.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const style = window.getComputedStyle(element);

    return (
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      !element.closest(".ant-select-dropdown-hidden")
    );
  }

  function clickElement(element) {
    if (!element) {
      return;
    }

    element.scrollIntoView({
      block: "center",
      inline: "nearest",
    });

    for (const type of ["mouseover", "mousedown", "mouseup", "click"]) {
      element.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
    }

    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute("href") || "";

      if (href.startsWith("#/")) {
        window.location.hash = href.slice(1);
      }
    }
  }

  function normalizeText(text) {
    return `${text || ""}`.replace(/\s+/g, "").trim();
  }
})();
