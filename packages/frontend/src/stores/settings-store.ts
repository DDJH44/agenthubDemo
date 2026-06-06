"use client";

import { create } from "zustand";
import type { Locale } from "@/lib/i18n";

export type Theme = "light" | "dark" | "coze-dark";

interface SettingsStore {
  locale: Locale;
  theme: Theme;
  hydrated: boolean;
  toggleLocale: () => void;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  hydrate: () => void;
}

function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

function applyLocale(locale: Locale) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  locale: "zh",
  theme: "light",
  hydrated: false,

  toggleLocale: () =>
    set((s) => {
      const next = s.locale === "zh" ? "en" : "zh";
      if (typeof window !== "undefined") localStorage.setItem("agenthub-locale", next);
      applyLocale(next);
      return { locale: next };
    }),

  setLocale: (locale) => {
    if (typeof window !== "undefined") localStorage.setItem("agenthub-locale", locale);
    applyLocale(locale);
    set({ locale });
  },

  setTheme: (theme) => {
    if (typeof window !== "undefined") localStorage.setItem("agenthub-theme", theme);
    applyTheme(theme);
    set({ theme });
  },

  toggleTheme: () => {
    const next = get().theme === "light" ? "dark" : "light";
    get().setTheme(next);
  },

  hydrate: () => {
    if (typeof window !== "undefined") {
      const storedLocale = localStorage.getItem("agenthub-locale") as Locale | null;
      const storedTheme = localStorage.getItem("agenthub-theme") as Theme | null;
      const theme: Theme = (storedTheme === "dark" || storedTheme === "coze-dark") ? storedTheme : "light";
      const locale = storedLocale === "zh" || storedLocale === "en" ? storedLocale : "zh";
      applyTheme(theme);
      applyLocale(locale);
      set({
        locale,
        theme,
        hydrated: true,
      });
    }
  },
}));
