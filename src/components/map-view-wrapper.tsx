/**
 * MapViewWrapper — Server Component that gates MapView behind a dynamic import with ssr: false.
 *
 * CRITICAL: This is the ONLY path through which other components should import MapView.
 *   - Never import map-view.tsx directly in a server component (causes "window is not defined").
 *   - Never import map-view.tsx directly in a client component without dynamic + ssr:false.
 *   - This wrapper re-exports MapView with ssr:false so callers stay safe.
 *
 * Pitfall 2 (03-RESEARCH.md): @vis.gl/react-google-maps accesses window.google on import;
 * the ssr:false guard prevents the Node.js "window is not defined" SSR crash.
 *
 * Loading fallback: gray div with "地圖載入中..." matches UI-SPEC placeholder style.
 */

import dynamic from 'next/dynamic';
import type { MapViewProps } from './map-view';

const MapViewComponent = dynamic(
  () => import('./map-view').then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: '100%',
          height: '100%',
          minHeight: 300,
          background: '#f3f4f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
        }}
      >
        <p style={{ color: '#9ca3af', fontSize: 14 }}>地圖載入中...</p>
      </div>
    ),
  }
);

/**
 * MapView — the ssr:false-guarded export.
 *
 * Props are identical to the underlying MapView component (DayWithCoords[]).
 * Import this from map-view-wrapper, never from map-view directly.
 */
export function MapView(props: MapViewProps) {
  return <MapViewComponent {...props} />;
}
