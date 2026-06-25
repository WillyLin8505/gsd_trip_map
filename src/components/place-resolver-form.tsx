"use client";

import { useState } from "react";
import type { ResolvedPlace } from "@/lib/validation/resolve";

/**
 * PlaceResolverForm
 *
 * Client component that:
 * 1. Accepts a multi-line list of place names (one per line) — INPUT-01
 * 2. Accepts a required destination city — INPUT-03 (enforced before lookup)
 * 3. POSTs to /api/places/resolve
 * 4. Displays resolved displayName + formattedAddress for confirmation — INPUT-04
 *
 * Security: Does NOT import or reference GOOGLE_PLACES_API_KEY or SUPABASE_SERVICE_ROLE_KEY.
 * All sensitive operations are proxied through the server route handler.
 */
export function PlaceResolverForm() {
  const [inputText, setInputText] = useState("");
  const [city, setCity] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ResolvedPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResults(null);
    setIsLoading(true);

    // Parse multi-line input into array of non-empty strings
    const inputs = inputText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (inputs.length === 0) {
      setError("請輸入至少一個地點名稱");
      setIsLoading(false);
      return;
    }

    if (!city.trim()) {
      setError("請輸入目的地城市");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/places/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs,
          city: city.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "解析失敗，請稍後再試");
        return;
      }

      setResults(data as ResolvedPlace[]);
    } catch (err) {
      setError("網路錯誤，請稍後再試");
      console.error("Place resolve error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">旅遊行程規劃器</h1>
      <p className="text-gray-600 mb-6">
        輸入景點名稱，系統自動查詢地點資訊
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* City input — required for locationBias (INPUT-03) */}
        <div>
          <label
            htmlFor="city"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            目的地城市 <span className="text-red-500">*</span>
          </label>
          <input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="例如：台北市、高雄市、京都市"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            必填，用於縮小地點搜尋範圍
          </p>
        </div>

        {/* Multi-line place input (INPUT-01) */}
        <div>
          <label
            htmlFor="places"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            地點清單 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="places"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={6}
            placeholder={"每行輸入一個地點名稱，例如：\n台北101\n故宮博物院\n士林夜市"}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            每行輸入一個地點名稱（中文名稱）
          </p>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "查詢中..." : "查詢地點資訊"}
        </button>
      </form>

      {/* Error state */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Results display (INPUT-04: show resolved name + address for confirmation) */}
      {results !== null && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-3">
            查詢結果 ({results.length} 個地點)
          </h2>
          {results.length === 0 ? (
            <p className="text-gray-500">沒有找到符合的地點</p>
          ) : (
            <ul className="space-y-3">
              {results.map((place, index) => (
                <li
                  key={place.placeId}
                  className="p-4 bg-white border border-gray-200 rounded-md shadow-sm"
                >
                  <p className="font-medium text-gray-900">
                    {index + 1}. {place.displayName}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {place.formattedAddress}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    座標：{place.lat.toFixed(6)}, {place.lng.toFixed(6)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
