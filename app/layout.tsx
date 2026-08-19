import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { SiteProvider } from "@/components/SiteProvider";
import "./globals.css";

function safeSiteUrl() {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  try {
    return new URL(raw || "https://one-health-ghana.onrender.com");
  } catch {
    return new URL("https://one-health-ghana.onrender.com");
  }
}

export const metadata: Metadata = {
  title: {
    default: "ONE HEALTH GHANA — National Disease Forecasting",
    template: "%s · ONE HEALTH GHANA",
  },
  description:
    "Ghana Health Service One Health platform: probabilistic disease forecasts, document vision, voice, and early warning for Ghana only.",
  metadataBase: safeSiteUrl(),
  openGraph: {
    title: "ONE HEALTH GHANA",
    description: "National forecasting and early warning for Ghana Health Services.",
    images: ["/images/hero-clinic.png"],
  },
  icons: { icon: "/images/logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SiteProvider>
          <Nav />
          <main>{children}</main>
          <Footer />
        </SiteProvider>
      </body>
    </html>
  );
}
