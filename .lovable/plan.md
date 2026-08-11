# 診斷報告：migration-export 回傳失敗（僅診斷，未做任何修改）

## 結論
這個函式**沒有真的丟出 500**。它有成功啟動、有進入 request handler，並回傳了 `404 {"error":"NOT_FOUND"}`。
函式面板的「Success rate 0%」是把非 2xx（此處為 404）算成失敗；Railway 端的匯入腳本收到非 200 後自己拋錯，才在 Railway 顯示成 500。

## 逐項確認

1. **SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 是否可取得**
   兩者都已存在於此專案的函式環境（平台自動注入，值未顯示）。若缺少，函式會走 `EXPORT_FAILED` 並在 Logs 印出 `Migration export is missing its Supabase service configuration.` — Logs 中沒有這行，代表不是金鑰問題。

2. **是否進入 request handler**
   是。實測以無 Authorization 及錯誤 Bearer 各呼叫一次，都得到 `404 {"error":"NOT_FOUND"}`（21 bytes），這是函式程式碼裡 `denied()` 的輸出，代表 handler 有執行。
   `booted` / `shutdown` 之外沒有其他 log，是因為 `denied()` 這條路徑本來就不寫 log。

3. **哪一個查詢失敗**
   都沒有執行到查詢。`tournaments`、`registrations`、`participant_recovery_codes` 三個資料表目前**都是 0 筆**，欄位（含 `recovery_code_prefix`、各表 `created_at`）齊全，即使真的執行匯出也只會回傳空陣列，不會失敗。

4. **逾時 / 回應大小 / 啟動錯誤**
   都沒有。啟動 23ms 正常、回應 21 bytes、無任何 timeout 或 CPU/記憶體錯誤記錄。

## 真正的失敗原因（二者之一，皆在 handler 最前面的守門檢查）
函式在以下任一條件不成立時就回 404：
- `MIGRATION_EXPORT_ENABLED` 不等於字串 `"true"`（大小寫、空白都會導致不符）
- 呼叫端帶的 Bearer 與 `MIGRATION_EXPORT_SECRET` 不一致（多換行、多空白、被 shell 轉義都算不一致）
- 或請求不是 `GET`（例如 Railway 用了 POST、或被重導向改成其他方法）

同時提醒：即使守門通過，來源資料庫目前是空的，匯入也不會搬到任何資料。

## 建議的下一步（需你同意才執行，我不會自行修改任何東西）
1. 確認 Railway 這邊 `SOURCE_EXPORT_URL` 是 `https://<專案>.supabase.co/functions/v1/migration-export`，且用 `GET`。
2. 確認 `MIGRATION_EXPORT_ENABLED` 的值精確為 `true`。
3. 確認兩邊的 `MIGRATION_EXPORT_SECRET` 完全一致（無換行/空白）。
4. 若你希望更好診斷，可另行授權我在 `denied()` 分支加入不含機密的原因標記（例如 `reason: disabled | bad_auth | bad_method`）——目前尚未修改。
