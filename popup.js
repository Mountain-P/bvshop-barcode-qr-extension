"use strict";

chrome.storage.local.get(["bvshopQrPending"], ({ bvshopQrPending }) => {
  const status = document.querySelector("#status");
  if (!status || !bvshopQrPending) return;

  const products = Array.isArray(bvshopQrPending.products)
    ? bvshopQrPending.products
    : [];
  const mapped = products.filter((product) => product.url).length;
  const ageMinutes = Math.max(
    0,
    Math.floor((Date.now() - Number(bvshopQrPending.createdAt || 0)) / 60000),
  );

  status.className = "status ok";
  status.textContent = bvshopQrPending.enabled
    ? `已啟用。最近一次找到 ${mapped}/${products.length} 個商品網址（${ageMinutes} 分鐘前）。`
    : "目前未啟用 QR Code；可在 BVSHOP 的列印條碼視窗重新勾選。";
});

document.querySelector("#open-designer")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_DESIGNER" });
  window.close();
});
