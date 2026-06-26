"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PlaceRow } from "@/components/place-row";
import type { OptimizeResult, PlaceDetail } from "@/types/itinerary";

type DayEntry = OptimizeResult["days"][number];

interface DayCardProps {
  day: DayEntry;
  /** Per-place detail map from use-place-details; optional — rows degrade gracefully */
  detailsById?: Map<string, PlaceDetail>;
}

/**
 * DayCard — a single day's itinerary card.
 *
 * Header: "第 {dayNumber} 天" (text-lg font-semibold) + "共 {N} 個地點"
 * Body: ordered PlaceRow list — each row receives the visit, dayNumber,
 *   within-day orderIndex, and the optional PlaceDetail from the details Map.
 *
 * DISP-01: Day headings and ordered visit rows with time slots.
 * DISP-02: Rich rows via PlaceRow (hours, price, hoursUnknown badge).
 *
 * AUTH-01: No auth imports.
 * T-03-04: React JSX auto-escapes displayName.
 */
export function DayCard({ day, detailsById }: DayCardProps) {
  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            第 {day.dayNumber} 天
          </h2>
          <span className="text-sm text-muted-foreground">
            共 {day.visits.length} 個地點
          </span>
        </div>
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
              />
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
