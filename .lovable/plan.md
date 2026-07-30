## 目標
首頁「賽事管理／設定」頁面在未登入時，也只顯示「管理者登入 ADMIN LOGIN」卡片（帳號、密碼、登入），不再出現角色切換等其他區塊。

## 現況
`src/components/SettingsTab.tsx` 未登入時會渲染：
- 角色切換 ROLE（參賽者／管理者，管理者為 disabled）
- FirstTimeSetup（僅在雲端尚無總管理者時出現）
- 管理者登入表單
- AccountSettings（未登入時本身不顯示內容）

## 實作內容

### 修改 `src/components/SettingsTab.tsx`
未登入（`!currentAdmin`）時提早 return，只輸出：
- `FirstTimeSetup`（保留，否則首次無法建立總管理者；系統已建立後會自動隱藏）
- 管理者登入卡片（帳號 / 密碼 / 錯誤訊息 / 登入按鈕 / 說明文字）

已登入時維持現有完整內容：角色切換、已登入資訊與登出、AccountSettings、報名 QR code、管理者登入 QR code、過往賽事、賽事設定。

### 不更動
`src/components/AdminAuthPanel.tsx`（`/admin` 純登入畫面）與其他元件邏輯。

## 預期結果
未登入者在此頁只會看到登入表單，看不到角色切換或任何賽事／報名資訊；登入後才展開管理功能。