# 修正「新增選手時參賽者莫名消失」

## 問題原因

選手名單（roster）在多裝置同步時是「整份覆蓋」，而對戰（matches）是「逐場合併」：

- `src/lib/tournament-store.tsx` 的 admin 追蹤流程在收到雲端快照時直接 `setPlayers(incoming.players)`，完全丟棄本機名單。
- 資料庫端的 `publish_live_state` 也只做 `COALESCE(_state->'players', ...)`，即最後寫入者覆蓋整份名單。

所以只要出現下列時序，剛新增的選手就會被抹掉：

```text
管理者A 新增選手 → 尚在 250ms 發佈延遲內
                → 收到別台裝置/輪詢的舊快照 → setPlayers(舊名單) → 新選手消失
管理者A 新增甲   ┐ 兩人幾乎同時新增
管理者B 新增乙   ┘ → 後寫入者的整份名單覆蓋前者 → 一人消失
```

掃碼報名核准（`PlayersTab` 的 `addPlayers`）走同一條路徑，因此也會被吞掉。

## 修正方向

1. 名單改為「依 id 合併」而非覆蓋：本機有、雲端還沒有的選手保留；雲端有、本機沒有的加入；重新編號 seed。
2. 刪除仍要生效：本機記錄「已刪除的選手 id」墓碑清單（含時間戳），合併時排除這些 id，並隨快照一起發佈，讓其他裝置也套用刪除。
3. 資料庫 `publish_live_state` 同步改為在 SQL 端合併名單（依 id 聯集，排除傳入的 removed id），避免兩台裝置同時寫入時互相覆蓋。
4. 賽程已產生後（matches 不為空）名單合併不改動既有對戰，維持現行 `mergeMatches` 行為。

## 技術細節

- `src/lib/live-merge.ts`：新增 `mergePlayers(local, incoming, removedIds)`，依 id 聯集、去除墓碑、依原順序重排 `seed`。
- `src/lib/tournament-store.tsx`：
  - 新增 `removedPlayers` ref（id → 刪除時間），`removePlayer` 寫入墓碑。
  - admin `apply()` 與 spectator `apply()` 改呼叫 `mergePlayers`，不再直接覆蓋。
  - 發佈 payload 加入 `removedPlayers`，並納入 `lastPayload` 比對。
- `src/lib/tournament-types.ts`：`TournamentState` 增加選填 `removedPlayers`。
- 一支新的 migration：更新 `publish_live_state`，以 `id` 為鍵合併 `players`，並套用 `_state->'removedPlayers'` 的排除清單。

## 驗證

- 單一裝置連續快速新增多位選手，名單不再回滾。
- 兩個管理者同時新增不同選手，兩人都保留。
- 任一裝置刪除選手，其他裝置也會移除且不會「復活」。
- 產生賽程、計分流程不受影響。
