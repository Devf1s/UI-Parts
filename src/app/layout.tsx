import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { geistMono } from "@/fonts/geist-mono";
import { SITE } from "@/site/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: SITE.url,
  title: { default: SITE.title, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.name, url: "https://github.com/Devf1s" }],
  openGraph: { type: "website", siteName: SITE.name, locale: SITE.locale, title: SITE.title, description: SITE.description, images: [SITE.image] },
  twitter: { card: "summary_large_image", title: SITE.title, description: SITE.description, images: [SITE.image] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: SITE.themeColor.light },
    { media: "(prefers-color-scheme: dark)", color: SITE.themeColor.dark },
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
