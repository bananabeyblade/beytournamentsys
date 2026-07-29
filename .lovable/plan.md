## 目標

依現有程式碼實況，產出一份可下載的技術文件（不改動任何 `src/` 應用程式碼），涵蓋 QR 報名、開始比賽、即時同步三大流程的 API 合約與事件時序，另附 Mermaid 時序圖。

## 已核對的實作事實

- 觀眾端輪詢 4 秒；管理者端輪詢 5 秒；管理者發佈 debounce 300ms
- 同步比對鍵 `stampOf(status, live_updated_at)`＝`${status}|${Date.parse(iso)}`（避免 `Z` 與 `+00:00` 造成的無限迴圈），另有 `lastPayload` 序列化比對阻擋 echo
- Realtime：觀眾訂閱 `tournament-<CODE>` 並以 `code=eq.<CODE>` 過濾；管理者訂閱 `admin-tournament-follow`（全表）
- 重連事件 `RECONNECT_EVENT` 觸發重新 pull
- 報名頁為 `/register?t=<CODE>`，開賽後導向 `/watch/$code`

## 文件內容大綱

**1. 角色與資料模型**
- superadmin / admin / spectator（未登入掃碼者）
- `tournaments`、`registrations`、`admin_roles` 欄位與 RLS 政策摘要（誰可 SELECT/INSERT/UPDATE/DELETE）
- DB 函式 `is_any_admin`、`has_admin_role`

**2. API 合約**

Server Functions（`createServerFn`，含 zod 驗證與權限）：

| 函式 | 方法 | 權限 | 輸入 | 輸出 |
|---|---|---|---|---|
| `superadminExistsFn` | GET | 公開 | – | `{ exists }` |
| `bootstrapSuperadminFn` | POST | 已登入且座位未被佔 | – | `{ ok }` |
| `getMyRoleFn` | GET | 已登入 | – | `{ role: superadmin\|admin\|null }` |
| `listAdminsFn` / `createAdminFn` / `setAdminPasswordFn` / `removeAdminFn` | GET/POST | superadmin | zod schema | 清單 / `{ ok }` |
| `nameTakenFn` | POST | 公開 | `{ tournamentId, name }` | `{ taken }` |
| `listRegistrationsFn` | POST | admin+ | `{ tournamentId }` | `[{ id, name, created_at }]` |
| `deleteRegistrationFn` | POST | admin+ | `{ id }` | `{ ok }` |

直接走 Data API（RLS 保護）：`createTournament`、`finishTournament`、`publishLiveState`、`fetchTournamentByCode`、`listTournaments`、`fetchLatestOpenTournament`、`deleteTournament`、`addRegistration`（重複 → `23505` → `DUPLICATE`）。逐項標註角色、對應政策與錯誤訊息。

`live_state` payload 結構：`{ players, matches, tableCount }`。

**3. 事件流程時序**
- QR 報名：superadmin `createTournament` → 產生 6 碼 code → 掃碼進 `/register?t=CODE` → `nameTakenFn` → insert → 寫入 joined name → 等待畫面訂閱 realtime → 有 `live_state` 即導向 `/watch/CODE`
- 開始比賽：管理者 `listRegistrationsFn` 審核 → 加入選手 → 設定桌數 → `generateBracket` → 300ms 後 `publishLiveState` → 其他端 pull/realtime 套用 → 自動跳到「對戰」頁籤
- 即時同步：三層機制（Realtime → 輪詢 → 重連事件），加上時間戳與 payload 雙重去重
- 結束／強制結束：所有 match 設 done → `finishTournament` 寫 top4 → 報名 QR 停用 → `/results/$code`

**4. 錯誤與邊界情境**
離線重連、時間戳落後不覆寫、切換賽事時清空舊資料、未發佈狀態不誤推、賽事非 open 時報名被 RLS 拒、名稱重複、未授權 401。

## 交付

- `/mnt/documents/API_CONTRACT.md`
- `/mnt/documents/event-flow.mmd`（時序圖）

不修改 `src/` 任何檔案。
