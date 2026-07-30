## 目標
把 `/admin` 頁面簡化為「管理者登入 + 帳號管理」專用入口，移除參賽者相關與賽事操作功能，讓登入流程更清楚。

## 現況
`/admin` 目前直接渲染 `SettingsTab`，裡面同時包含：
- 角色切換（參賽者 / 管理者）
- 管理者登入表單
- 帳號設定（AccountSettings）
- 報名 QR code（QrRegisterCard）
- 管理者登入 QR code（AdminLoginQrCard）
- 過往賽事（TournamentHistory）
- 賽事設定（桌數、產生賽程、重置）

這些功能在首頁 `/` 的「設定」頁籤都已經存在，不需要在登入頁重複出現。

## 實作內容

### 1. 新增 `src/components/AdminAuthPanel.tsx`
只在 `/admin` 使用，內容僅限：
- `FirstTimeSetup`：首次建立總管理者（無 superadmin 時才出現）
- 未登入時：管理者登入表單（帳號 / 密碼 / 錯誤提示 / 登入按鈕）
- 已登入時：
  - 顯示目前帳號與「登出」按鈕
  - 渲染 `AccountSettings`（我的帳號、管理者帳號管理、總管理者帳號管理）

不顯示角色切換、報名 QR code、管理者登入 QR code、過往賽事、賽事設定。

### 2. 修改 `src/routes/admin.tsx`
- 將 `<SettingsTab />` 替換為 `<AdminAuthPanel />`
- 保留「進入賽事系統」連結（已登入時顯示）
- 保留頁面標題與 SEO meta

### 3. 不更動 `src/components/SettingsTab.tsx`
首頁 `/` 的設定頁籤維持現狀，繼續提供完整的角色切換、QR code、賽事設定與過往賽事功能。

## 預期結果
- `/admin` 只會看到登入 / 首次設定 / 帳號管理
- 已登入管理者點「進入賽事系統」後才會看到賽事操作功能
- 參賽者不會在登入頁看到任何與報名或角色切換相關的 UI