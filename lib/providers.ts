import type { Provider } from './types';

/** What each cloud AI provider is called and where its keys come from. Strings are FRAMES.md "AI provider and model". */
export interface ProviderInfo {
  id: Provider;
  label: string;          // {provider}
  settingsLabel: string;  // the Settings radio row
  prefix: string;         // {prefix}
  keyName: 'GROQ_API_KEY' | 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY' | 'OPENROUTER_API_KEY'; // {keyName}
  host: string;           // {host}
  keysUrl: string;
  getKey: string;         // "Get a free Groq key"; only Groq says "free"
}

export const PROVIDERS: Record<Provider, ProviderInfo> = {
  groq: { id: 'groq', label: 'Groq', settingsLabel: 'Groq (free tier)', prefix: 'gsk_', keyName: 'GROQ_API_KEY', host: 'api.groq.com', keysUrl: 'https://console.groq.com/keys', getKey: 'Get a free Groq key' },
  openai: { id: 'openai', label: 'OpenAI', settingsLabel: 'OpenAI', prefix: 'sk-', keyName: 'OPENAI_API_KEY', host: 'api.openai.com', keysUrl: 'https://platform.openai.com/api-keys', getKey: 'Get an OpenAI key' },
  anthropic: { id: 'anthropic', label: 'Anthropic', settingsLabel: 'Anthropic', prefix: 'sk-ant-', keyName: 'ANTHROPIC_API_KEY', host: 'api.anthropic.com', keysUrl: 'https://console.anthropic.com/settings/keys', getKey: 'Get an Anthropic key' },
  openrouter: { id: 'openrouter', label: 'OpenRouter', settingsLabel: 'OpenRouter (many models)', prefix: 'sk-or-', keyName: 'OPENROUTER_API_KEY', host: 'openrouter.ai', keysUrl: 'https://openrouter.ai/keys', getKey: 'Get an OpenRouter key' },
};

/** Settings and Setup order; Groq is the default. */
/** "a Groq key", "an OpenAI key". */
export const withArticle = (name: string) => `${/^[AEIOU]/i.test(name) ? 'an' : 'a'} ${name}`;

export const PROVIDER_IDS: Provider[] = ['groq', 'openai', 'anthropic', 'openrouter'];
export const DEFAULT_PROVIDER: Provider = 'groq';

export const isProvider = (v: unknown): v is Provider => typeof v === 'string' && (PROVIDER_IDS as string[]).includes(v);

/** The provider whose Penv Cloud key name this is, or undefined (Pexels). */
export function providerForKey(name: string): Provider | undefined {
  return PROVIDER_IDS.find((p) => PROVIDERS[p].keyName === name);
}
