import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "@/components/Providers";
import {
  PRODUCT_BLURB,
  PRODUCT_NAME,
  PRODUCT_SENTENCE,
} from "@/lib/product";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0C1014",
  colorScheme: "dark",
};

const SITE_DESCRIPTION = `${PRODUCT_SENTENCE} ${PRODUCT_BLURB}`;

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: SITE_DESCRIPTION,
  applicationName: PRODUCT_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: PRODUCT_NAME,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/upside-icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "16x16 32x32" },
    ],
    shortcut: "/upside-icon.svg",
    apple: "/icons/icon-192.png",
  },
  openGraph: {
    title: PRODUCT_NAME,
    description: SITE_DESCRIPTION,
    siteName: PRODUCT_NAME,
    type: "website",
    url: siteUrl(),
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: PRODUCT_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_NAME,
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
        className={`${newsreader.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
