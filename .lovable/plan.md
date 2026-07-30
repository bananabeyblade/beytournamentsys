## 目標

新增／重設「管理者」（自訂帳號，非總管理者）密碼時，最少只需 4 碼，且不套用強度／外洩檢查。總管理者仍維持較嚴格的規則（最少 8 碼）。

## 背景限制

雲端登入服務本身有全域最低密碼長度限制（最低只能設到 6 碼），無法針對單一帳號類型放寬到 4 碼。因此做法是：

1. 專案層級的密碼設定調到最寬鬆（最低長度 6、關閉「常見／外洩密碼」封鎖）。
2. 對「自訂帳號管理者」在伺服器端把使用者輸入的密碼加上一段固定的內部後綴（pepper）後才送去建立／驗證，讓 4 碼輸入仍能通過底層長度檢查。使用者感受到的就是自己設定的 4 碼密碼。

## 變更內容

**新增 `src/lib/admin-password.ts`**
- `PEPPER` 常數與 `padAdminPassword(pw)`：回傳 `pw + PEPPER`。
- `isUsernameAccount(account)`：判斷是否為自訂帳號（不含 `@`，或結尾為內部網域）。

**`src/lib/admin.functions.ts`**
- `createAdminFn`、`setAdminPasswordFn` 的 zod 規則由 `min(8)` 改為 `min(4)`，並在呼叫建立／更新密碼前套用 `padAdminPassword`。
- `createSuperadminFn` 保持 `min(8)`、不加 pepper。
- `setAdminPasswordFn` 也改為回傳 `{ ok, message }` 形式，錯誤時顯示中文提示而非拋錯（與 createAdminFn 一致）。

**`src/lib/tournament-store.tsx`（登入）**
- 自訂帳號登入時先用「加後綴」的密碼嘗試，失敗再用原始密碼重試一次，讓舊有管理者帳號仍能登入（相容過渡）。
- 總管理者（email 登入）流程不變。

**`src/components/AccountSettings.tsx`**
- 管理者新增／重設密碼欄位的提示與前端驗證改為「至少 4 碼」；總管理者區塊仍顯示「至少 8 碼」。

**後端設定**
- 將密碼最低長度設為 6、關閉外洩密碼封鎖（配合上述 pepper 機制）。

## 注意

- 4 碼密碼安全性較低，僅適用於現場裁判帳號；建議搭配賽後刪除或定期更換。
- 舊管理者帳號密碼不需重設即可繼續登入；下次由總管理者重設後會自動改用新機制。
