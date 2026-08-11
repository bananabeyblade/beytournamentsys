# Beyblade Tournament System

行動優先的 Beyblade X 賽事管理系統。正式環境部署於 Railway，使用 Railway PostgreSQL、Google OAuth 與 Cloudflare 網域。

- 正式網址：<https://beyblade-tournament.com>
- 資料庫健康檢查：<https://beyblade-tournament.com/health/database>

## 本機開發

需求：Bun 1.3.14、Node.js 22。

```bash
bun install --frozen-lockfile
copy .env.example .env
bun run db:migrate
bun run dev
```

請在 `.env` 填入實際值；不得把 `.env`、資料庫密碼、OAuth secret 或加密金鑰提交至 Git。

## 必要環境變數

| 變數                            | 用途                                                    |
| ------------------------------- | ------------------------------------------------------- |
| `APP_URL`                       | 正式網站 origin，例如 `https://beyblade-tournament.com` |
| `DATABASE_URL`                  | Railway PostgreSQL 連線字串                             |
| `GOOGLE_CLIENT_ID`              | Google OAuth Web Client ID                              |
| `GOOGLE_CLIENT_SECRET`          | Google OAuth Client secret                              |
| `ADMIN_PASSWORD_ENCRYPTION_KEY` | 管理者密碼可逆加密金鑰，需妥善保管及定期輪替            |
| `MAX_TOURNAMENT_REGISTRATIONS`  | 單一賽事報名上限，預設 128                              |
| `DATABASE_POOL_MAX`             | 每個應用實例的連線池上限，預設 5                        |
| `VITE_RAILWAY_AUTH_ENABLED`     | Railway 驗證開關，正式環境設為 `true`                   |

## 驗證與部署

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

推送至 `main` 後，Railway 會建置並執行 `scripts/migrate-postgres.mjs`。Migration 使用 PostgreSQL advisory lock，避免多個 replica 同時套用結構變更。部署後應確認：

1. Railway deployment 為 Active。
2. `/health/database` 回傳 `{"ok":true,"database":"postgres","schema":"ready"}`。
3. Google 登入、建立賽事、QR 報名、復原碼登入、產生賽程及比分同步均正常。

## 備份與還原演練

正式比賽前：

1. Railway → PostgreSQL → Backups，確認排程備份已啟用且最近一次成功。
2. 建立手動備份或 snapshot，記錄時間。
3. 確認 Railway 用量與 PostgreSQL 儲存空間仍有餘裕。

至少每月在非正式資料庫做一次還原演練，驗證 migration、管理者登入、賽事、報名與比分資料。不要直接在正式資料庫測試還原。若需使用 `pg_dump`，請從 Railway 取得公開連線 URL，且不要把 URL 貼到聊天、issue 或 log。

## 比賽日操作檢查

- 開賽前：完成備份，使用兩支手機測試 QR 報名與復原碼。
- 產生賽程前：核對參賽人數；產生後名單會鎖定，新增報名會被拒絕。
- 比賽中：觀察 Railway CPU、RAM、Network 與 PostgreSQL connection 指標。
- 異常時：保留畫面、時間、賽事代碼與操作角色，不要反覆重置賽事。
- 賽後：確認冠軍與前四名、匯出結果並再次備份。

## 舊系統相容層

`src/integrations/supabase` 與 `supabase/` 目前僅保留遷移及舊 Lovable 預覽相容用途。正式 Railway 路徑不得依賴 Supabase。確認一段觀察期內沒有回退需求後，才應另開變更移除相容層。
