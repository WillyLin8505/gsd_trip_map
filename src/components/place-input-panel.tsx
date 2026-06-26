"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ResolvedPlaceList } from "@/components/resolved-place-list";
import { ResultsLayout } from "@/components/results-layout";
import { ProgressSteps } from "@/components/progress-steps";
import { SaveItineraryButton } from "@/components/save-itinerary-button";
import { usePlaceDetails } from "@/lib/places/use-place-details";
import type { ResolvedPlace } from "@/lib/validation/resolve";
import type { OptimizeResult } from "@/types/itinerary";

/**
 * PlaceInputPanel — the top-level 3-step flow controller.
 *
 * Step 1 (Input): City + place names textarea → 查詢地點
 * Step 2 (Confirm): ResolvedPlaceList with remove buttons → 最佳化行程
 * Step 3 (Results): ResultsLayout → ItineraryView + UnscheduledAlert + MapView placeholder
 *
 * AUTH-01: No auth/session imports. All API calls are anonymous.
 * T-03-03: Textarea split by newline + trim + filter (never JSON.parse user input).
 * T-03-04: React JSX auto-escapes displayName (no dangerouslySetInnerHTML).
 *
 * ProgressSteps: driven from flow state (1=input/resolving, 2=confirm, 3=results).
 * usePlaceDetails: called after optimize to fetch opening hours + price level.
 *   detailsById is passed into ResultsLayout → ItineraryView → DayCard → PlaceRow.
 */
