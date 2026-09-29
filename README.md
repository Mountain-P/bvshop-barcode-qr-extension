# BVSHOP 條碼＋商品 QR Code

在 BVSHOP 原有的商品條碼旁，自動加入對應的商品網站 QR Code。

這是一個輕量的 Chrome Extension，會保留 BVSHOP 原本的多規格、列印張數、條碼樣式與標籤尺寸設定。QR Code 全程在瀏覽器本機產生，不會把商品資料傳送給第三方服務。

## 主要功能

- 在 BVSHOP「列印條碼」視窗加入「商品 QR Code」選項
- 自動取得商品卡上的「商品頁面」網址
- 將商品 QR Code 排在原條碼右側
- 支援單一商品、多規格商品與批量列印
- 支援 BVSHOP 原有的 40×30mm、40×25mm、Brother 42×29mm 選項
- 取消勾選後，保留 BVSHOP 原始列印版面

## 下載

請到 [Releases](https://github.com/Mountain-P/bvshop-barcode-qr-extension/releases/latest) 下載最新版 `bvshop-barcode-qr-extension.zip`。

## 快速安裝

1. 解壓縮下載的 ZIP。
2. 在 Chrome 網址列輸入 `chrome://extensions/`。
3. 開啟右上角的「開發人員模式」。
4. 點「載入未封裝項目」。
5. 選擇解壓縮後的 `bvshop-barcode-qr-extension` 資料夾。

完整步驟與疑難排解請看：[安裝教學.md](安裝教學.md)

## 使用方式

1. 開啟 BVSHOP 後台的「商品列表」。
2. 點商品的「列印條碼」。
3. 保持「在條碼右側加入商品頁 QR Code」勾選。
4. 照常選擇標籤尺寸、樣式及列印數量，再點「列印」。
5. 新開的列印頁會提示已加入 QR Code；確認預覽後，再按頁面上的「列印」。

若不想印 QR Code，在 BVSHOP 的列印條碼視窗取消勾選即可。

## 第一次正式列印前

不同條碼機的可列印邊界與縮放設定不同，建議先印一張測試標籤：

- Chrome 列印縮放設為 `100%`
- 邊界選擇「無」或印表機預設
- 紙張尺寸與 BVSHOP 選擇的標籤尺寸一致
- 用手機測試 QR Code
- 用條碼掃描器測試原條碼

## 隱私與權限

擴充套件只在 `https://bvshop-manage.bvshop.tw/` 執行。它會讀取當前商品列表上的公開商品網址，並暫存在 Chrome 本機儲存空間最多 15 分鐘，供新開的列印頁使用。

擴充套件不會：

- 讀取或保存 BVSHOP 帳號密碼
- 呼叫第三方 QR Code API
- 將商品資料傳送到外部伺服器
- 自動送出訂單或修改商品資料

## 已知限制

- BVSHOP 若大幅修改商品列表或條碼列印頁的 HTML 結構，擴充套件可能需要更新。
- 若列印頁提示只有部分標籤加入 QR Code，請回到商品列表重新開啟「列印條碼」，並確認商品卡上存在「商品頁面」連結。

## 專案內容

- `manifest.json`：Chrome Manifest V3 設定
- `content.js`：商品網址配對與 QR Code 列印邏輯
- `styles.css`：BVSHOP 視窗與標籤列印樣式
- `popup.html`／`popup.js`：擴充套件狀態說明
- `vendor/qrcode-generator.js`：本機 QR Code 產生器

## 第三方元件

本專案包含 `qrcode-generator` 1.4.4（Kazuhiko Arase，MIT License）。完整授權資訊請見 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)。

## 版本

- 1.0.0 — 首次公開版本
