(function () {
  const searchText = getSearchTextFromUrl();

  if (!searchText) {
    return;
  }

  tryAutoSearch(searchText);

  function getSearchTextFromUrl() {
    const href = window.location.href;

    const match = href.match(/[?&]jsonResponseSearch=([^&]+)/);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }

    return "";
  }

  function tryAutoSearch(searchText) {
    let count = 0;
    const maxCount = 60;

    const timer = window.setInterval(() => {
      count++;

      const input = findSwaggerSearchInput();

      if (input) {
        window.clearInterval(timer);

        input.focus();
        setNativeInputValue(input, searchText);

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            bubbles: true,
          }),
        );
        input.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: "Enter",
            code: "Enter",
            bubbles: true,
          }),
        );

        openMatchedMenu(searchText);
        return;
      }

      if (count >= maxCount) {
        window.clearInterval(timer);
      }
    }, 100);
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
    let count = 0;
    const maxCount = 80;

    const timer = window.setInterval(() => {
      count++;

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

      if (count >= maxCount) {
        window.clearInterval(timer);
      }
    }, 100);
  }

  function findMatchedKnife4jLink(apiPath) {
    const methodName = getApiMethodName(apiPath);
    const normalizedApiPath = normalizeText(apiPath);
    const normalizedMethodName = normalizeText(methodName);

    const links = Array.from(
      document.querySelectorAll("a.knife4j-menu-left-style[href]"),
    ).filter(isVisibleElement);

    const exactPathMatched = links.find((link) => {
      const href = decodeURIComponent(link.getAttribute("href") || "");
      return normalizeText(href).includes(normalizedApiPath);
    });

    if (exactPathMatched) {
      return exactPathMatched;
    }

    const methodMatched = links.find((link) => {
      const href = decodeURIComponent(link.getAttribute("href") || "");
      return normalizeText(href).includes(normalizedMethodName);
    });

    if (methodMatched) {
      return methodMatched;
    }

    return null;
  }

  function findFirstKnife4jSubMenuLink() {
    const links = Array.from(
      document.querySelectorAll("a.knife4j-menu-left-style[href]"),
    ).filter(isVisibleElement);

    return links[0] || null;
  }

  function getApiMethodName(apiPath) {
    const path = `${apiPath || ""}`.split("?")[0].replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean);

    return parts[parts.length - 1] || path;
  }

  function findMatchedMenuItem(apiPath) {
    const normalizedApiPath = normalizeText(apiPath);

    const candidates = [
      ...document.querySelectorAll(
        ".ant-select-dropdown:not(.ant-select-dropdown-hidden) *",
      ),
      ...document.querySelectorAll(".ant-menu-item"),
      ...document.querySelectorAll(".ant-tree-node-content-wrapper"),
      ...document.querySelectorAll("[role='treeitem']"),
      ...document.querySelectorAll("[role='menuitem']"),
      ...document.querySelectorAll("li"),
      ...document.querySelectorAll("a"),
      ...document.querySelectorAll("span"),
      ...document.querySelectorAll("div"),
    ];

    const exactMatched = candidates.find((element) => {
      if (!isVisibleElement(element)) {
        return false;
      }

      const text = normalizeText(element.textContent || "");
      return text === normalizedApiPath;
    });

    if (exactMatched) {
      return getClickableElement(exactMatched);
    }

    const includedMatched = candidates.find((element) => {
      if (!isVisibleElement(element)) {
        return false;
      }

      const text = normalizeText(element.textContent || "");
      return text.includes(normalizedApiPath);
    });

    return includedMatched ? getClickableElement(includedMatched) : null;
  }

  function findFirstExpandableMenu() {
    const candidates = [
      ...document.querySelectorAll(".knife4j-menu .ant-menu-submenu-title"),
      ...document.querySelectorAll(".ant-menu-submenu-title"),
    ];

    return findVisibleElement(candidates);
  }

  function findFirstClickableSubMenu() {
    const candidates = [
      ...document.querySelectorAll(
        ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option",
      ),
      ...document.querySelectorAll(".ant-menu-item"),
      ...document.querySelectorAll(".ant-tree-node-content-wrapper"),
      ...document.querySelectorAll("[role='treeitem']"),
      ...document.querySelectorAll("[role='menuitem']"),
      ...document.querySelectorAll("li"),
      ...document.querySelectorAll("a"),
    ];

    return findVisibleElement(
      candidates.filter((element) => {
        const text = normalizeText(element.textContent || "");
        return Boolean(text);
      }),
    );
  }

  function getClickableElement(element) {
    return (
      element.closest(".ant-select-item-option") ||
      element.closest(".ant-menu-item") ||
      element.closest(".ant-tree-node-content-wrapper") ||
      element.closest("[role='treeitem']") ||
      element.closest("[role='menuitem']") ||
      element.closest("li") ||
      element.closest("a") ||
      element
    );
  }

  function findVisibleElement(elements) {
    return elements.find(isVisibleElement) || null;
  }

  function isVisibleElement(element) {
    if (!element) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
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

    element.dispatchEvent(
      new MouseEvent("mouseover", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );

    element.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );

    element.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );

    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );

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
