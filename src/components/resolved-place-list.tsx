"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ResolvedPlace } from "@/lib/validation/resolve";

interface ResolvedPlaceListProps {
  places: ResolvedPlace[];
  onRemove: (placeId: string) => void;
}

/**
 * ResolvedPlaceList — Flow B confirmation step.
 *
 * Shows each resolved place as a Card row with:
 * - 1-based index number
 * - displayName (font-semibold)
 * - formattedAddress (text-sm text-muted-foreground)
 * - Ghost remove button (Lucide X, aria-label="移除")
 *
 * Blue-50/blue-700 informational callout above the list.
 *
 * AUTH-01: No auth imports.
 * T-03-04: React JSX auto-escapes displayName.
 */
export function ResolvedPlaceList({ places, onRemove }: ResolvedPlaceListProps) {
  return (
    <div className="space-y-3">
      {/* Informational callout — UI-SPEC section 8 */}
      <Alert className="bg-blue-50 border-blue-200 text-blue-700">
        <AlertDescription className="text-blue-700">
          已解析 {places.length} 個地點，請確認地點資訊是否正確，然後點擊「最佳化行程」
        </AlertDescription>
      </Alert>

      {/* Place list */}
      <ul className="space-y-2" aria-label="已解析地點列表">
        {places.map((place, index) => (
          <li key={place.placeId}>
            <Card className="bg-white border border-gray-200">
              <CardContent className="flex items-start gap-3 p-4">
                {/* 1-based index */}
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center mt-0.5"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>

                {/* Place info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base text-foreground truncate">
                    {place.displayName}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                    {place.formattedAddress}
                  </p>
                </div>

                {/* Remove button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(place.placeId)}
                  aria-label="移除"
                  className="flex-shrink-0 h-8 w-8 p-0 transition-opacity duration-150 hover:opacity-70 mt-0.5"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
