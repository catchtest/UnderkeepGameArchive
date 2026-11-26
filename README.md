# Underkeep遊戲圖鑑

《Underkeep》的繁體中文攻略與圖鑑，收錄互動地圖、任務流程與遊戲資料。

[Underkeep遊戲圖鑑](https://catchtest.github.io/UnderkeepGameArchive/)

## 網站內容

- **互動地圖**　查找地城出入口、敵人、事件、戰利品與商店。點謎題虛線框內的空白處可看目標與解法，也可在圖層選單關閉謎題提示。
- **任務與結局攻略**　整理任務的接取條件、進行流程與回報獎勵，列出四個主線結局及觸發條件。
- **角色與敵人圖鑑**　查閱種族、職業、技能、特性、狀態效果與敵人資料。
- **物品、合成與商店**　查找裝備條件、道具來源、配方材料與各商店的商品。

## 本機預覽

使用 Node.js 22 以上版本執行以下指令，再開啟 `http://localhost:8000/`。GitHub Pages 使用同一個建置指令產出 `dist/`。

```sh
node tools/build.mjs
python -m http.server --directory dist 8000
```

## 維護詞條

繁體中文詞條位於 `locales/zh-TW/`。`src/` 的網站介面、圖鑑資料、地圖與 SVG 流程圖透過 `{{t:詞條鍵}}` 共用文字。修改時以既有鍵搜尋使用位置，例如 `common.loot` 同時供地圖資料與地圖介面使用。

預設建置 `zh-TW`。新增語系時，建立對應的 `locales/<語系>/`，沿用同一組詞條鍵，以 `node tools/build.mjs <語系>` 產出網站。

詞條預設依檔案類型跳脫。`|attr` 用於雙引號 HTML／SVG 屬性，`|sq` 用於單引號 JavaScript 字串，`|key` 與 `|member` 用於物件鍵和屬性存取，`|re` 用於正規表示式的文字，`|pattern` 用於正規表示式語法。

翻譯地圖資料時，若文字字數或順序有變，請同步檢查 `itemLinks` 與 `titleLinks` 的字元索引，以及對話選項的 `choiceXp` 對照。流程圖採固定排版，新增語系時也要檢查文字是否超出圖框。

遊戲資料、美術與文字的著作權屬原權利人。
