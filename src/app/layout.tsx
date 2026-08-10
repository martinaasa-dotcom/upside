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
  title: "Upside — Portfolio & Covered Calls",
  description:
    "Multi-portfolio tracker with live prices and automated covered-call strike scanning.",
  applicationName: "Upside",
  openGraph: {
    title: "Upside — Portfolio & Covered Calls",
    description:
      "Multi-portfolio tracker with live prices and automated covered-call strike scanning.",
    siteName: "Upside",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Upside — Portfolio & Covered Calls",
    description:
      "Multi-portfolio tracker with live prices and automated covered-call strike scanning.",
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
