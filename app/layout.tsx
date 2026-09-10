import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import EcosystemAnalytics from "./components/EcosystemAnalytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Find Radar — Find what you're looking for",
  description:
    "Lost & Found, product discovery and restock monitoring in one radar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/maplibre-gl@6.7.0/dist/maplibre-gl.css"
        />
      </head>

      <body>
        <EcosystemAnalytics />
        {children}
      </body>
    </html>
  );
}
