# 移除「角色切換」功能影響評估

## 目前功能在做什麼

「角色切換 ROLE」讓已登入的管理者可以在「管理者」與「參賽者」兩種檢視模式間切換：

- 出現位置：
  1. `AppShell` 頂部右上角按鈕（總管理者已隱藏）
  2. `SettingsTab` 設定頁中的「角色切換 ROLE」區塊
- 狀態：`role` = `"admin" | "player"`
- 切換邏輯：
  - 登入後 `syncRole()` 會自動把 `role` 設成 `"admin"`
  - 管理者可手動切回 `"player"` 以預覽參賽者視角
  - 未登入或掃 QR Code 進入 `/watch` 的使用者固定為 `"player"` / `spectator=true`

## 移除後的影響

### 不會壞掉的部分

1. **權限控管仍然安全**：能否新增/刪除選手、產生賽程、輸入比分，最終由 `currentAdmin` 與雲端 `admin_roles` / RLS 決定，不是只靠 `role` 字串。
2. **QR Code 觀眾流程不受影響**：`/watch/:code` 使用 `spectatorCode` 強制進入唯讀 spectator 模式，與 `role` 切換無關。
3. **總管理者體驗不變**：總管理者本來就不會在頂部看到切換按鈕。

### 會改變的部分

1. **一般管理者無法預覽參賽者畫面**：移除後，只要登入就是管理者視角，無法一鍵切換看見選手/觀眾看到的簡化介面。
2. **頂部按鈕與設定頁區塊消失**：`AppShell` 與 `SettingsTab` 會更簡潔。
3. **`role` 狀態可改為衍生值**：不再需要 `setRole`，`role` 可直接由 `currentAdmin` 與 `spectator` 決定：
   - `spectator === true` → `"player"`
   - `currentAdmin != null` → `"admin"`
   - 否則 → `"player"`
4. **部分 UI 條件判斷簡化**：`role === "admin"` 可改為 `!!currentAdmin && !spectator`。

### 潛在風險

- 若未來希望管理者「以參賽者身分查看自己的對戰」，此功能會被移除，需要另開 `/watch/:code` 或新增其他預覽入口。
- 若直接刪除 `setRole` 但沒有把 `role` 改為衍生值，可能導致登入後 `role` 停留在 `"player"`，管理者看不到管理功能。

## 建議做法

1. 將 `role` 從 `useState` 改為由 `currentAdmin` / `spectator` 衍生的 `useMemo`。
2. 移除 `setRole` 與 `SettingsTab` 的「角色切換 ROLE」區塊。
3. 移除 `AppShell` 頂部右上角的角色切換按鈕（保留「我是管理者 / 裁判」登入入口給未登入者）。
4. 更新所有 `role === "admin"` 判斷，改用 `!!currentAdmin && !spectator` 或保留 `role` 衍生值。
5. 驗證：登入管理者後應直接進入管理視角；未登入者仍看到掃碼提示與管理者登入按鈕；QR Code 觀眾仍為唯讀。
