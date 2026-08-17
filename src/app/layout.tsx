import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "@/components/Providers";
import { WebVitals } from "@/components/WebVitals";
import { PRODUCT_NAME } from "@/lib/product";
import {
  OG_IMAGE,
  PUBLIC_ROBOTS,
  SITE_DESCRIPTION,
} from "@/lib/site-metadata";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08090c",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: PRODUCT_NAME,
    template: `%s · ${PRODUCT_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: PRODUCT_NAME,
  manifest: "/manifest.webmanifest",
  robots: PUBLIC_ROBOTS,
  alternates: {
    canonical: siteUrl(),
  },
  appleWebApp: {
    capable: true,
    title: PRODUCT_NAME,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    icon: [
      { url: "/upside-icon.svg?v=2", type: "image/svg+xml" },
      { url: "/icons/icon-32.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico?v=2", sizes: "16x16 32x32" },
    ],
    shortcut: "/upside-icon.svg?v=2",
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      { url: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
    ],
  },
  openGraph: {
    title: PRODUCT_NAME,
    description: SITE_DESCRIPTION,
    siteName: PRODUCT_NAME,
    locale: "en_US",
    type: "website",
    url: siteUrl(),
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_NAME,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-timezone="Europe/Tallinn">
      <body
        className={`${inter.variable} ${montserrat.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        <WebVitals />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
