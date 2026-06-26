import { PlaceInputPanel } from "@/components/place-input-panel";

/**
 * Home page — server component.
 *
 * Renders the client-side PlaceInputPanel which manages the full anonymous
 * 3-step flow: input → resolve → confirm → optimize → itinerary view.
 *
 * AUTH-01: No auth checks. Accessible to unauthenticated users.
 */
export default function HomePage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <PlaceInputPanel />
    </main>
  );
}
