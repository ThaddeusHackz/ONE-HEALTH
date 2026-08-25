"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_CONTENT, DEFAULT_NAV, type NavItem, type SiteContent } from "@/lib/cms";

interface SiteState {
  content: SiteContent;
  nav: NavItem[];
}

const SiteCtx = createContext<SiteState>({ content: DEFAULT_CONTENT, nav: DEFAULT_NAV });

export function useSite() {
  return useContext(SiteCtx);
}

/**
 * Colours are CMS-editable and land inside a <style> block, so only a bare
 * colour token (hex, rgb()/hsl(), or a plain colour word) is allowed through.
 * Everything else - braces, semicolons, quotes, URLs - falls back to the theme
 * default. That keeps a compromised admin account from injecting CSS rules.
 */
function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^(rgb|rgba|hsl|hsla)\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(\s*,\s*[\d.]+)?\s*\)$/i.test(v)) return v;
  if (/^[a-z]{3,20}$/i.test(v)) return v; // red, teal, goldenrod…
  return fallback;
}

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SiteState>({ content: DEFAULT_CONTENT, nav: DEFAULT_NAV });

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((j) => {
        if (j.content) setState({ content: { ...DEFAULT_CONTENT, ...j.content }, nav: j.nav || DEFAULT_NAV });
      })
      .catch(() => undefined);
  }, []);

  const c = state.content;
  const colors = {
    colorGreen: safeColor(c.colorGreen, DEFAULT_CONTENT.colorGreen),
    colorGold: safeColor(c.colorGold, DEFAULT_CONTENT.colorGold),
    colorRed: safeColor(c.colorRed, DEFAULT_CONTENT.colorRed),
    colorTeal: safeColor(c.colorTeal, DEFAULT_CONTENT.colorTeal),
    colorInk: safeColor(c.colorInk, DEFAULT_CONTENT.colorInk),
  };

  return (
    <SiteCtx.Provider value={state}>
      <style>{`
        :root {
          --color-ghana-green: ${colors.colorGreen};
          --color-ghana-gold: ${colors.colorGold};
          --color-ghana-red: ${colors.colorRed};
          --color-teal: ${colors.colorTeal};
          --color-ink: ${colors.colorInk};
        }
      `}</style>
      {children}
    </SiteCtx.Provider>
  );
}
