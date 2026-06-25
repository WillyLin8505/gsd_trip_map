# Travel Itinerary Planner（旅遊行程規劃器）

## What This Is

一個開放給一般使用者的 Web 旅遊行程規劃工具。使用者貼上景點和餐廳清單（中文名稱或 Google Maps 連結），系統自動透過 Google Places API 帶入營業時間、門票資訊、建議遊覽時長，再同時考慮地理距離與營業時間限制，自動排出最佳多天行程，並以逐天行程表 + 互動地圖呈現結果。

## Core Value

**讓使用者省去「手動查資料 + 手動排順序」的麻煩**——貼上清單就能得到一份可直接執行的最佳化行程。

## Context

- 旅遊規劃過程中最痛的環節：把「想去的地方」轉成「有邏輯的每日行程」，需要查每個地點的開放時間、計算路程、避免跑回頭路、擔心某天塞太滿
- 這個工具解決這整個痛點，讓使用者只需關心「我想去哪裡」，而不是「怎麼排才合理」

## Target Users

一般旅遊者，短途城市旅遊（2-5 天）和長途跨城市旅遊（5 天以上）都需要支援。使用者需要帳號登入才能儲存和分享行程。

## Requirements

### Validated

（尚無——開始開發後驗證）

### Active

- [ ] 使用者可貼上地點清單（中文名稱或 Google Maps 連結）
- [ ] 系統透過 Google Places API 自動帶入每個地點的營業時間、門票資訊、建議遊覽時長
- [ ] 系統同時考慮地理距離 + 營業時間限制，排出最佳參觀順序
- [ ] 系統根據地點數量和平均遊覽時間，自動建議行程天數
- [ ] 以逐天行程表呈現（第幾天去哪些地方、幾點到幾點）
- [ ] 以互動地圖呈現每天的路線和順序
- [ ] 使用者可註冊/登入帳號
- [ ] 使用者可儲存多份行程
- [ ] 使用者可分享行程（產生公開連結）
- [ ] 支援短途城市旅遊和跨城市長途旅遊

### Out of Scope

- 訂票、訂房整合 — 聚焦在規劃，不做電商
- 即時票價查詢 — Google Places API 不提供精確票價，顯示參考資訊即可
- 離線 Mobile App — v1 聚焦 Web，Mobile 友善 (RWD) 但不做原生 App

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web 而非 Mobile App | 旅遊規劃通常在出發前用電腦規劃，Web 覆蓋面更廣 | 採用 |
| Google Places API 作為資料來源 | 資料最完整，覆蓋全球地點，有中文支援 | 採用 |
| 兩種輸入都支援（中文名稱 + Maps 連結） | 降低使用門檻，使用者不必轉換格式 | 採用 |
| 開放給一般使用者（需帳號） | 允許儲存和分享行程，比純單次工具更有黏著度 | 採用 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-25 after initialization*