export function PlaceInputPanel() {
  const [rawInputs, setRawInputs] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [resolvedPlaces, setResolvedPlaces] = useState<ResolvedPlace[]>([]);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [loading, setLoading] = useState<"idle" | "resolving" | "optimizing">("idle");
  const [error, setError] = useState<string | null>(null);

  // Collect all scheduled placeIds after optimization so we can fetch their details
  const scheduledPlaceIds = optimizeResult
    ? optimizeResult.days.flatMap((d) => d.visits.map((v) => v.placeId))
    : [];

  // usePlaceDetails: dedupes requests, tolerates per-id failures
  const { details: detailsById } = usePlaceDetails(scheduledPlaceIds);

  // Derive ProgressSteps current step from flow state
  // idle + no resolvedPlaces = step 1
  // resolvedPlaces present + no result = step 2
  // optimizeResult present = step 3
  const progressStep: 1 | 2 | 3 = optimizeResult
    ? 3
    : resolvedPlaces.length > 0
    ? 2
    : 1;

  // ---------------------------------------------------------------------------
  // Flow A: Resolve places
  // ---------------------------------------------------------------------------
  async function handleResolve() {
    setError(null);

    // T-03-03: Split by newline, trim, filter empties — never JSON.parse
    const inputs = rawInputs
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (!city.trim()) {
      setError("請輸入目的地城市");
      return;
    }

    if (inputs.length === 0) {
      setError("請輸入至少一個地點名稱");
      return;
    }

    setLoading("resolving");
    try {
      const response = await fetch("/api/places/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs, city: city.trim() }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const errData = data as { error?: string };
        setError(errData.error ?? "地點查詢失敗，請稍後再試");
        return;
      }

      // Filter out NOT_FOUND markers; keep only fully-resolved places with lat/lng
      const allItems = data as Array<ResolvedPlace | { status: "NOT_FOUND"; original_query: string }>;
      const resolved = allItems.filter(
        (item): item is ResolvedPlace => !("status" in item && item.status === "NOT_FOUND")
      );

      if (resolved.length === 0) {
        setError("沒有找到符合的地點，請檢查輸入內容或城市名稱");
        return;
      }

      setResolvedPlaces(resolved);
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading("idle");
    }
  }

  // ---------------------------------------------------------------------------
  // Flow B → C: Remove a place from the confirmed list
  // ---------------------------------------------------------------------------
  function handleRemovePlace(placeId: string) {
    setResolvedPlaces((prev) => prev.filter((p) => p.placeId !== placeId));
  }

  // ---------------------------------------------------------------------------
  // Flow C → D: Optimize itinerary
  // ---------------------------------------------------------------------------
  async function handleOptimize() {
    setError(null);
    setLoading("optimizing");

    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeIds: resolvedPlaces.map((p) => p.placeId) }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const errData = data as { error?: string };
        setError(errData.error ?? "行程最佳化失敗，請重新嘗試");
        return;
      }

      setOptimizeResult(data as OptimizeResult);
    } catch {
      setError("行程最佳化失敗，請重新嘗試");
    } finally {
      setLoading("idle");
    }
  }

  // ---------------------------------------------------------------------------
  // Reset to step 1
  // ---------------------------------------------------------------------------
  function handleReset() {
    setRawInputs("");
    setCity("");
    setResolvedPlaces([]);
    setOptimizeResult(null);
    setError(null);
    setLoading("idle");
  }

  // ---------------------------------------------------------------------------
  // Step 3: show results
  // ---------------------------------------------------------------------------
  if (optimizeResult) {
    return (
      <div className="space-y-4">
        <ProgressSteps current={progressStep} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SaveItineraryButton
            itinerary={optimizeResult}
            resolvedPlaces={resolvedPlaces}
            city={city}
          />
          <Button variant="outline" onClick={handleReset}>
            重新輸入
          </Button>
        </div>
        <ResultsLayout
          itinerary={optimizeResult}
          resolvedPlaces={resolvedPlaces}
          detailsById={detailsById}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2: confirm resolved places
  // ---------------------------------------------------------------------------
  if (resolvedPlaces.length > 0) {
    return (
      <div className="space-y-4">
        <ProgressSteps current={progressStep} />
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>最佳化失敗</AlertTitle>
            <AlertDescription>
              {error}
              <Button
                variant="ghost"
                size="sm"
                className="ml-2"
                onClick={handleOptimize}
              >
                重試
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <ResolvedPlaceList
          places={resolvedPlaces}
          onRemove={handleRemovePlace}
        />

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
          >
            重新輸入
          </Button>
          <Button
            onClick={handleOptimize}
            disabled={resolvedPlaces.length === 0 || loading === "optimizing"}
            className="flex-1 h-11"
          >
            {loading === "optimizing" ? "最佳化中..." : "最佳化行程"}
          </Button>
        </div>

        {loading === "optimizing" && (
          <div className="space-y-2" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 1: input form
  // ---------------------------------------------------------------------------
  const isResolveDisabled = !city.trim() || !rawInputs.trim() || loading === "resolving";

  return (
    <div className="max-w-2xl mx-auto">
      <ProgressSteps current={progressStep} />
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">旅遊行程規劃器</h1>
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* City input — INPUT-03 */}
        <div className="space-y-1.5">
          <label
            htmlFor="city"
            className="block text-sm font-medium text-foreground"
          >
            目的地城市 <span className="text-destructive">*</span>
          </label>
          <Input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="例如：台北市、高雄市、京都市"
            aria-label="目的地城市"
            aria-required="true"
            className="h-11"
          />
          <p className="text-sm text-muted-foreground">必填，用於縮小地點搜尋範圍</p>
        </div>

        {/* Place list textarea — INPUT-01 */}
        <div className="space-y-1.5">
          <label
            htmlFor="places"
            className="block text-sm font-medium text-foreground"
          >
            地點清單 <span className="text-destructive">*</span>
          </label>
          <Textarea
            id="places"
            value={rawInputs}
            onChange={(e) => setRawInputs(e.target.value)}
            rows={6}
            placeholder={"每行輸入一個地點名稱，例如：\n台北101\n故宮博物院\n士林夜市"}
            aria-label="地點清單"
            aria-required="true"
          />
          <p className="text-sm text-muted-foreground">
            每行輸入一個地點名稱（中文名稱或 Google Maps 連結）
          </p>
        </div>

        {/* Resolve button */}
        <Button
          onClick={handleResolve}
          disabled={isResolveDisabled}
          className="w-full h-11"
          aria-label="查詢地點"
        >
          {loading === "resolving" ? "查詢中..." : "查詢地點"}
        </Button>

        {/* Loading skeletons */}
        {loading === "resolving" && (
          <div className="space-y-2" aria-live="polite">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-3/4 rounded-lg" />
          </div>
        )}
      </div>
    </div>
  );
}
