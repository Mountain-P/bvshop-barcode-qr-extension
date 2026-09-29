(() => {
  "use strict";

  const STORAGE_KEY = "bvshopQrPending";
  const PREF_KEY = "bvshopQrEnabled";
  const MAX_PENDING_AGE_MS = 15 * 60 * 1000;

  const storageGet = (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, resolve));

  const storageSet = (items) =>
    new Promise((resolve) => chrome.storage.local.set(items, resolve));

  const normalize = (value) =>
    String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const isProductListPage = () =>
    /^\/product(?:\/|$)/.test(location.pathname) &&
    !/^\/product\/(?:edit|sort|inventory)/.test(location.pathname);

  const isBarcodePage = () => location.pathname === "/barcode/show";

  function findProductCard(editLink) {
    let node = editLink.parentElement;

    while (node && node !== document.body) {
      const editLinks = node.querySelectorAll('a[href*="/product/edit/"]');
      const publicLinks = [...node.querySelectorAll("a[href]")].filter((link) =>
        normalize(link.textContent).includes("商品頁面"),
      );
      const hasPrintAction = normalize(node.textContent).includes("列印條碼");

      if (editLinks.length === 1 && publicLinks.length === 1 && hasPrintAction) {
        return node;
      }

      node = node.parentElement;
    }

    return null;
  }

  function collectProductsFromList() {
    const products = [];
    const seen = new Set();

    for (const editLink of document.querySelectorAll('a[href*="/product/edit/"]')) {
      const idMatch = editLink.href.match(/\/product\/edit\/(\d+)/);
      if (!idMatch || seen.has(idMatch[1])) continue;

      const card = findProductCard(editLink);
      if (!card) continue;

      const publicLink = [...card.querySelectorAll("a[href]")].find((link) =>
        normalize(link.textContent).includes("商品頁面"),
      );
      if (!publicLink?.href) continue;

      const image = [...card.querySelectorAll("img[alt]")].find(
        (candidate) => normalize(candidate.alt) && candidate.alt !== "barcode",
      );
      const titleCandidate = [...card.querySelectorAll("p")].find((candidate) =>
        normalize(candidate.textContent),
      );

      products.push({
        id: idMatch[1],
        title: normalize(image?.alt || titleCandidate?.textContent),
        url: publicLink.href,
      });
      seen.add(idMatch[1]);
    }

    return products;
  }

  function collectSelectedProducts(modal) {
    const listProducts = collectProductsFromList();
    const listById = new Map(listProducts.map((product) => [product.id, product]));
    const groups = [...modal.querySelectorAll('[id^="barcode_prod"]')].filter(
      (group) => group.querySelector("tbody tr"),
    );

    return groups.map((group) => {
      const id = group.id.replace(/^barcode_prod/, "");
      const listProduct = listById.get(id);
      const heading = group.previousElementSibling;
      const rows = [...group.querySelectorAll("tbody tr")].map((row) => {
        const cells = row.querySelectorAll("td");
        return {
          variant: normalize(cells[0]?.textContent),
          barcode: normalize(cells[1]?.textContent),
        };
      });

      return {
        id,
        title: normalize(listProduct?.title || heading?.textContent),
        url: listProduct?.url || "",
        barcodes: rows.map((row) => row.barcode).filter(Boolean),
        variants: rows,
      };
    });
  }

  async function savePendingFromModal() {
    const modal = document.querySelector("#printBarcodeModal");
    const toggle = document.querySelector("#bvshop-qr-toggle");
    if (!modal || !toggle) return;

    const products = collectSelectedProducts(modal);
    const enabled = toggle.checked !== false;
    const mappedCount = products.filter((product) => product.url).length;
    const status = document.querySelector("#bvshop-qr-status");

    if (status) {
      if (!enabled) {
        status.textContent = "未啟用：將使用 BVSHOP 原版條碼版面。";
        status.dataset.state = "off";
      } else if (products.length === 0) {
        status.textContent = "等待讀取商品資料…";
        status.dataset.state = "pending";
      } else if (mappedCount === products.length) {
        status.textContent = `已找到 ${mappedCount} 個商品網址，列印時會自動加入 QR Code。`;
        status.dataset.state = "ok";
      } else {
        status.textContent = `已找到 ${mappedCount}/${products.length} 個商品網址；找不到網址的標籤會維持原樣。`;
        status.dataset.state = "warning";
      }
    }

    await storageSet({
      [PREF_KEY]: enabled,
      [STORAGE_KEY]: {
        enabled,
        createdAt: Date.now(),
        sourcePage: location.href,
        products,
      },
    });
  }

  async function ensureModalOption() {
    const modal = document.querySelector("#printBarcodeModal");
    if (!modal || modal.querySelector("#bvshop-qr-option")) return;

    const stored = await storageGet([PREF_KEY]);
    const enabled = stored[PREF_KEY] !== false;

    const option = document.createElement("div");
    option.id = "bvshop-qr-option";
    option.className = "basic-area bvshop-qr-option";
    option.innerHTML = `
      <div class="basic-title">商品 QR Code</div>
      <div class="basic-item bvshop-qr-option-body">
        <label class="bvshop-qr-label" for="bvshop-qr-toggle">
          <input id="bvshop-qr-toggle" type="checkbox" ${enabled ? "checked" : ""}>
          <span class="bvshop-qr-checkbox" aria-hidden="true"></span>
          <span>
            <strong>在條碼右側加入商品頁 QR Code</strong>
            <small>QR Code 由擴充套件在本機產生，不會把商品資料傳給第三方。</small>
          </span>
        </label>
        <div id="bvshop-qr-status" class="bvshop-qr-status" data-state="pending">等待讀取商品資料…</div>
      </div>
    `;

    const labelSizeArea = [...modal.querySelectorAll(".basic-area")].find(
      (area) => normalize(area.querySelector(".basic-title")?.textContent) === "選擇標籤尺寸",
    );
    const table = modal.querySelector(".basic-table");

    if (labelSizeArea) {
      labelSizeArea.insertAdjacentElement("afterend", option);
    } else if (table) {
      table.prepend(option);
    } else {
      modal.querySelector(".modal-body")?.prepend(option);
    }

    option.querySelector("#bvshop-qr-toggle")?.addEventListener("change", () => {
      void savePendingFromModal();
    });

    await savePendingFromModal();
  }

  function watchProductList() {
    void ensureModalOption();

    const observer = new MutationObserver((mutations) => {
      let modalChanged = false;

      for (const mutation of mutations) {
        if (
          mutation.target instanceof Element &&
          (mutation.target.id === "printBarcodeModal" ||
            mutation.target.closest?.("#printBarcodeModal"))
        ) {
          modalChanged = true;
          break;
        }
      }

      void ensureModalOption();
      if (modalChanged && document.querySelector("#printBarcodeModal.show")) {
        window.setTimeout(() => void savePendingFromModal(), 0);
      }
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    document.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest?.("#printBarcodeModal button");
        if (button && normalize(button.textContent) === "列印") {
          void savePendingFromModal();
        }
      },
      true,
    );
  }

  function buildLookup(products) {
    const byBarcode = new Map();
    const byTitle = new Map();

    for (const product of products) {
      if (!product.url) continue;

      for (const barcode of product.barcodes || []) {
        const key = normalize(barcode);
        if (key) byBarcode.set(key, product.url);
      }

      const titleKey = normalize(product.title);
      if (titleKey) {
        const current = byTitle.get(titleKey);
        byTitle.set(titleKey, current && current !== product.url ? null : product.url);
      }
    }

    return { byBarcode, byTitle };
  }

  function findProductUrl(sample, pending, lookup) {
    const barcode = normalize(
      sample.querySelector(".spec_barcode .sub")?.textContent ||
        sample.querySelector(".spec_barcode b")?.textContent,
    );
    const title = normalize(sample.querySelector(".spec_info .main")?.textContent);

    if (barcode && lookup.byBarcode.has(barcode)) {
      return lookup.byBarcode.get(barcode);
    }

    if (title && lookup.byTitle.get(title)) {
      return lookup.byTitle.get(title);
    }

    const titleMatch = title
      ? pending.products.find((product) => {
          const productTitle = normalize(product.title);
          return (
            product.url &&
            productTitle &&
            (productTitle.includes(title) || title.includes(productTitle))
          );
        })
      : null;
    if (titleMatch) return titleMatch.url;

    const mappedProducts = pending.products.filter((product) => product.url);
    return mappedProducts.length === 1 ? mappedProducts[0].url : "";
  }

  function createQrElement(url) {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();

    const container = document.createElement("div");
    container.className = "bvshop-qr-code";
    container.title = `商品頁面：${url}`;
    container.innerHTML = qr.createSvgTag({
      cellSize: 4,
      margin: 16,
      scalable: true,
      title: "商品頁 QR Code",
      alt: url,
    });
    return container;
  }

  function addQrToSample(sample, url) {
    if (sample.dataset.bvshopQrDone === "true") return true;

    const barcodeBox = sample.querySelector(".spec_barcode");
    const barcodeImage = barcodeBox?.querySelector('img[alt="barcode"]');
    if (!barcodeBox || !barcodeImage) return false;

    const barcodeContent = document.createElement("div");
    barcodeContent.className = "bvshop-barcode-content";

    while (barcodeBox.firstChild) {
      barcodeContent.appendChild(barcodeBox.firstChild);
    }

    barcodeBox.append(barcodeContent, createQrElement(url));
    barcodeBox.classList.add("bvshop-barcode-with-qr");
    sample.classList.add("bvshop-label-with-qr");
    sample.dataset.bvshopQrDone = "true";
    return true;
  }

  function showPrintNotice(added, total) {
    const notice = document.createElement("div");
    notice.className = `no-print bvshop-qr-print-notice ${added === total ? "is-ok" : "is-warning"}`;
    notice.textContent =
      added === total
        ? `✓ 已在 ${added} 張標籤加入商品 QR Code`
        : `⚠ 已在 ${added}/${total} 張標籤加入 QR Code；其餘標籤找不到商品網址，維持原樣。`;

    const printButton = document.querySelector("button.no-print");
    printButton?.insertAdjacentElement("afterend", notice);
  }

  async function decorateBarcodePage() {
    const stored = await storageGet([STORAGE_KEY]);
    const pending = stored[STORAGE_KEY];

    if (
      !pending?.enabled ||
      !Array.isArray(pending.products) ||
      Date.now() - Number(pending.createdAt || 0) > MAX_PENDING_AGE_MS
    ) {
      return;
    }

    const samples = [...document.querySelectorAll(".print_sample")];
    if (!samples.length) return;

    const lookup = buildLookup(pending.products);
    let added = 0;

    for (const sample of samples) {
      const url = findProductUrl(sample, pending, lookup);
      if (url && addQrToSample(sample, url)) added += 1;
    }

    showPrintNotice(added, samples.length);
  }

  if (isProductListPage()) {
    watchProductList();
  } else if (isBarcodePage()) {
    void decorateBarcodePage();
  }
})();
