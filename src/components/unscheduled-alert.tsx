"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { OptimizeResult } from "@/types/itinerary";
import type { ResolvedPlace } from "@/lib/validation/resolve";

interface UnscheduledAlertProps {
  /**
   * Unscheduled entries from OptimizeResult.
   * Each has placeId and a human-readable reason.
   */
  unscheduled: OptimizeResult["unscheduled"];
  /**
   * Resolved places for display name lookup.
   * Falls back to placeId when a resolved place is not found.
   */
  resolvedPlaces: ResolvedPlace[];
}

/**
 * UnscheduledAlert — surfaces places that /api/optimize could not schedule.
 *
 * Renders a destructive Alert with "以下地點無法排入行程" title and a bulleted
 * list of displayName + reason for each unscheduled entry.
 *
 * CRITICAL: unscheduled places MUST NEVER be silently dropped (plan must_have).
 * This component is rendered whenever optimizeResult.unscheduled.length > 0.
 *
 * AUTH-01: No auth imports.
 * T-03-04: React JSX auto-escapes displayName and reason.
 */
export function UnscheduledAlert({ unscheduled, resolvedPlaces }: UnscheduledAlertProps) {
  if (unscheduled.length === 0) return null;

  // Build a placeId → displayName lookup from resolved places
  const nameById = new Map<string, string>(
    resolvedPlaces.map((p) => [p.placeId, p.displayName])
  );

  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>以下地點無法排入行程</AlertTitle>
      <AlertDescription>
        <ul className="mt-2 list-disc list-inside space-y-1">
          {unscheduled.map((item) => {
            const displayName = nameById.get(item.placeId) ?? item.placeId;
            return (
              <li key={item.placeId} className="text-sm">
                <span className="font-medium">{displayName}</span>
                {item.reason ? (
                  <span className="text-muted-foreground ml-1">— {item.reason}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
