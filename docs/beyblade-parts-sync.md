# BEYBLADE X 零件資料同步

資料來源為 [beyblade.phstudy.org](https://beyblade.phstudy.org/) 的公開資料：

- `data/main.json`
- `data/hardcoded.json`
- `data/part_code_names.json`

同步規則刻意與來源網站的 TAKARA TOMY 分類數量一致：合併 `main.json` 和
`hardcoded.json`、只保留 `collection_visible` 的項目、略過網站不顯示的 `R`
結尾影像替代列，並按 `package_id` 保留每個商品版本。

因此同一功能零件的不同配色、再版或不同商品套裝不會合併。每筆資料會保存：

- 來源零件 ID（`source_part_id`）
- 功能代碼（`functional_code`）
- 商品識別（`package_id`）
- 套裝編號（`set_id`）
- 配色（`color`）
- 品牌來源（`brand_source`）

## 指令

```bash
npm run parts:check
npm run parts:update
npm run parts:database
```

- `parts:check`：下載最新來源並與版控中的快照比較。
- `parts:update`：來源有變動時更新快照並產生新的 PostgreSQL migration。
- `parts:database`：使用 `DATABASE_URL` 比對資料庫與最新來源；不會修改資料庫。

本機資料也可透過 `--main-file`、`--hardcoded-file` 與 `--names-file` 傳入，方便測試與重現。

## 目前基準數量

| 類別     | 獨立版本數 |
| -------- | ---------: |
| 系列     |        283 |
| 鋼鐵戰刃 |        284 |
| 固鎖輪盤 |        272 |
| 軸心     |        294 |
| 紋章鎖   |         58 |
| 主要戰刃 |         56 |
| 超越戰刃 |         16 |
| 金屬戰刃 |         15 |
| 輔助戰刃 |         58 |
| 零件合計 |      1,053 |
| 全部合計 |      1,336 |

數量不應硬編碼在同步程式中；上表只是目前來源版本的驗收基準。

## 套用 migration

同步程式只產生 migration，不會自行修改 Railway 正式資料庫。部署前先備份並檢查
migration，再依專案既有部署流程套用。283 筆完整陀螺／商品組合會存入獨立的
`beyblade_series` 表；舊版按功能合併的零件會改為 inactive，保留其資料列以避免破壞
既有牌組的外鍵；新的 1,053 筆零件商品版本則會成為可選項目。
