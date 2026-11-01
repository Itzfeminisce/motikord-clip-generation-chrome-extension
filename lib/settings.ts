import { DEFAULT_PROVIDER, isProvider } from './providers';
import type { Provider, Settings } from './types';

const STORAGE_KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  ai: 'cloud',
  keySource: null,
  provider: DEFAULT_PROVIDER,
  models: {},
  defaultAspect: '9:16',
  defaultExport: { kind: 'mp4', quality: '1080p' },
  smoothPreview: true,
  libraries: { openverse: true, pexels: true, allLicences: false },
  onboarded: false,
};

type Nested = 'defaultExport' | 'libraries' | 'models';
export type SettingsPatch = Omit<Partial<Settings>, Nested> & { [K in Nested]?: Partial<Settings[K]> };

/** Fills every missing field from the defaults, including inside `defaultExport` and `libraries`. Settings from before providers get Groq. */
export function mergeSettings(stored: SettingsPatch | undefined): Settings {
  const s = stored ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    provider: isProvider(s.provider) ? s.provider : DEFAULT_PROVIDER,
    models: cleanModels(s.models),
    defaultExport: { ...DEFAULT_SETTINGS.defaultExport, ...s.defaultExport },
    libraries: { ...DEFAULT_SETTINGS.libraries, ...s.libraries },
  };
}

function cleanModels(models: SettingsPatch['models']): Settings['models'] {
  const out: Settings['models'] = {};
  for (const [k, v] of Object.entries(models ?? {})) if (isProvider(k) && typeof v === 'string' && v) out[k] = v;
  return out;
}

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return mergeSettings(stored[STORAGE_KEY] as SettingsPatch | undefined);
}

/** Merges top-level fields; `defaultExport`, `libraries` and `models` merge one level deeper. Returns the new settings. */
export async function updateSettings(partial: SettingsPatch): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = mergeSettings({
    ...current,
    ...partial,
    models: { ...current.models, ...partial.models },
    defaultExport: { ...current.defaultExport, ...partial.defaultExport },
    libraries: { ...current.libraries, ...partial.libraries },
  });
  await browser.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

/** Calls `cb` with the full settings whenever they change. Returns an unsubscribe function. */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && STORAGE_KEY in changes) cb(mergeSettings(changes[STORAGE_KEY]!.newValue as SettingsPatch));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** Keys live only in chrome.storage.session under these names; never in the recipe, IndexedDB or a log. */
export type KeyName = Provider | 'pexels';

export async function getKey(name: KeyName): Promise<string | undefined> {
  const stored = await browser.storage.session.get(name);
  const key = stored[name];
  return typeof key === 'string' && key ? key : undefined;
}
export async function setKey(name: KeyName, key: string): Promise<void> {
  await browser.storage.session.set({ [name]: key });
}
export async function clearKey(name: KeyName): Promise<void> {
  await browser.storage.session.remove(name);
}
