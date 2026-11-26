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

根目錄預設顯示英文，各語系可由 `/en/`、`/zh-TW/` 等網址直接開啟。建置會檢查各語系用字並複製已分檔的字型。GitHub Pages 發布前會壓縮 CSS 與 JavaScript。

遊戲資料、美術與文字的著作權屬原權利人。
