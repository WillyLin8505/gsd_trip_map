import { PlaceResolverForm } from "@/components/place-resolver-form";

/**
 * Home page — server component.
 * Renders the client-side PlaceResolverForm which handles the
 * full resolve flow: input → POST /api/places/resolve → display results.
 */
export default function HomePage() {
  return (
    <main className="flex-1 py-8">
      <PlaceResolverForm />
    </main>
  );
}
