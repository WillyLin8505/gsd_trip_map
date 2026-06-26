# Requirements — Travel Itinerary Planner（旅遊行程規劃器）

**Version:** v1
**Last updated:** 2026-06-25

---

## v1 Requirements

### Input（地點輸入）

- [x] **INPUT-01**: 使用者可貼上多行文字清單，每行一個地點（中文名稱）
- [x] **INPUT-02**: 使用者可貼上 Google Maps 連結（短網址或完整網址），系統自動解析為地點
- [x] **INPUT-03**: 使用者可設定旅遊目的地城市 / 地區，作為搜尋的地理範圍限制
- [x] **INPUT-04**: 系統透過 Google Places API (New) 自動帶入每個地點的名稱、地址、座標、營業時間、門票資訊
- [ ] **INPUT-05**: 使用者可手動調整每個地點的建議遊覽時長（系統預設依地點類型估算）

### Scheduling（行程排程）

- [x] **SCHED-01**: 系統根據地點總數和遊覽時長，自動建議所需天數
- [x] **SCHED-02**: 使用者可自行指定旅遊天數（覆蓋自動建議）
- [x] **SCHED-03**: 系統根據地理距離最短原則排列同天景點順序
- [x] **SCHED-04**: 系統考慮各地點營業時間，避免排入未開放時段
- [x] **SCHED-05**: 系統為每個地點分配具體的到達時間和離開時間

### Display（結果顯示）

- [x] **DISP-01**: 以逐天行程表呈現，清楚顯示每天參觀哪些地點及時間區間
- [x] **DISP-02**: 每個地點顯示營業時間、門票資訊（來自 Google Places API）
- [x] **DISP-03**: 以互動地圖顯示每天的景點位置和行走路線（不同天用不同顏色）
- [x] **DISP-04**: 版面在手機上可正常使用（RWD 響應式設計）

### Account & Sharing（帳號與分享）

- [x] **AUTH-01**: 未登入使用者可完整使用規劃功能（產生行程）
- [ ] **AUTH-02**: 使用者可用 Email + 密碼註冊帳號
- [ ] **AUTH-03**: 使用者可用 Google 帳號第三方登入
- [ ] **AUTH-04**: 登入後可儲存多份行程並隨時查看
- [ ] **AUTH-05**: 使用者可產生行程的公開分享連結，他人可透過連結查看（唯讀）

### Editing（行程編輯，post-v1）

- [x] **EDIT-01**: 行程產生後，使用者可在結果頁貼上新地點，系統解析後將其加入「地理上最接近的那一天」（該天重新計算時間、保留既有順序），不需重排整份行程
- [ ] **EDIT-02**: 每一天有「自動安排」按鈕，僅重排該天：依最短路徑排序，並依 Google place_types 分為 餐廳／點心／行程 三類，只有「餐廳」會被排入午餐（11:30–13:30）或晚餐（17:30–19:30）時段，點心與行程皆為一般路線停留點

---

## v2 Requirements（延後）

- 拖曳手動調整景點順序
- PDF / 圖片匯出
- 跨城市長途旅遊的地理區域分群
- 景點照片顯示
- 行程模板（熱門城市預設行程）
- 多人協作編輯

---

## Out of Scope

- 訂票 / 訂房整合 — 聚焦規劃，不做電商交易
- 即時準確票價 — Places API 不提供精確票價，顯示參考資訊即可
- 原生 Mobile App — v1 為 Web 應用，RWD 支援手機瀏覽器
- AI 自動推薦景點 — 使用者自己決定去哪，系統只做排程優化
- 群組投票功能 — v1 聚焦個人/小組長分享，不做協作決策

---

## Definition of Done

每個 v1 requirement 被視為完成的標準：

- 使用者在瀏覽器中可以實際操作該功能
- 功能在手機瀏覽器上可正常使用
- 核心 happy path 有自動化測試覆蓋

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INPUT-01 | Phase 1 | Complete |
| INPUT-02 | Phase 1 | Complete |
| INPUT-03 | Phase 1 | Complete |
| INPUT-04 | Phase 1 | Complete |
| SCHED-01 | Phase 2 | Complete |
| SCHED-02 | Phase 2 | Complete |
| SCHED-03 | Phase 2 | Complete |
| SCHED-04 | Phase 2 | Complete |
| SCHED-05 | Phase 2 | Complete |
| DISP-01 | Phase 3 | Complete |
| DISP-02 | Phase 3 | Complete |
| DISP-03 | Phase 3 | Complete |
| DISP-04 | Phase 3 | Complete |
| AUTH-01 | Phase 3 | Complete |
| AUTH-02 | Phase 4 | Code-complete (CI verify pending) |
| AUTH-03 | Phase 4 | Code-complete (needs Google/Supabase OAuth console setup) |
| AUTH-04 | Phase 4 | Code-complete (CI verify pending) |
| AUTH-05 | Phase 4 | Code-complete (CI verify pending) |
| INPUT-05 | Phase 5 | Code-complete (375px walkthrough pending) |
| EDIT-01 | Phase 6 | Planned |
| EDIT-02 | Phase 6 | Planned |
