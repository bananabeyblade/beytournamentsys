## 目標

依現有程式碼實況，產出一份可下載的技術文件 `API_CONTRACT.md`（放在文件區，不改動任何應用程式碼），涵蓋 QR 報名、開始比賽、即時同步三大流程的 API 合約與事件時序。另附一張 Mermaid 時序圖。

## 文件內容大綱

**1. 系統角色與資料表**
- 角色：superadmin / admin / spectator（掃碼參賽者，未登入）
- 資料表：`tournaments`、`registrations`、`admin_roles`，含欄位與 RLS 政策摘要（誰能 SELECT/INSERT/UPDATE/DELETE）

**2. API 合約**

Server Functions（TanStack `createServerFn`，含輸入驗證與權限）：

| 函式 | 方法 | 權限 | 輸入 | 輸出 |
|---|---|---|---|---|
| `superadminExistsFn` | GET | 公開 | – | `{ exists }` |
| `bootstrapSuperadminFn` | POST | 已登入且尚無總管理者 | – | `{ ok }` |
| `getMyRoleFn` | GET | 已登入 | – | `{ role: 'superadmin'\|'admin'\|null }` |
| `listAdminsFn` / `createAdminFn` / `setAdminPasswordFn` / `removeAdminFn` | GET/POST | superadmin | 見 zod schema | 清單 / `{ ok }` |
| `nameTakenFn` | POST | 公開 | `{ tournamentId, name }` | `{ taken }`（不外洩報名資料） |
| `listRegistrationsFn` | POST | admin+ | `{ tournamentId }` | `[{ id, name, created_at }]` |
| `deleteRegistrationFn` | POST | admin+ | `{ id }` | `{ ok }` |

直接走 Data API（RLS 保護）的操作：`createTournament`、`finishTournament`、`publishLiveState`、`fetchTournamentByCode`、`listTournaments`、`fetchLatestOpenTournament`、`deleteTournament`、`addRegistration`。每項標註角色、SQL 政策依據與錯誤碼（例如重複報名 `23505` → `DUPLICATE`）。

**3. 事件流程（逐步時序）**
- QR 報名：建立賽事 → 產生 `code` → 掃碼進 `/register/?code` → `nameTakenFn` 檢查 → `insert registrations` → 寫入本機 joined name → 等待開賽
- 開始比賽：管理者審核報名 → 加入選手 → superadmin 設定桌數 → `generateBracket` → `publishLiveState` → 各端偵測到 `live_state` 後自動跳轉
- 即時同步：`live_updated_at` 時間戳 + 複合鍵 `${status}|${live_updated_at}` 比對；Realtime `postgres_changes` 訂閱 `tournaments` 並以 `code=eq.<CODE>` 過濾；4 秒輪詢作為後備；300ms debounce 發佈；斷線橫幅與自動重連
- 結束／強制結束：全部 match 設為 done → `finishTournament` 寫入 top4 → 報名 QR 停用 → `/results/$code`

**4. 錯誤與邊界情境**
逾時、離線重連、時間戳落後不覆寫、賽事已結束時報名被 RLS 拒絕、重複名稱、非授權呼叫回 401。

## 交付方式

- `/mnt/documents/API_CONTRACT.md`（可預覽下載）
- `/mnt/documents/event-flow.mmd` 時序圖

不修改 `src/` 任何檔案。
