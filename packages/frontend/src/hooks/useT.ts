"use client";

import { useCallback } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { t } from "@/lib/i18n";

export function useT() {
  const locale = useSettingsStore((s) => s.locale);
  return useCallback((key: string) => t(key, locale), [locale]);
}
