"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * ShareControls — toggle public sharing for a saved itinerary (AUTH-05).
 *
 * Toggling on/off calls PATCH /api/itineraries/:id. Visibility is enforced
 * server-side: when sharing is off, /share/:token returns 404 (not just hidden).
 * When on, the public link is shown with a copy button.
 */
export function ShareControls({
  itineraryId,
  initialIsPublic,
  shareToken,
}: {
  itineraryId: string;
  initialIsPublic: boolean;
  shareToken: string | null;
}) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== "undefined" && shareToken
      ? `${window.location.origin}/share/${shareToken}`
      : "";

  async function toggle() {
    setError(null);
    setBusy(true);
    const next = !isPublic;
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: next }),
      });
      if (!res.ok) {
        setError("更新分享設定失敗");
        return;
      }
      setIsPublic(next);
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — user can select the input manually.
    }
  }

  return (
    <div className="rounded-lg border bg-white p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">公開分享</span>
          <span className="ml-2 text-muted-foreground">
            {isPublic ? "任何持有連結的人都能檢視（唯讀）" : "目前為私人，僅你可檢視"}
          </span>
        </div>
        <Button onClick={toggle} disabled={busy} variant={isPublic ? "outline" : "default"} size="sm">
          {busy ? "處理中…" : isPublic ? "停止分享" : "建立分享連結"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isPublic && shareUrl && (
        <div className="flex gap-2">
          <Input readOnly value={shareUrl} aria-label="分享連結" className="text-sm" />
          <Button onClick={copy} variant="outline" size="sm">
            {copied ? "已複製" : "複製"}
          </Button>
        </div>
      )}
    </div>
  );
}
