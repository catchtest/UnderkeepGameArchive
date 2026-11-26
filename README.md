# Underkeep遊戲圖鑑

《Underkeep》的多語攻略與圖鑑，收錄互動地圖、任務流程與遊戲資料。頁尾可切換繁體中文、简体中文、Čeština、Deutsch、English、Español、Français、Polski 與 Русский。

[Underkeep遊戲圖鑑](https://catchtest.github.io/UnderkeepGameArchive/)

## 網站內容

- **互動地圖**　查找地城出入口、敵人、事件、戰利品與商店。點謎題虛線框內的空白處可看目標與解法，也可在圖層選單關閉謎題提示。
- **任務與結局攻略**　整理任務的接取條件、進行流程與回報獎勵，列出四個主線結局及觸發條件。
- **角色與敵人圖鑑**　查閱種族、職業、技能、特性、狀態效果與敵人資料。
- **物品、合成與商店**　查找裝備條件、道具來源、配方材料與各商店的商品。

## 本機預覽

使用 Node.js 22 以上版本執行以下指令，再開啟 `http://localhost:8000/`。建置會將所有已提供的語系輸出到 `dist/`。

```sh
node tools/build.mjs
python -m http.server --directory dist 8000
```

GitHub Pages 發布前也會拆分圖鑑字型並壓縮 CSS 與 JavaScript。本機若要驗證分檔字型，可在建置後安裝 `tools/font-requirements.txt` 並執行 `python tools/split_fonts.py`。`tools/guide-font-common.txt` 收錄常見標題字元，其餘字元由瀏覽器依內容載入。

## 維護詞條

各語系詞條位於 `locales/<語系>/`。網站採用遊戲 1.0.6 的語系資料，攻略解說與介面另行翻譯。`src/` 的網站介面、圖鑑資料、地圖與 SVG 流程圖透過 `{{t:詞條鍵}}` 共用文字。修改時以既有鍵搜尋使用位置，例如 `common.loot` 同時供地圖資料與地圖介面使用。

各語系可從 `/<語系>/` 或 `/<語系>/index.html` 直接開啟，例如 `/zh-TW/index.html`、`/zh-CN/` 和 `/cs/`。也可在連結加上 `?lang=zh-CN`；已有查詢參數時使用 `&lang=zh-CN`。舊版 `/languages/<語系>/` 連結會轉往新網址，保留圖鑑詞條或地圖標記。

根目錄預設顯示繁體中文，可用 `node tools/build.mjs --default-locale=en` 指定英文。新增語系時，在 `locales/<語系>/` 填妥相同的詞條鍵，並以 `site.language-name` 設定選單名稱。首頁、圖鑑與攻略共用頁尾，左下角的語系選單會保留目前頁面與詞條位置。

詞條預設依檔案類型跳脫。`|attr` 用於雙引號 HTML／SVG 屬性，`|sq` 用於單引號 JavaScript 字串，`|key` 與 `|member` 用於物件鍵和屬性存取，`|re` 用於正規表示式的文字，`|pattern` 用於正規表示式語法。

地圖上整個物品名都可點擊時，`|length` 會計算譯名的 JavaScript 字串長度。含多個連結的文字使用同語系的 `|json` 索引，範例見狼穴寶箱。修改這類文字時，請一併更新索引。對話選項可附帶經驗值獎勵，條件選項的獎勵依顯示列順序排列。各流程圖的 `.width` 詞條控制圖框的橫向空間，修改標籤後可在攻略頁勾選原尺寸檢查。

遊戲資料、美術與文字的著作權屬原權利人。
