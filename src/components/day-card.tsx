"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { PlaceRow } from "@/components/place-row";
import type { OptimizeResult, PlaceDetail } from "@/types/itinerary";

type DayEntry = OptimizeResult["days"][number];

interface DayCardProps {
  day: DayEntry;
  /** Per-place detail map from use-place-details; optional — rows degrade gracefully */
  detailsById?: Map<string, PlaceDetail>;
  /** INPUT-05: forwarded to PlaceRow to enable inline duration editing */
  onDurationChange?: (placeId: string, minutes: number) => void;
  /**
   * F2 auto-arrange handler. When provided, renders a 「自動安排」 button in the
   * card header that calls this handler with the day's dayNumber.
   * Async: the handler is responsible for calling replaceDay on success.
   */
  onAutoArrange?: (dayNumber: number) => Promise<void>;
}

/**
 * DayCard — a single day's itinerary card.
 *
 * Header: "第 {dayNumber} 天" (text-lg font-semibold) + "共 {N} 個地點"
 *   + optional 「自動安排」 button (F2 — when onAutoArrange is provided).
 * Body: ordered PlaceRow list — each row receives the visit, dayNumber,
 *   within-day orderIndex, and the optional PlaceDetail from the details Map.
 *
 * DISP-01: Day headings and ordered visit rows with time slots.
 * DISP-02: Rich rows via PlaceRow (hours, price, hoursUnknown badge).
 *
 * F2 per-day state (isArranging, arrangeError) is local to DayCard —
 * only one day is affected at a time, and other days' buttons stay enabled.
 *
 * AUTH-01: No auth imports.
 * T-03-04: React JSX auto-escapes displayName.
 */
export function DayCard({ day, detailsById, onDurationChange, onAutoArrange }: DayCardProps) {
  const [isArranging, setIsArranging] = useState(false);
  const [arrangeError, setArrangeError] = useState<string | null>(null);

  async function handleAutoArrange() {
    if (!onAutoArrange) return;
    setArrangeError(null);
    setIsArranging(true);
    try {
      await onAutoArrange(day.dayNumber);
    } catch (err) {
      // CR-02: When handleAutoArrange throws with a specific message (e.g.
      // "自動安排完成，但以下地點無法排入當天：…" for partial success with
      // unscheduled places), display that message so the user knows which
      // places couldn't be scheduled. Fall back to the generic failure copy
      // for unexpected network/server errors.
      setArrangeError(
        err instanceof Error && err.message
          ? err.message
          : "自動安排失敗，請稍後再試"
      );
    } finally {
      setIsArranging(false);
    }
  }

  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            第 {day.dayNumber} 天
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              共 {day.visits.length} 個地點
            </span>
            {onAutoArrange && (
              <Button
                variant="outline"
                size="sm"
                className="h-11"
                aria-label={`自動安排第 ${day.dayNumber} 天`}
                aria-busy={isArranging}
                disabled={isArranging}
                onClick={() => void handleAutoArrange()}
              >
                {isArranging ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    安排中...
                  </>
                ) : (
                  "自動安排"
                )}
              </Button>
            )}
          </div>
        </div>
        {arrangeError && (
          <Alert variant="destructive" role="alert" className="mt-2">
            <AlertDescription>{arrangeError}</AlertDescription>
          </Alert>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <ol className="space-y-0" aria-label={`第 ${day.dayNumber} 天行程`}>
          {day.visits.map((visit, index) => (
            <li key={visit.placeId}>
              {index > 0 && <Separator className="my-1" />}
              <PlaceRow
                visit={visit}
                dayNumber={day.dayNumber}
                orderIndex={index}
                detail={detailsById?.get(visit.placeId)}
                onDurationChange={onDurationChange}
              />
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
