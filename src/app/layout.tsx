import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "@/components/Providers";
import { PRODUCT_BLURB, PRODUCT_SENTENCE } from "@/lib/product";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#121214",
  colorScheme: "dark",
};

const SITE_DESCRIPTION = `${PRODUCT_SENTENCE} ${PRODUCT_BLURB}`;

export const metadata: Metadata = {
  title: "Upside",
  description: SITE_DESCRIPTION,
  applicationName: "Upside",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Upside",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/upside-icon.svg", type: "image/svg+xml" }],
    shortcut: "/upside-icon.svg",
    apple: "/icons/icon-192.png",
  },
  openGraph: {
    title: "Upside",
    description: SITE_DESCRIPTION,
    siteName: "Upside",
    type: "website",
    url: siteUrl(),
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Upside",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Upside",
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
  metadataBase: new URL(siteUrl()),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-timezone="Europe/Tallinn">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
