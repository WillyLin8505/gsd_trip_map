"use client";

/**
 * ProgressSteps — 3-step flow indicator for the itinerary planner.
 *
 * Steps (UI-SPEC section 8 / Flow C):
 *   1. 輸入地點
 *   2. 確認地點
 *   3. 查看行程
 *
 * Active step is highlighted in blue-600; prior steps are blue-400 (complete);
 * future steps are gray-300 (inactive).
 *
 * During optimize loading, the loadingLabel prop overrides the active step label
 * with the sequential loading messages from UI-SPEC Flow C:
 *   - "取得地點詳細資訊..."
 *   - "計算行車時間..."
 *   - "最佳化行程順序..."
 *
 * The container uses aria-live="polite" so step changes are announced to
 * screen readers (UI-SPEC section 9 accessibility contract).
 *
 * AUTH-01: No auth imports.
 */

const STEPS = ["輸入地點", "確認地點", "查看行程"] as const;

export interface ProgressStepsProps {
  /** Current active step — 1-based (1 = input, 2 = confirm, 3 = results) */
  current: 1 | 2 | 3;
  /**
   * Optional loading label to replace the active step text during optimization.
   * UI-SPEC Flow C sequential labels:
   *   "取得地點詳細資訊..." | "計算行車時間..." | "最佳化行程順序..."
   */
  loadingLabel?: string;
}

export function ProgressSteps({ current, loadingLabel }: ProgressStepsProps) {
  return (
    <nav
      aria-label="行程規劃步驟"
      aria-live="polite"
      className="w-full mb-6"
    >
      <ol className="flex items-center justify-center gap-0">
        {STEPS.map((step, idx) => {
          const stepNumber = (idx + 1) as 1 | 2 | 3;
          const isActive = stepNumber === current;
          const isComplete = stepNumber < current;
          const isUpcoming = stepNumber > current;

          // Display label — substitute loadingLabel for the active step when provided
          const label = isActive && loadingLabel ? loadingLabel : step;

          return (
            <li key={step} className="flex items-center">
              {/* Step circle + label */}
              <div className="flex flex-col items-center">
                <div
                  className={[
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-blue-600 text-white"
                      : isComplete
                      ? "bg-blue-400 text-white"
                      : "bg-gray-200 text-gray-500",
                  ].join(" ")}
                  aria-current={isActive ? "step" : undefined}
                >
                  {isComplete ? "✓" : stepNumber}
                </div>
                <span
                  className={[
                    "mt-1 text-xs text-center max-w-[72px] leading-tight",
                    isActive
                      ? "text-blue-600 font-medium"
                      : isComplete
                      ? "text-blue-400"
                      : "text-gray-400",
                  ].join(" ")}
                >
                  {label}
                </span>
              </div>

              {/* Connector line between steps */}
              {idx < STEPS.length - 1 && (
                <div
                  className={[
                    "h-0.5 w-12 mx-2 mb-5 transition-colors",
                    isComplete ? "bg-blue-400" : "bg-gray-200",
                  ].join(" ")}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
