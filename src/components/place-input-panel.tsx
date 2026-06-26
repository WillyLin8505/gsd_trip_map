"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ResolvedPlaceList } from "@/components/resolved-place-list";
import { ResultsLayout } from "@/components/results-layout";
import { DayPlaceAdder } from "@/components/day-place-adder";
import { ProgressSteps } from "@/components/progress-steps";
import { SaveItineraryButton } from "@/components/save-itinerary-button";
import { usePlaceDetails } from "@/lib/places/use-place-details";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { buildOptimizeBody } from "@/lib/places/optimize-request";
import type { ResolvedPlace } from "@/lib/validation/resolve";
import type { OptimizeResult, ScheduledVisit } from "@/types/itinerary";

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
  const [durationOverrides, setDurationOverrides] = useState<Record<string, number>>({});
  const [numDays, setNumDays] = useState<string>(""); // "" = 自動
  const [startDate, setStartDate] = useState<string>(""); // YYYY-MM-DD ("" = 預設)
  const [resolvedCity, setResolvedCity] = useState<string | null>(null);
  const [cityInferred, setCityInferred] = useState<boolean>(false);
  const [loading, setLoading] = useState<"idle" | "resolving" | "optimizing">("idle");
  const [error, setError] = useState<string | null>(null);

  // SC3: debounce the textarea so the place-count preview doesn't recompute on
  // every keystroke (300ms quiescence).
  const debouncedRawInputs = useDebouncedValue(rawInputs, 300);
  const pendingPlaceCount = debouncedRawInputs
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length;

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

    if (inputs.length === 0) {
      setError("請輸入至少一個地點名稱");
      return;
    }

    setLoading("resolving");
    try {
      const response = await fetch("/api/places/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(city.trim() ? { inputs, city: city.trim() } : { inputs }),
      });

      const data = (await response.json()) as {
        places?: Array<ResolvedPlace | { status: "NOT_FOUND"; original_query: string }>;
        resolvedCity?: string | null;
        cityInferred?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "地點查詢失敗，請稍後再試");
        return;
      }

      // Filter out NOT_FOUND markers; keep only fully-resolved places with lat/lng
      const allItems = data.places ?? [];
      const resolved = allItems.filter(
        (item): item is ResolvedPlace => !("status" in item && item.status === "NOT_FOUND")
      );

      if (resolved.length === 0) {
        setError("沒有找到符合的地點，請檢查輸入內容");
        return;
      }

      setResolvedCity(data.resolvedCity ?? null);
      setCityInferred(Boolean(data.cityInferred));
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
  async function handleOptimize(overrides: Record<string, number> = durationOverrides) {
    setError(null);
    setLoading("optimizing");

    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildOptimizeBody({
            placeIds: resolvedPlaces.map((p) => p.placeId),
            numDays: numDays ? Number(numDays) : null,
            travelDate: startDate || null,
            durationOverrides: overrides,
          })
        ),
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
  // INPUT-05: edit a place's visit duration → re-optimize with the override
  // ---------------------------------------------------------------------------
  async function handleDurationChange(placeId: string, minutes: number) {
    const next = { ...durationOverrides, [placeId]: minutes };
    setDurationOverrides(next);
    await handleOptimize(next);
  }

  // ---------------------------------------------------------------------------
  // F1/F2: Replace one day in the itinerary (Pitfall 5: preserve suggestedDays)
  // ---------------------------------------------------------------------------
  function replaceDay(
    dayNumber: number,
    newDay: { dayNumber: number; visits: ScheduledVisit[] }
  ) {
    setOptimizeResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) => (d.dayNumber === dayNumber ? newDay : d)),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // F2: Auto-arrange one day (reorder=true → POST /api/optimize/day → replaceDay)
  // ---------------------------------------------------------------------------
  async function handleAutoArrange(dayNumber: number): Promise<void> {
    if (!optimizeResult) return;
    const thatDay = optimizeResult.days.find((d) => d.dayNumber === dayNumber);
    if (!thatDay) return;

    const placeIds = thatDay.visits.map((v) => v.placeId);
    if (placeIds.length === 0) return;

    const body: Record<string, unknown> = {
      placeIds,
      reorder: true,
      dayNumber,
    };
    if (startDate) {
      body.travelDate = startDate;
    }

    const res = await fetch("/api/optimize/day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // DayCard handles its own error display via the thrown error from handleAutoArrange
      throw new Error("自動安排失敗，請稍後再試");
    }

    const { day } = (await res.json()) as {
      day: { dayNumber: number; visits: ScheduledVisit[] };
      unscheduled: Array<{ placeId: string; reason: string }>;
    };

    replaceDay(dayNumber, day);
  }

  // ---------------------------------------------------------------------------
  // Reset to step 1
  // ---------------------------------------------------------------------------
  function handleReset() {
    setRawInputs("");
    setCity("");
    setResolvedPlaces([]);
    setOptimizeResult(null);
    setDurationOverrides({});
    setNumDays("");
    setStartDate("");
    setResolvedCity(null);
    setCityInferred(false);
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
        {loading === "optimizing" && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            重新計算行程中…
          </p>
        )}
        <ResultsLayout
          itinerary={optimizeResult}
          resolvedPlaces={resolvedPlaces}
          detailsById={detailsById}
          onDurationChange={handleDurationChange}
          onAutoArrange={handleAutoArrange}
          dayPlaceAdder={
            <DayPlaceAdder
              resolvedCity={resolvedCity}
              startDate={startDate}
              optimizeResult={optimizeResult}
              resolvedPlaces={resolvedPlaces}
              replaceDay={replaceDay}
              setResolvedPlaces={setResolvedPlaces}
            />
          }
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
                onClick={() => handleOptimize()}
              >
                重試
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {resolvedCity && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              目的地：<span className="font-medium text-foreground">{resolvedCity}</span>
              {cityInferred && <span className="ml-1 text-amber-600">（AI 自動判斷）</span>}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCity(resolvedCity);
                setResolvedPlaces([]);
              }}
            >
              修改城市重新查詢
            </Button>
          </div>
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
            onClick={() => handleOptimize()}
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
  const isResolveDisabled = !rawInputs.trim() || loading === "resolving";

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

        {/* City input — optional; AI infers it when left blank */}
        <div className="space-y-1.5">
          <label
            htmlFor="city"
            className="block text-sm font-medium text-foreground"
          >
            目的地城市（選填）
          </label>
          <Input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="留空將由 AI 自動判斷"
            aria-label="目的地城市"
            className="h-11"
          />
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
            {pendingPlaceCount > 0 && (
              <span className="ml-1">· 將查詢 {pendingPlaceCount} 個地點</span>
            )}
          </p>
        </div>

        {/* Days + start date (optional) */}
        <div className="flex gap-3">
          <div className="space-y-1.5 flex-1">
            <label htmlFor="numDays" className="block text-sm font-medium text-foreground">
              待幾天（選填）
            </label>
            <Input
              id="numDays"
              type="number"
              min={1}
              max={30}
              value={numDays}
              onChange={(e) => setNumDays(e.target.value)}
              placeholder="自動"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5 flex-1">
            <label htmlFor="startDate" className="block text-sm font-medium text-foreground">
              開始日期（選填）
            </label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11"
            />
          </div>
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
