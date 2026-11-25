"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

/** App-wide providers. Keep this lean: everything here ships on every page. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
