import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://one-health-ghana.onrender.com";
  return ["", "/forecast", "/surveillance", "/climate", "/intelligence", "/vision", "/regions", "/workbook"].map((p) => ({
    url: `${base}${p || "/"}`,
    changeFrequency: "weekly",
    priority: p === "" ? 1 : 0.7,
  }));
}
