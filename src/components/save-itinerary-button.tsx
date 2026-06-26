"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { OptimizeResult, ResolvedPlace } from "@/types/itinerary";

/**
 * SaveItineraryButton — persists the current optimizer result for a logged-in user
 * (AUTH-04). Anonymous users (Phase 03) can still plan; on a 401 we direct them to
 * /login. The title is editable; it defaults from the destination city.
 */
export function SaveItineraryButton({
  itinerary,
  resolvedPlaces,
  city,
}: {
  itinerary: OptimizeResult;
  resolvedPlaces: ResolvedPlace[];
  city: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(city ? `${city}行程` : "我的行程");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "needauth">("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Only persist places that actually resolved with coordinates.
  const knownPlaceIds = new Set(resolvedPlaces.map((p) => p.placeId));

  async function handleSave() {
    setError(null);
    setState("saving");

    const payload = {
      title: title.trim() || "我的行程",
      totalDays: itinerary.suggestedDays,
      city: city || undefined,
      days: itinerary.days.map((d) => ({
        dayNumber: d.dayNumber,
        visits: d.visits
          .filter((v) => knownPlaceIds.has(v.placeId))
          .map((v, i) => ({
            placeId: v.placeId,
            orderIndex: i,
            scheduledStart: v.scheduledStart || null,
            scheduledEnd: v.scheduledEnd || null,
            travelFromPrev: v.travelFromPrevMinutes ?? null,
          })),
      })),
    };

    try {
      const res = await fetch("/api/itineraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        setState("needauth");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "儲存失敗，請稍後再試");
        setState("idle");
        return;
      }

      const data = (await res.json()) as { id: string };
      setSavedId(data.id);
      setState("saved");
      router.refresh();
    } catch {
      setError("網路錯誤，請稍後再試");
      setState("idle");
    }
  }

  if (state === "needauth") {
    return (
      <Alert>
        <AlertDescription className="flex items-center gap-2">
          請先登入才能儲存行程。
          <Button asChild size="sm">
            <Link href="/login?next=/">前往登入</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (state === "saved") {
    return (
      <Alert>
        <AlertDescription className="flex items-center gap-2">
          已儲存！
          {savedId && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/itineraries/${savedId}`}>查看</Link>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link href="/itineraries">我的行程</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="行程標題"
          placeholder="行程標題"
          className="max-w-xs"
        />
        <Button onClick={handleSave} disabled={state === "saving"}>
          {state === "saving" ? "儲存中…" : "儲存行程"}
        </Button>
      </div>
    </div>
  );
}
