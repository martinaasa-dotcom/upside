import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Upside - Portfolio Tracker",
  description:
    "Multi-portfolio tracker with live prices and automated covered-call strike scanning.",
  applicationName: "Upside",
  icons: {
    icon: [{ url: "/upside-icon.svg", type: "image/svg+xml" }],
    shortcut: "/upside-icon.svg",
    apple: "/upside-icon.svg",
  },
  openGraph: {
    title: "Upside - Portfolio Tracker",
    description:
      "Multi-portfolio tracker with live prices and automated covered-call strike scanning.",
    siteName: "Upside",
    type: "website",
    images: [{ url: "/upside-icon.svg", width: 128, height: 128, alt: "Upside" }],
  },
  twitter: {
    card: "summary",
    title: "Upside - Portfolio Tracker",
    description:
      "Multi-portfolio tracker with live prices and automated covered-call strike scanning.",
    images: ["/upside-icon.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
