'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * ThemeProvider wrapper around next-themes.
 *
 * - attribute="class" — applies "dark" class to <html> (matches shadcn/ui dark mode)
 * - defaultTheme="light" — always start in light mode
 * - enableSystem={false} — ignore OS dark-mode preference (Phase 3 is light-only)
 *
 * Phase 4 will add the dark mode toggle UI. This provider only installs the
 * infrastructure so layout.tsx doesn't need to change in Phase 4.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
    >
      {children}
    </NextThemesProvider>
  );
}
