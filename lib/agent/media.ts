import { imageModels, openRouterKey, openRouterReferer, openRouterTitle, unsplashKey } from "@/lib/env";

/* ------------------------------------------------------------------ *
 * Stock imagery - Unsplash first, Tavily image results as fallback.
 * ------------------------------------------------------------------ */

export interface StockImage {
  url: string;
  thumb: string;
  alt: string;
  author: string;
  link: string;
  source: "unsplash" | "tavily";
}

export async function unsplashSearch(query: string, count = 6): Promise<{ images: StockImage[]; engine: string }> {
  const key = unsplashKey();
  const per = Math.min(Math.max(count, 1), 12);
  if (key) {
    try {
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
        query,
      )}&per_page=${per}&orientation=landscape&content_filter=high`;
      const res = await fetch(url, {
        headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      });
      if (res.ok) {
        const json = (await res.json()) as {
          results?: {
            urls?: { regular?: string; small?: string; raw?: string };
            alt_description?: string | null;
            description?: string | null;
            links?: { html?: string };
            user?: { name?: string };
          }[];
        };
        const images = (json.results || []).map((r) => ({
          url: r.urls?.regular || r.urls?.raw || "",
          thumb: r.urls?.small || r.urls?.regular || "",
          alt: r.alt_description || r.description || query,
          author: r.user?.name || "Unsplash",
          link: r.links?.html || "https://unsplash.com",
          source: "unsplash" as const,
        })).filter((i) => i.url);
        if (images.length) return { images, engine: "unsplash" };
      }
    } catch {
      /* fall through to Tavily */
    }
  }

  // No Unsplash key (or an exhausted one): reuse Tavily's image results.
  try {
    const tavilyKey = process.env.TAVILY_API_KEY || process.env.TAVILY_KEY || "";
    if (!tavilyKey) return { images: [], engine: "none" };
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tavilyKey}` },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: `${query} photograph`,
        max_results: 5,
        include_images: true,
        include_image_descriptions: true,
      }),
    });
    if (!res.ok) return { images: [], engine: "none" };
    const json = (await res.json()) as { images?: { url?: string; description?: string }[] | string[] };
    const images = (json.images || [])
      .map((img) =>
        typeof img === "string"
          ? { url: img, alt: query, source: "tavily" as const }
          : { url: img.url || "", alt: img.description || query, source: "tavily" as const },
      )
      .filter((i) => i.url)
      .map((i) => ({ ...i, thumb: i.url, author: "Web", link: i.url, source: "tavily" as const }));
    return { images: images.slice(0, per), engine: images.length ? "tavily-images" : "none" };
  } catch {
    return { images: [], engine: "none" };
  }
}

/* ------------------------------------------------------------------ *
 * AI image generation - OpenRouter Unified Image API
 *   POST /api/v1/images  ->  { data: [{ b64_json }], usage }
 * Fallback: chat completions with modalities:["image","text"] for models that
 * still return images inside message.images[].
 * ------------------------------------------------------------------ */

export const IMAGE_MODEL_CHAIN = [
  "google/gemini-2.5-flash-image",
  "bytedance-seed/seedream-4.5",
  "openai/gpt-image-1",
  "black-forest-labs/flux.2-flex",
  "google/gemini-3-pro-image-preview",
  "qwen/qwen-image",
  "recraftai/recraft-v3",
];

export interface GeneratedImage {
  dataUrl: string;
  model: string;
  prompt: string;
  bytes: number;
  cost?: number;
}

export async function generateImage(opts: {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  size?: string;
  reference?: string;
}): Promise<GeneratedImage> {
  const key = openRouterKey();
  if (!key) throw new Error("OPENROUTER_API_KEY is not set - image generation needs it.");

  const chain = [opts.model, ...imageModels(), ...IMAGE_MODEL_CHAIN]
    .filter((m): m is string => Boolean(m))
    .filter((m, i, arr) => arr.indexOf(m) === i);

  const errors: string[] = [];

  for (const model of chain) {
    try {
      const body: Record<string, unknown> = { model, prompt: opts.prompt.slice(0, 2000) };
      if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
      if (opts.size) body.size = opts.size;
      if (opts.reference) {
        body.input_references = [{ type: "image_url", image_url: { url: opts.reference } }];
      }

      const res = await fetch("https://openrouter.ai/api/v1/images", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": openRouterReferer(),
          "X-Title": openRouterTitle(),
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { b64_json?: string; url?: string }[];
        usage?: { cost?: number };
        error?: { message?: string };
      };

      if (res.ok && json.data?.length) {
        const first = json.data[0];
        const b64 = first.b64_json;
        if (b64) {
          const buf = Buffer.from(b64, "base64");
          return {
            dataUrl: `data:image/png;base64,${b64}`,
            model,
            prompt: opts.prompt,
            bytes: buf.length,
            cost: json.usage?.cost,
          };
        }
        if (first.url) {
          const remote = await fetch(first.url);
          if (remote.ok) {
            const arr = new Uint8Array(await remote.arrayBuffer());
            return {
              dataUrl: `data:image/png;base64,${Buffer.from(arr).toString("base64")}`,
              model,
              prompt: opts.prompt,
              bytes: arr.length,
              cost: json.usage?.cost,
            };
          }
        }
      }
      errors.push(`${model}: ${json.error?.message || `HTTP ${res.status}`}`);
      if (res.status === 401 || res.status === 402) break;
    } catch (err) {
      errors.push(`${model}: ${(err as Error).message}`);
    }
  }

  // Chat-completions image fallback (some providers only expose images there).
  try {
    const chatImage = await generateViaChat({ prompt: opts.prompt, aspectRatio: opts.aspectRatio });
    if (chatImage) return chatImage;
  } catch (err) {
    errors.push(`chat-modalities: ${(err as Error).message}`);
  }

  throw new Error(`Image generation failed. ${errors.slice(0, 4).join(" | ")}`);
}

async function generateViaChat(opts: {
  prompt: string;
  aspectRatio?: string;
}): Promise<GeneratedImage | null> {
  const key = openRouterKey();
  const models = ["google/gemini-2.5-flash-image", "openai/gpt-4o", "black-forest-labs/flux.2-flex"];
  for (const model of models) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": openRouterReferer(),
        "X-Title": openRouterTitle(),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: opts.prompt }],
        modalities: ["image", "text"],
        ...(opts.aspectRatio ? { aspect_ratio: opts.aspectRatio } : {}),
      }),
    });
    if (!res.ok) continue;
    const json = (await res.json()) as {
      choices?: { message?: { images?: { image_url?: { url?: string }; type?: string }[] } }[];
      model?: string;
    };
    const images = json.choices?.[0]?.message?.images || [];
    const url = images.find((i) => i.image_url?.url)?.image_url?.url;
    if (url?.startsWith("data:")) {
      const b64 = url.slice(url.indexOf(",") + 1);
      return {
        dataUrl: url,
        model: json.model || model,
        prompt: opts.prompt,
        bytes: Math.floor((b64.length * 3) / 4),
      };
    }
  }
  return null;
}
