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

  return (
    <SiteCtx.Provider value={state}>
      <style>{`
        :root {
          --color-ghana-green: ${c.colorGreen};
          --color-ghana-gold: ${c.colorGold};
          --color-ghana-red: ${c.colorRed};
          --color-teal: ${c.colorTeal};
          --color-ink: ${c.colorInk};
        }
      `}</style>
      {children}
    </SiteCtx.Provider>
  );
}
