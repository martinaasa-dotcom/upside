import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Upside - Portfolio Tracker",
  description:
    "Live portfolio book with covered-call targets and Assistant Margus.",
  applicationName: "Upside",
  icons: {
    icon: [{ url: "/upside-icon.svg", type: "image/svg+xml" }],
    shortcut: "/upside-icon.svg",
    apple: "/upside-icon.svg",
  },
  openGraph: {
    title: "Upside - Portfolio Tracker",
    description:
      "Live portfolio book with covered-call targets and Assistant Margus.",
    siteName: "Upside",
    type: "website",
    url: "https://upside-upthink-solutions.vercel.app",
    images: [{ url: "/upside-icon.svg", width: 128, height: 128, alt: "Upside mark" }],
  },
  twitter: {
    card: "summary",
    title: "Upside - Portfolio Tracker",
    description:
      "Live portfolio book with covered-call targets and Assistant Margus.",
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
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
