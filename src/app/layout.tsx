import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { geistMono } from "@/fonts/geist-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "UI parts — sidebar & venom button",
  description: "Animated sidebar and a liquid “venom” cursor button. Next.js + TypeScript + Tailwind + Motion.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#08080b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistMono.variable} antialiased`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
