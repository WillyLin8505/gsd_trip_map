"use client";

import { useState } from "react";
import { Car, Clock, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getDayColor } from "@/lib/map/day-colors";
import type { ScheduledVisit, PlaceDetail } from "@/types/itinerary";

/** Minutes between two "HH:MM" times, or null when either is missing/invalid. */
function durationFromSlot(start: string, end: string): number | null {
  const parse = (t: string): number | null => {
    const m = /^(\d{2}):(\d{2})$/.exec(t);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const s = parse(start);
  const e = parse(end);
  if (s == null || e == null) return null;
  const d = e - s;
  return d > 0 ? d : null;
}

/**
 * Maps a numeric price level (0–4) to a display string.
 * 0 = free (show nothing), 1–4 = $, $$, $$$, $$$$
 */
function priceLevelToString(level: number): string {
  const map: Record<number, string> = {
    0: "",
    1: "$",
    2: "$$",
    3: "$$$",
    4: "$$$$",
  };
  return map[level] ?? "";
}

/**
 * Summarizes openingHours into a one-line string.
 *
 * The API returns openingHours as an array of period objects. For simplicity
 * in Phase 3, we show the first period's open/close times or a generic
 * "有營業時間" if we can't parse the structure.
 *
 * Phase 5 can improve this into a full per-day breakdown.
 */
function summarizeHours(openingHours: unknown): string | null {
  if (!openingHours || !Array.isArray(openingHours) || openingHours.length === 0) {
    return null;
  }

  try {
    const first = openingHours[0] as {
      open?: { hour?: number; minute?: number; day?: number };
      close?: { hour?: number; minute?: number };
    };

    const open = first?.open;
    const close = first?.close;

    if (open?.hour !== undefined && close?.hour !== undefined) {
      const openStr = `${String(open.hour).padStart(2, "0")}:${String(open.minute ?? 0).padStart(2, "0")}`;
      const closeStr = `${String(close.hour).padStart(2, "0")}:${String(close.minute ?? 0).padStart(2, "0")}`;
      return `${openStr}–${closeStr}`;
    }
  } catch {
    // Fall through to generic label
  }

  return "有營業時間";
}

export interface PlaceRowProps {
  /** The scheduled visit from the optimizer */
  visit: ScheduledVisit;
  /** 1-based day number (used for day-color dot) */
  dayNumber: number;
  /** 0-based index within the day (used for within-day number label) */
  orderIndex: number;
  /** Optional per-place detail from use-place-details */
  detail?: PlaceDetail | null;
  /**
   * INPUT-05: when provided, the visit duration becomes editable. Called with the
   * place_id and the new duration in minutes; the parent re-optimizes. When omitted
   * (e.g. read-only saved/share views) the duration renders as static text.
   */
  onDurationChange?: (placeId: string, minutes: number) => void;
}

/**
 * PlaceRow — a single place row in a DayCard.
 *
 * Renders (DISP-02 / UI-SPEC Flow D):
 * - Day-color dot (getDayColor, 8px circle)
 * - 1-based within-day number (orderIndex + 1)
 * - displayName (font-semibold text-base)
 * - Time slot "{scheduledStart} – {scheduledEnd}" (text-sm text-muted-foreground)
 * - Travel time "搭車 {N} 分" with lucide Car icon when travelFromPrevMinutes > 0
 * - Opening hours one-liner from details, or "營業時間未知" when unknown
 * - hoursUnknown amber badge when visit.hoursUnknown OR detail.hoursUnknown
 *   — EXACT copy "營業時間未知，建議出發前確認" (must match map InfoWindow in 03-04, SC4)
 * - Price badge ($/$$/$$$/$$$$) from detail.priceLevel when present
 *
 * AUTH-01: No auth imports.
 * T-03-04: React JSX auto-escapes all user-facing strings.
 */
export function PlaceRow({ visit, dayNumber, orderIndex, detail, onDurationChange }: PlaceRowProps) {
  const dayColor = getDayColor(dayNumber - 1);

  const currentDuration = durationFromSlot(visit.scheduledStart, visit.scheduledEnd);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");

  function startEdit() {
    setDraft(currentDuration != null ? String(currentDuration) : "60");
    setEditing(true);
  }

  function commit() {
    const minutes = Number(draft);
    setEditing(false);
    if (
      onDurationChange &&
      Number.isInteger(minutes) &&
      minutes >= 15 &&
      minutes <= 720 &&
      minutes !== currentDuration
    ) {
      onDurationChange(visit.placeId, minutes);
    }
  }

  // hoursUnknown if either the optimizer flagged it OR the details confirm it
  const isHoursUnknown = visit.hoursUnknown || (detail?.hoursUnknown ?? false);

  // Price level display
  const priceStr = detail?.priceLevel != null ? priceLevelToString(detail.priceLevel) : null;

  // Opening hours one-liner (only shown when hoursUnknown is false)
  const hoursSummary = !isHoursUnknown
    ? summarizeHours(detail?.openingHours)
    : null;

  return (
    <div className="flex items-start gap-3 py-2">
      {/* Day-color dot — matches map polyline color */}
      <span
        className="flex-shrink-0 w-2 h-2 rounded-full mt-2"
        style={{ backgroundColor: dayColor }}
        aria-hidden="true"
      />

      {/* 1-based within-day index */}
      <span className="flex-shrink-0 text-sm text-muted-foreground w-5 mt-0.5">
        {orderIndex + 1}.
      </span>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Place name */}
        <p className="font-semibold text-base text-foreground leading-snug">
          {visit.displayName}
        </p>

        {/* Time slot */}
        <p className="text-sm text-muted-foreground">
          {visit.scheduledStart} – {visit.scheduledEnd}
        </p>

        {/* Visit duration — editable when onDurationChange is provided (INPUT-05) */}
        {currentDuration != null && (
          <div className="text-sm text-muted-foreground">
            {editing ? (
              <span className="flex items-center gap-1">
                停留
                <Input
                  type="number"
                  min={15}
                  max={720}
                  step={15}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") setEditing(false);
                  }}
                  onBlur={commit}
                  autoFocus
                  aria-label="停留時間（分鐘）"
                  className="h-7 w-20"
                />
                分
              </span>
            ) : onDurationChange ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1 text-sm font-normal text-muted-foreground"
                onClick={startEdit}
                aria-label={`編輯停留時間，目前 ${currentDuration} 分`}
              >
                停留 {currentDuration} 分
                <Pencil className="ml-1 h-3 w-3" aria-hidden="true" />
              </Button>
            ) : (
              <span>停留 {currentDuration} 分</span>
            )}
          </div>
        )}

        {/* Travel time from previous stop (omit for first stop) */}
        {visit.travelFromPrevMinutes > 0 && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Car className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            <span>搭車 {visit.travelFromPrevMinutes} 分</span>
          </p>
        )}

        {/* Opening hours one-liner — only shown when hours are known */}
        {hoursSummary && (
          <p className="text-sm text-muted-foreground">{hoursSummary}</p>
        )}

        {/* hoursUnknown amber badge — SC4: exact copy must match map InfoWindow */}
        {isHoursUnknown && (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1 w-fit text-xs font-normal"
          >
            <Clock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            <span>營業時間未知，建議出發前確認</span>
          </Badge>
        )}

        {/* Price level badge */}
        {priceStr && (
          <Badge variant="outline" className="w-fit text-xs">
            {priceStr}
          </Badge>
        )}
      </div>
    </div>
  );
}
