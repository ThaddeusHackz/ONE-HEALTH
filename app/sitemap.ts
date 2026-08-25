import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://one-health-ghana.onrender.com";
  return ["", "/agent", "/forecast", "/surveillance", "/climate", "/intelligence", "/vision", "/extracts", "/field", "/regions", "/workbook"].map((p) => ({
    url: `${base}${p || "/"}`,
    changeFrequency: "weekly",
    priority: p === "" ? 1 : p === "/agent" ? 0.9 : 0.7,
  }));
}
