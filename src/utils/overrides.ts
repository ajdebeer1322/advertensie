import type { AppSettings, CustomElement } from '../types';

export function imageKey(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim();
}

/** Merge an override object onto base settings.
 * Custom elements in the override merge by id (override wins per element);
 * everything else is a shallow override. */
export function mergeOverride(
  base: AppSettings,
  override: Partial<AppSettings> | undefined,
): AppSettings {
  if (!override) return base;
  const merged: AppSettings = { ...base, ...override };
  if (override.customElements) {
    const byId = new Map(base.customElements.map((e) => [e.id, e] as const));
    for (const o of override.customElements) {
      const existing = byId.get(o.id);
      byId.set(o.id, existing ? ({ ...existing, ...o } as CustomElement) : o);
    }
    merged.customElements = Array.from(byId.values());
  }
  return merged;
}
