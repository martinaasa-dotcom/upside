import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "@/components/Providers";
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

const SITE_DESCRIPTION =
  "Track your portfolio with covered-call targets and Assistant Margus. Plus Upside Portfolio, an AI-managed $50k paper fund with every trade reasoned out loud, live in the open.";

export const metadata: Metadata = {
  title: "Upside - Portfolio Tracker & AI-Managed Fund",
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
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Upside - Portfolio Tracker & AI-Managed Fund",
    description: SITE_DESCRIPTION,
    siteName: "Upside",
    type: "website",
    url: "https://upside-upthink-solutions.vercel.app",
    images: [{ url: "/upside-icon.svg", width: 128, height: 128, alt: "Upside mark" }],
  },
  twitter: {
    card: "summary",
    title: "Upside - Portfolio Tracker & AI-Managed Fund",
    description: SITE_DESCRIPTION,
    images: ["/upside-icon.svg"],
  },
  metadataBase: new URL("https://upside-upthink-solutions.vercel.app"),
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
