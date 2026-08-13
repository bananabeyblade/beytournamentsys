# BEYBLADE X 零件資料更新

專案以 [BEYBLADE X 戰鬥陀螺瀏覽器](https://beyblade.phstudy.org/) 的 `main.json` 與
`part_code_names.json` 為零件來源，並把同一零件的配色、再版與商品套裝記錄合併為一個功能零件。

## 日常更新

```bash
# 只比對網站與專案快照，不寫入檔案
npm run parts:check

# 網站資料有變動時，更新快照並產生新的 PostgreSQL migration
npm run parts:update

# 比對目前 DATABASE_URL 的資料，不會寫入資料庫
npm run parts:database
```

`parts:update` 只會在來源資料變動時產生 migration，避免重複建立無內容變更的檔案。
產生後先檢查 Git diff，再由人工決定是否執行 `npm run db:migrate`。

## 數量定義

- **來源總列數**：包含不同配色、再版與套裝的原始列數。
- **排除異常列數**：空白、未公開的方塊占位符，或放在錯誤分類的活動贈品。
- **功能零件數**：按來源 `group_id` 去重後，實際提供給使用者選擇的數量。

## 離線重現

除了即時下載，也可以用已儲存的 JSON 重現同一次更新：

```bash
node scripts/sync-beyblade-parts.mjs --write --main-file path/to/main.json --names-file path/to/part_code_names.json
```

每次更新的標準化結果會儲存在
`database/data/beyblade-x-parts.json`，可供 code review、回溯與數量比對。
