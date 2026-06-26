"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getDayColor } from "@/lib/map/day-colors";
import type { OptimizeResult } from "@/types/itinerary";

type DayEntry = OptimizeResult["days"][number];

interface DayCardProps {
  day: DayEntry;
}

/**
 * DayCard — a single day's itinerary card.
 *
 * Header: "第 {dayNumber} 天" (text-lg font-semibold) + "共 {N} 個地點"
 * Body: ordered minimal visit rows — each with:
 *   - Day-color dot (getDayColor)
 *   - 1-based index
 *   - displayName (font-semibold text-base)
 *   - Time slot "{scheduledStart} – {scheduledEnd}" (text-sm text-muted-foreground)
 *   - Separator between rows
 *
 * Rich PlaceRow (hours/price/warnings) added by 03-03.
 * DISP-01 is satisfied by these minimal rows.
 *
 * AUTH-01: No auth imports.
 * T-03-04: React JSX auto-escapes displayName.
 */
export function DayCard({ day }: DayCardProps) {
  const dayColor = getDayColor(day.dayNumber - 1);

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
              {index > 0 && <Separator className="my-2" />}

              <div className="flex items-start gap-3 py-2">
                {/* Day-color dot */}
                <span
                  className="flex-shrink-0 w-2 h-2 rounded-full mt-2"
                  style={{ backgroundColor: dayColor }}
                  aria-hidden="true"
                />

                {/* 1-based index */}
                <span className="flex-shrink-0 text-sm text-muted-foreground w-5 mt-0.5">
                  {index + 1}.
                </span>

                {/* Visit details */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base text-foreground">
                    {visit.displayName}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {visit.scheduledStart} – {visit.scheduledEnd}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
