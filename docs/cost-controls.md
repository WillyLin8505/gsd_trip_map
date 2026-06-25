# GCP Cost Controls — Operator Runbook

**Status: REQUIRED before any user-facing feature ships**

This document provides the exact GCP Console steps for the cost controls that are
non-negotiable Phase 1 deliverables. The human checkpoint (Plan 04, Task 4) verifies
each item in the checklist below before the project advances.

---

## Rationale — Estimated Monthly Costs

At 1,000 active users the estimated spend is approximately **$165/month** beyond the
Google Maps Platform free tiers:

| API / SKU | Free Cap / Month | Cost Beyond Free |
|-----------|-----------------|-----------------|
| Places (New) — Essentials (name, address, hours) | 10,000 requests | $5.00 / 1,000 |
| Places (New) — Enterprise (opening hours, Pro fields) | 5,000 requests | $17.00 / 1,000 |
| Routes API — Essentials (optimize waypoints ≤10) | 5,000 requests | ~$5.00 / 1,000 |
| Maps JS API — Dynamic Maps | 10,000 loads | ~$7.00 / 1,000 |

Without a hard daily quota cap and billing alerts, a bug or traffic spike could
produce an unbounded bill. These controls are the project's hard cost ceiling.

---

## Step 1 — Billing Budget Alerts ($10 / $50 / $100)

**Navigation:** GCP Console → Billing → Budgets & alerts → Create budget

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Click the hamburger menu → **Billing** → select your billing account.
3. Click **Budgets & alerts** in the left sidebar.
4. Click **Create budget**.
5. Fill in the form:
   - **Name:** e.g. `food-map-$10-alert`
   - **Projects:** select this project
   - **Budget type:** Specified amount
   - **Budget amount:** `10` (USD)
   - **Alert thresholds:** 100% (actual), 90% (forecasted)
   - **Notifications:** check "Email alerts to billing admins and users"
6. Click **Finish**. Repeat for `$50` and `$100`.

**Result:** You should have three budget alerts: at $10, $50, and $100.

---

## Step 2 — Hard Daily Quota Cap on Places API (New)

**Navigation:** GCP Console → APIs & Services → Places API (New) → Quotas

> A daily quota cap creates a hard ceiling on API spend — once the cap is hit,
> requests fail until the next UTC day. Set it conservatively during development.

1. Open [APIs & Services](https://console.cloud.google.com/apis/dashboard).
2. Click **Places API (New)** in the enabled APIs list (if not visible, search it).
3. Click **Quotas** in the left sidebar.
4. Find the row **"Requests per day"** (or similar; the label may include a
   "Text Search Requests per day" entry).
5. Click the pencil/edit icon next to the quota.
6. Set an appropriate daily limit for your development stage:
   - Development/testing: `500` requests per day
   - Staging: `5,000` requests per day
   - Production (after cost analysis): adjust based on active user count
7. Click **Submit** and confirm.

**Important:** This cap applies at the project level. If you use a separate
project for production, repeat this step there.

---

## Step 3 — API Key Restrictions

Two separate API keys are required. Never use the same key for both browser
and server contexts.

### 3a — Browser Key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)

**Navigation:** GCP Console → APIs & Services → Credentials → select or create key

- **Application restrictions:** HTTP referrers (web sites)
- **Allowed referrers:** add your production domain (e.g. `https://yourdomain.com/*`)
  and localhost for development (e.g. `http://localhost:3000/*`)
- **API restrictions:** Restrict key → select **Maps JavaScript API** only
- Do NOT add Places API or Routes API to this key

### 3b — Server Key (`GOOGLE_PLACES_API_KEY`)

**Navigation:** GCP Console → APIs & Services → Credentials → select or create key

- **Application restrictions:** IP addresses
- **Allowed IP addresses:** add the static IP(s) of your Vercel functions / server
  (or use "None" during development while you collect IPs, then restrict before production)
- **API restrictions:** Restrict key → select:
  - **Places API (New)**
  - **Routes API**
- Do NOT add Maps JavaScript API to this key

---

## Step 4 — Confirm Places API (New) Is Enabled

**Navigation:** GCP Console → APIs & Services → Library → search "Places API (New)"

1. Open the [API Library](https://console.cloud.google.com/apis/library).
2. Search for **"Places API (New)"**.
3. Confirm the status shows **ENABLED** on your project.
4. If not enabled, click **Enable**.

**Note:** Do NOT enable the legacy "Places API" — only the **Places API (New)**
at `places.googleapis.com/v1` is used by this project (see CLAUDE.md: Pitfall 2).

---

## Operator Verification Checklist

The Task 4 human checkpoint requires you to confirm each item below.
Check each off once confirmed in the GCP Console:

- [ ] Billing alert at **$10** created and notification email confirmed
- [ ] Billing alert at **$50** created and notification email confirmed
- [ ] Billing alert at **$100** created and notification email confirmed
- [ ] Hard daily quota cap set on **Places API (New)** → Requests per day
- [ ] **Browser key** restricted to: Maps JavaScript API + HTTP referrer(s)
- [ ] **Server key** restricted to: Places API (New) + Routes API + IP address(es)
- [ ] **Places API (New)** confirmed ENABLED on the project (not legacy Places API)

---

## Ongoing Cost Monitoring

- Review billing reports weekly during early launch: GCP Console → Billing → Reports
- Filter by API to identify which service drives cost
- Raise the daily quota cap incrementally as you validate usage is within expectations
- Consider enabling [Budget alerts to Pub/Sub](https://cloud.google.com/billing/docs/how-to/budgets-programmatic-notifications)
  for automated responses to cost spikes in production
