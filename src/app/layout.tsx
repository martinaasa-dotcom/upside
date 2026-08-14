import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
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

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08090C",
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
    icon: [{ url: "/upside-icon.svg", type: "image/svg+xml" }],
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
        className={`${plusJakarta.variable} ${jetbrains.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
