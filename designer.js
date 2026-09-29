(() => {
  "use strict";

  const PENDING_KEY = "bvshopQrPending";
  const TEMPLATES_KEY = "bvshopDesignerTemplates";
  const ACTIVE_TEMPLATE_KEY = "bvshopDesignerActiveTemplateId";
  const SCALE = 10;
  const SNAP = 0.5;

  const FIELD_LABELS = {
    title: "商品名稱",
    variant: "規格名稱",
    price: "售價",
    specialPrice: "特價",
    barcode: "商品條碼",
    qr: "商品 QR Code",
    custom: "自訂文字",
  };

  const DEMO_ITEM = {
    key: "demo",
    productId: "demo",
    title: "商品名稱範例",
    variant: "規格名稱",
    barcode: "123456789012",
    price: "1,280",
    specialPrice: "990",
    stock: "10",
    url: "https://example.com/item/demo",
    printQty: 1,
  };

  const DEFAULT_ELEMENTS = [
    {
      id: "title",
      type: "text",
      field: "title",
      x: 2,
      y: 2,
      w: 26,
      h: 5,
      visible: true,
      fontFamily: "Microsoft JhengHei",
      fontSize: 9,
      fontWeight: "700",
      align: "left",
    },
    {
      id: "variant",
      type: "text",
      field: "variant",
      x: 2,
      y: 7,
      w: 26,
      h: 4,
      visible: true,
      fontFamily: "Microsoft JhengHei",
      fontSize: 7,
      fontWeight: "400",
      align: "left",
    },
    {
      id: "price",
      type: "text",
      field: "price",
      x: 2,
      y: 11,
      w: 13,
      h: 4,
      visible: true,
      fontFamily: "Microsoft JhengHei",
      fontSize: 7,
      fontWeight: "500",
      align: "left",
    },
    {
      id: "specialPrice",
      type: "text",
      field: "specialPrice",
      x: 15,
      y: 11,
      w: 13,
      h: 4,
      visible: true,
      fontFamily: "Microsoft JhengHei",
      fontSize: 7,
      fontWeight: "700",
      align: "right",
    },
    {
      id: "barcode",
      type: "barcode",
      field: "barcode",
      x: 2,
      y: 17,
      w: 26,
      h: 11,
      visible: true,
      fontFamily: "Arial",
      fontSize: 7,
      fontWeight: "400",
      align: "center",
    },
    {
      id: "qr",
      type: "qr",
      field: "qr",
      x: 30,
      y: 18,
      w: 8,
      h: 8,
      visible: true,
      fontFamily: "sans-serif",
      fontSize: 7,
      fontWeight: "400",
      align: "center",
    },
  ];

  const storageGet = (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, resolve));

  const storageSet = (items) =>
    new Promise((resolve) => chrome.storage.local.set(items, resolve));

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const snap = (value) => Math.round(value / SNAP) * SNAP;

  const numberValue = (value, fallback) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const makeId = () =>
    globalThis.crypto?.randomUUID?.() ||
    `template-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function createDefaultTemplate(name = "標準條碼＋QR") {
    return {
      id: makeId(),
      name,
      label: { width: 40, height: 30, preset: "40x30" },
      elements: clone(DEFAULT_ELEMENTS),
      updatedAt: Date.now(),
    };
  }

  let templates = [];
  let currentTemplate = createDefaultTemplate();
  let selectedElementId = "title";
  let items = [];
  let previewIndex = 0;
  let toastTimer = null;

  const dom = {};

  function cacheDom() {
    for (const id of [
      "data-banner",
      "template-select",
      "template-name",
      "new-template",
      "save-template",
      "delete-template",
      "export-template",
      "import-template",
      "label-preset",
      "label-width",
      "label-height",
      "element-list",
      "add-custom-text",
      "preview-item",
      "label-stage",
      "layout-warning",
      "selected-element-name",
      "inspector-empty",
      "inspector",
      "text-controls",
      "custom-text-field",
      "element-x",
      "element-y",
      "element-width",
      "element-height",
      "element-font",
      "element-font-size",
      "element-font-weight",
      "element-align",
      "element-content",
      "move-forward",
      "move-backward",
      "remove-element",
      "reload-data",
      "print-items",
      "total-labels",
      "print-labels",
      "print-area",
      "print-page-style",
      "toast",
    ]) {
      dom[id] = document.getElementById(id);
    }
  }

  function normalizeElement(element, index, label) {
    const type = ["text", "barcode", "qr", "custom"].includes(element?.type)
      ? element.type
      : "text";
    const minimumWidth = type === "barcode" ? 15 : type === "qr" ? 6 : 3;
    const minimumHeight = type === "barcode" ? 6 : type === "qr" ? 6 : 2.5;
    const width = clamp(numberValue(element?.w, minimumWidth), minimumWidth, label.width);
    const height = clamp(numberValue(element?.h, minimumHeight), minimumHeight, label.height);

    return {
      id: String(element?.id || `${type}-${index}-${Date.now()}`),
      type,
      field: String(element?.field || (type === "custom" ? "custom" : type)),
      content: String(element?.content || "自訂文字"),
      x: clamp(numberValue(element?.x, 0), 0, Math.max(0, label.width - width)),
      y: clamp(numberValue(element?.y, 0), 0, Math.max(0, label.height - height)),
      w: width,
      h: height,
      visible: element?.visible !== false,
      fontFamily: String(element?.fontFamily || "Microsoft JhengHei"),
      fontSize: clamp(numberValue(element?.fontSize, 8), 4, 36),
      fontWeight: ["400", "500", "700", "900"].includes(String(element?.fontWeight))
        ? String(element.fontWeight)
        : "400",
      align: ["left", "center", "right"].includes(element?.align)
        ? element.align
        : "left",
    };
  }

  function normalizeTemplate(template) {
    const label = {
      width: clamp(numberValue(template?.label?.width, 40), 20, 100),
      height: clamp(numberValue(template?.label?.height, 30), 15, 100),
      preset: String(template?.label?.preset || "custom"),
    };
    const sourceElements = Array.isArray(template?.elements)
      ? template.elements
      : DEFAULT_ELEMENTS;

    return {
      id: String(template?.id || makeId()),
      name: String(template?.name || "未命名版型").slice(0, 60),
      label,
      elements: sourceElements.map((element, index) =>
        normalizeElement(element, index, label),
      ),
      updatedAt: Number(template?.updatedAt || Date.now()),
    };
  }

  function flattenPending(pending) {
    if (!Array.isArray(pending?.products)) return [];

    return pending.products.flatMap((product) => {
      const variants = Array.isArray(product.variants) && product.variants.length
        ? product.variants
        : (product.barcodes || []).map((barcode) => ({ barcode }));

      return variants.map((variant, index) => ({
        key: `${product.id || "product"}-${variant.barcode || index}`,
        productId: String(product.id || ""),
        title: String(product.title || "商品名稱"),
        variant: String(variant.variant || "單一規格"),
        barcode: String(variant.barcode || ""),
        price: String(variant.price ?? ""),
        specialPrice: String(variant.specialPrice ?? ""),
        stock: String(variant.stock ?? ""),
        url: String(product.url || ""),
        printQty: clamp(Number.parseInt(variant.printQty ?? 1, 10) || 0, 0, 100),
      }));
    });
  }

  async function loadProductData() {
    const stored = await storageGet([PENDING_KEY]);
    items = flattenPending(stored[PENDING_KEY]);
    previewIndex = clamp(previewIndex, 0, Math.max(0, items.length - 1));
    renderProductControls();
    renderStage();
    dom["data-banner"].hidden = items.length > 0;
    dom["print-labels"].disabled = items.length === 0;
    if (items.length) showToast(`已讀取 ${items.length} 個商品規格`);
  }

  async function loadTemplates() {
    const stored = await storageGet([TEMPLATES_KEY, ACTIVE_TEMPLATE_KEY]);
    templates = Array.isArray(stored[TEMPLATES_KEY])
      ? stored[TEMPLATES_KEY].map(normalizeTemplate)
      : [];

    if (!templates.length) templates = [createDefaultTemplate()];

    const active = templates.find(
      (template) => template.id === stored[ACTIVE_TEMPLATE_KEY],
    );
    currentTemplate = clone(active || templates[0]);
    selectedElementId = currentTemplate.elements[0]?.id || null;
    await persistTemplates();
  }

  async function persistTemplates() {
    await storageSet({
      [TEMPLATES_KEY]: templates,
      [ACTIVE_TEMPLATE_KEY]: currentTemplate.id,
    });
  }

  function getPreviewItem() {
    return items[previewIndex] || DEMO_ITEM;
  }

  function getSelectedElement() {
    return currentTemplate.elements.find(
      (element) => element.id === selectedElementId,
    );
  }

  function elementLabel(element) {
    return element.type === "custom"
      ? element.content || FIELD_LABELS.custom
      : FIELD_LABELS[element.field] || FIELD_LABELS[element.type] || element.id;
  }

  function fieldText(item, element) {
    switch (element.field) {
      case "title":
        return item.title || "商品名稱";
      case "variant":
        return item.variant || "單一規格";
      case "price":
        return item.price ? `售價 $${item.price}` : "售價 —";
      case "specialPrice":
        return item.specialPrice ? `特價 $${item.specialPrice}` : "特價 —";
      case "custom":
        return element.content || "自訂文字";
      default:
        return "";
    }
  }

  function createQrMarkup(url) {
    if (!url) return "";
    try {
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      return qr.createSvgTag({
        cellSize: 4,
        margin: 16,
        scalable: true,
        title: "商品頁 QR Code",
        alt: url,
      });
    } catch {
      return "";
    }
  }

  function renderBarcode(container, value) {
    if (!value) {
      container.textContent = "無條碼";
      return;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        displayValue: true,
        margin: 0,
        width: 2,
        height: 44,
        fontSize: 15,
        textMargin: 1,
        background: "#ffffff",
        lineColor: "#000000",
      });
      container.appendChild(svg);
    } catch {
      container.textContent = value;
    }
  }

  function applyTextStyles(node, element, forPrint = false) {
    node.style.fontFamily = element.fontFamily;
    node.style.fontSize = forPrint
      ? `${element.fontSize}pt`
      : `${element.fontSize * (4 / 3)}px`;
    node.style.fontWeight = element.fontWeight;
    node.style.textAlign = element.align;
  }

  function renderElementContent(node, element, item, forPrint = false) {
    if (element.type === "barcode") {
      renderBarcode(node, item.barcode);
      return;
    }

    if (element.type === "qr") {
      const markup = createQrMarkup(item.url);
      if (markup) node.innerHTML = markup;
      else node.textContent = "無商品網址";
      return;
    }

    node.textContent = fieldText(item, element);
    applyTextStyles(node, element, forPrint);
  }

  function setDesignElementBox(node, element) {
    node.style.left = `${element.x * SCALE}px`;
    node.style.top = `${element.y * SCALE}px`;
    node.style.width = `${element.w * SCALE}px`;
    node.style.height = `${element.h * SCALE}px`;
  }

  function renderStage() {
    const stage = dom["label-stage"];
    const item = getPreviewItem();
    stage.replaceChildren();
    stage.style.width = `${currentTemplate.label.width * SCALE}px`;
    stage.style.height = `${currentTemplate.label.height * SCALE}px`;

    currentTemplate.elements.forEach((element, index) => {
      if (!element.visible) return;

      const node = document.createElement("div");
      node.className = `design-element is-${element.type}`;
      node.dataset.elementId = element.id;
      node.style.zIndex = String(index + 1);
      if (element.id === selectedElementId) node.classList.add("is-selected");
      setDesignElementBox(node, element);
      renderElementContent(node, element, item);

      const handle = document.createElement("span");
      handle.className = "resize-handle";
      handle.setAttribute("aria-hidden", "true");
      node.appendChild(handle);
      node.addEventListener("pointerdown", startPointerInteraction);
      stage.appendChild(node);
    });

    renderElementList();
    renderInspector();
    renderWarnings();
  }

  function selectElement(id) {
    selectedElementId = id;
    for (const node of dom["label-stage"].querySelectorAll(".design-element")) {
      node.classList.toggle("is-selected", node.dataset.elementId === id);
    }
    renderElementList();
    renderInspector();
  }

  function minimumSize(element) {
    if (element.type === "barcode") return { w: 15, h: 6 };
    if (element.type === "qr") return { w: 6, h: 6 };
    return { w: 3, h: 2.5 };
  }

  function startPointerInteraction(event) {
    const node = event.currentTarget;
    const element = currentTemplate.elements.find(
      (candidate) => candidate.id === node.dataset.elementId,
    );
    if (!element) return;

    event.preventDefault();
    selectElement(element.id);

    const mode = event.target.classList.contains("resize-handle") ? "resize" : "drag";
    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: element.x,
      y: element.y,
      w: element.w,
      h: element.h,
    };
    const min = minimumSize(element);

    const onMove = (moveEvent) => {
      const dx = (moveEvent.clientX - start.clientX) / SCALE;
      const dy = (moveEvent.clientY - start.clientY) / SCALE;

      if (mode === "drag") {
        element.x = clamp(
          snap(start.x + dx),
          0,
          Math.max(0, currentTemplate.label.width - element.w),
        );
        element.y = clamp(
          snap(start.y + dy),
          0,
          Math.max(0, currentTemplate.label.height - element.h),
        );
      } else {
        element.w = clamp(
          snap(start.w + dx),
          min.w,
          currentTemplate.label.width - element.x,
        );
        element.h = clamp(
          snap(start.h + dy),
          min.h,
          currentTemplate.label.height - element.y,
        );
      }

      setDesignElementBox(node, element);
      renderInspector();
      renderWarnings();
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      renderStage();
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  }

  function renderElementList() {
    const list = dom["element-list"];
    list.replaceChildren();

    for (const element of currentTemplate.elements) {
      const row = document.createElement("div");
      row.className = "element-list-item";
      row.classList.toggle("is-selected", element.id === selectedElementId);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = elementLabel(element);
      button.addEventListener("click", () => selectElement(element.id));

      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = element.visible;
      checkbox.addEventListener("change", () => {
        element.visible = checkbox.checked;
        renderStage();
      });
      label.append(checkbox, "顯示");
      row.append(button, label);
      list.appendChild(row);
    }
  }

  function renderInspector() {
    const element = getSelectedElement();
    dom["inspector-empty"].hidden = Boolean(element);
    dom.inspector.hidden = !element;
    dom["selected-element-name"].textContent = element ? elementLabel(element) : "未選取";
    if (!element) return;

    dom["element-x"].value = element.x;
    dom["element-y"].value = element.y;
    dom["element-width"].value = element.w;
    dom["element-height"].value = element.h;
    dom["element-font"].value = element.fontFamily;
    dom["element-font-size"].value = element.fontSize;
    dom["element-font-weight"].value = element.fontWeight;
    dom["element-align"].value = element.align;
    dom["element-content"].value = element.content || "";

    const isText = element.type === "text" || element.type === "custom";
    dom["text-controls"].hidden = !isText;
    dom["custom-text-field"].hidden = element.type !== "custom";
    dom["remove-element"].hidden = element.type !== "custom";
  }

  function renderWarnings() {
    const warnings = [];
    const barcode = currentTemplate.elements.find(
      (element) => element.type === "barcode" && element.visible,
    );
    const qr = currentTemplate.elements.find(
      (element) => element.type === "qr" && element.visible,
    );
    if (barcode && barcode.w < 20) {
      warnings.push("條碼寬度小於 20mm，部分掃描器可能較難辨識。建議加寬條碼元件。");
    }
    if (qr && (qr.w < 8 || qr.h < 8)) {
      warnings.push("QR Code 小於 8×8mm，建議放大後再列印測試。");
    }
    dom["layout-warning"].hidden = warnings.length === 0;
    dom["layout-warning"].textContent = warnings.join(" ");
  }

  function renderTemplateControls() {
    dom["template-select"].replaceChildren();
    for (const template of templates) {
      const option = document.createElement("option");
      option.value = template.id;
      option.textContent = template.name;
      dom["template-select"].appendChild(option);
    }
    dom["template-select"].value = currentTemplate.id;
    dom["template-name"].value = currentTemplate.name;
    dom["label-preset"].value = ["40x30", "40x25", "42x29"].includes(
      currentTemplate.label.preset,
    )
      ? currentTemplate.label.preset
      : "custom";
    dom["label-width"].value = currentTemplate.label.width;
    dom["label-height"].value = currentTemplate.label.height;
  }

  function renderProductControls() {
    const previewSelect = dom["preview-item"];
    previewSelect.replaceChildren();
    const source = items.length ? items : [DEMO_ITEM];

    source.forEach((item, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${item.title}｜${item.variant}`;
      previewSelect.appendChild(option);
    });
    previewSelect.value = String(previewIndex);

    const list = dom["print-items"];
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "尚未讀取商品資料。";
      list.appendChild(empty);
      updateTotalLabels();
      return;
    }

    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "print-item";

      const title = document.createElement("div");
      title.className = "print-item-title";
      title.textContent = item.title;

      const meta = document.createElement("div");
      meta.className = "print-item-meta";
      meta.textContent = `${item.variant} · ${item.barcode || "無條碼"}`;

      const quantity = document.createElement("label");
      quantity.className = "print-item-quantity";
      quantity.append("列印數量");

      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "100";
      input.value = String(item.printQty);
      input.addEventListener("input", () => {
        item.printQty = clamp(Number.parseInt(input.value || "0", 10) || 0, 0, 100);
        input.value = String(item.printQty);
        updateTotalLabels();
      });
      input.addEventListener("focus", () => {
        previewIndex = index;
        dom["preview-item"].value = String(index);
        renderStage();
      });

      quantity.appendChild(input);
      row.append(title, meta, quantity);
      list.appendChild(row);
    });
    updateTotalLabels();
  }

  function updateTotalLabels() {
    const total = items.reduce((sum, item) => sum + item.printQty, 0);
    dom["total-labels"].textContent = String(total);
  }

  function adjustElementsToLabel() {
    for (const element of currentTemplate.elements) {
      const min = minimumSize(element);
      element.w = clamp(element.w, min.w, currentTemplate.label.width);
      element.h = clamp(element.h, min.h, currentTemplate.label.height);
      element.x = clamp(element.x, 0, Math.max(0, currentTemplate.label.width - element.w));
      element.y = clamp(element.y, 0, Math.max(0, currentTemplate.label.height - element.h));
    }
  }

  function updateSelectedNumeric(property, value) {
    const element = getSelectedElement();
    if (!element) return;
    const min = minimumSize(element);
    const limits = {
      x: [0, Math.max(0, currentTemplate.label.width - element.w)],
      y: [0, Math.max(0, currentTemplate.label.height - element.h)],
      w: [min.w, currentTemplate.label.width - element.x],
      h: [min.h, currentTemplate.label.height - element.y],
    };
    element[property] = clamp(numberValue(value, element[property]), ...limits[property]);
    renderStage();
  }

  async function saveCurrentTemplate() {
    currentTemplate.name = dom["template-name"].value.trim() || "未命名版型";
    currentTemplate.updatedAt = Date.now();
    const index = templates.findIndex((template) => template.id === currentTemplate.id);
    if (index >= 0) templates[index] = clone(currentTemplate);
    else templates.push(clone(currentTemplate));
    await persistTemplates();
    renderTemplateControls();
    showToast("版型已儲存");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      dom.toast.hidden = true;
    }, 2200);
  }

  function addCustomText() {
    const element = normalizeElement(
      {
        id: `custom-${makeId()}`,
        type: "custom",
        field: "custom",
        content: "自訂文字",
        x: 2,
        y: Math.max(2, currentTemplate.label.height - 6),
        w: Math.min(20, currentTemplate.label.width - 4),
        h: 4,
        visible: true,
        fontFamily: "Microsoft JhengHei",
        fontSize: 7,
        fontWeight: "400",
        align: "left",
      },
      currentTemplate.elements.length,
      currentTemplate.label,
    );
    currentTemplate.elements.push(element);
    selectedElementId = element.id;
    renderStage();
  }

  function moveSelected(direction) {
    const index = currentTemplate.elements.findIndex(
      (element) => element.id === selectedElementId,
    );
    const target = index + direction;
    if (index < 0 || target < 0 || target >= currentTemplate.elements.length) return;
    const [element] = currentTemplate.elements.splice(index, 1);
    currentTemplate.elements.splice(target, 0, element);
    renderStage();
  }

  function createPrintElement(element, item) {
    const node = document.createElement("div");
    node.className = `print-element is-${element.type}`;
    node.style.left = `${element.x}mm`;
    node.style.top = `${element.y}mm`;
    node.style.width = `${element.w}mm`;
    node.style.height = `${element.h}mm`;
    renderElementContent(node, element, item, true);
    return node;
  }

  function buildPrintArea() {
    const printArea = dom["print-area"];
    printArea.replaceChildren();
    let total = 0;

    for (const item of items) {
      for (let copyIndex = 0; copyIndex < item.printQty; copyIndex += 1) {
        const label = document.createElement("section");
        label.className = "print-label";
        label.style.width = `${currentTemplate.label.width}mm`;
        label.style.height = `${currentTemplate.label.height}mm`;

        currentTemplate.elements.forEach((element, index) => {
          if (!element.visible) return;
          const node = createPrintElement(element, item);
          node.style.zIndex = String(index + 1);
          label.appendChild(node);
        });
        printArea.appendChild(label);
        total += 1;
      }
    }

    dom["print-page-style"].textContent = `@page { size: ${currentTemplate.label.width}mm ${currentTemplate.label.height}mm; margin: 0; }`;
    return total;
  }

  function printLabels() {
    const total = items.reduce((sum, item) => sum + item.printQty, 0);
    if (!items.length || total === 0) {
      showToast("請先選擇至少一張標籤");
      return;
    }
    if (total > 500 && !window.confirm(`即將產生 ${total} 張標籤，瀏覽器可能需要較長時間。是否繼續？`)) {
      return;
    }

    buildPrintArea();
    window.setTimeout(() => window.print(), 80);
  }

  function exportTemplate() {
    const data = JSON.stringify(normalizeTemplate(currentTemplate), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeName = currentTemplate.name.replace(/[\\/:*?"<>|]+/g, "-") || "bvshop-template";
    anchor.href = url;
    anchor.download = `${safeName}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importTemplate(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const imported = normalizeTemplate({ ...parsed, id: makeId() });
      imported.name = `${imported.name}（匯入）`;
      templates.push(imported);
      currentTemplate = clone(imported);
      selectedElementId = currentTemplate.elements[0]?.id || null;
      await persistTemplates();
      renderAll();
      showToast("版型已匯入");
    } catch {
      showToast("匯入失敗：請確認檔案是有效的版型 JSON");
    } finally {
      dom["import-template"].value = "";
    }
  }

  function renderAll() {
    renderTemplateControls();
    renderProductControls();
    renderStage();
  }

  function bindEvents() {
    dom["template-select"].addEventListener("change", async () => {
      const selected = templates.find(
        (template) => template.id === dom["template-select"].value,
      );
      if (!selected) return;
      currentTemplate = clone(selected);
      selectedElementId = currentTemplate.elements[0]?.id || null;
      await storageSet({ [ACTIVE_TEMPLATE_KEY]: currentTemplate.id });
      renderAll();
    });

    dom["template-name"].addEventListener("input", () => {
      currentTemplate.name = dom["template-name"].value;
    });

    dom["new-template"].addEventListener("click", () => {
      currentTemplate = createDefaultTemplate("新版本型");
      selectedElementId = currentTemplate.elements[0]?.id || null;
      renderAll();
      dom["template-name"].focus();
      dom["template-name"].select();
    });

    dom["save-template"].addEventListener("click", () => void saveCurrentTemplate());

    dom["delete-template"].addEventListener("click", async () => {
      if (!window.confirm(`確定刪除版型「${currentTemplate.name}」？`)) return;
      templates = templates.filter((template) => template.id !== currentTemplate.id);
      if (!templates.length) templates = [createDefaultTemplate()];
      currentTemplate = clone(templates[0]);
      selectedElementId = currentTemplate.elements[0]?.id || null;
      await persistTemplates();
      renderAll();
      showToast("版型已刪除");
    });

    dom["label-preset"].addEventListener("change", () => {
      const preset = dom["label-preset"].value;
      const sizes = {
        "40x30": [40, 30],
        "40x25": [40, 25],
        "42x29": [42, 29],
      };
      currentTemplate.label.preset = preset;
      if (sizes[preset]) {
        [currentTemplate.label.width, currentTemplate.label.height] = sizes[preset];
        adjustElementsToLabel();
        renderAll();
      }
    });

    for (const [id, property] of [
      ["label-width", "width"],
      ["label-height", "height"],
    ]) {
      dom[id].addEventListener("change", () => {
        const min = property === "width" ? 20 : 15;
        currentTemplate.label[property] = clamp(
          numberValue(dom[id].value, currentTemplate.label[property]),
          min,
          100,
        );
        currentTemplate.label.preset = "custom";
        adjustElementsToLabel();
        renderAll();
      });
    }

    dom["preview-item"].addEventListener("change", () => {
      previewIndex = Number.parseInt(dom["preview-item"].value, 10) || 0;
      renderStage();
    });

    dom["add-custom-text"].addEventListener("click", addCustomText);

    for (const [id, property] of [
      ["element-x", "x"],
      ["element-y", "y"],
      ["element-width", "w"],
      ["element-height", "h"],
    ]) {
      dom[id].addEventListener("change", () =>
        updateSelectedNumeric(property, dom[id].value),
      );
    }

    for (const [id, property] of [
      ["element-font", "fontFamily"],
      ["element-font-weight", "fontWeight"],
      ["element-align", "align"],
    ]) {
      dom[id].addEventListener("change", () => {
        const element = getSelectedElement();
        if (!element) return;
        element[property] = dom[id].value;
        renderStage();
      });
    }

    dom["element-font-size"].addEventListener("change", () => {
      const element = getSelectedElement();
      if (!element) return;
      element.fontSize = clamp(
        numberValue(dom["element-font-size"].value, element.fontSize),
        4,
        36,
      );
      renderStage();
    });

    dom["element-content"].addEventListener("input", () => {
      const element = getSelectedElement();
      if (!element || element.type !== "custom") return;
      element.content = dom["element-content"].value;
      renderStage();
    });

    dom["move-forward"].addEventListener("click", () => moveSelected(1));
    dom["move-backward"].addEventListener("click", () => moveSelected(-1));
    dom["remove-element"].addEventListener("click", () => {
      const element = getSelectedElement();
      if (!element || element.type !== "custom") return;
      currentTemplate.elements = currentTemplate.elements.filter(
        (candidate) => candidate.id !== element.id,
      );
      selectedElementId = currentTemplate.elements[0]?.id || null;
      renderStage();
    });

    dom["reload-data"].addEventListener("click", () => void loadProductData());
    dom["print-labels"].addEventListener("click", printLabels);
    dom["export-template"].addEventListener("click", exportTemplate);
    dom["import-template"].addEventListener("change", () => {
      const file = dom["import-template"].files?.[0];
      if (file) void importTemplate(file);
    });
  }

  async function init() {
    cacheDom();
    bindEvents();
    await loadTemplates();
    await loadProductData();
    renderAll();
  }

  void init();
})();
