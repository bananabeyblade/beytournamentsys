## 目標
把 `/admin` 精簡成純登入畫面：只有「帳號 + 密碼 + 登入」。

## 現況
`/admin` 使用 `AdminAuthPanel`，除了登入表單外還包含：
- `FirstTimeSetup`（首次建立總管理者精靈）
- 登入後顯示帳號資訊、登出按鈕與 `AccountSettings`（帳號管理）

## 實作內容

### 修改 `src/components/AdminAuthPanel.tsx`
- 移除 `FirstTimeSetup` 與 `AccountSettings` 的渲染與 import
- 未登入：只顯示「管理者登入 ADMIN LOGIN」卡片（帳號、密碼、錯誤訊息、登入按鈕）
- 已登入：不再顯示帳號管理面板，僅保留一行「已登入：帳號」與登出按鈕（帳號管理改由首頁 `/` 設定頁籤處理）

### `src/routes/admin.tsx`
維持不變：標題、SEO、登入後的「進入賽事系統」連結照舊。

### 不更動
`src/components/SettingsTab.tsx` 仍保留完整功能（角色切換、首次設定精靈、帳號管理、QR code、賽事設定、過往賽事）。

## 注意事項
首次設定精靈只會存在於首頁設定頁籤。若尚未建立任何總管理者，需從 `/` 的「設定」完成首次設定，`/admin` 無法建立帳號。若希望 `/admin` 也保留首次設定，請告知我保留它。