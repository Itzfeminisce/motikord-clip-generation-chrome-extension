import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PRIVACY_ROWS } from './Privacy';
import StatesSetup, { KeyRejected, KeyWrongProvider, PenvNoUsableKeys, ProviderAccess } from './StatesSetup';

describe('StatesSetup', () => {
  const html = renderToStaticMarkup(<StatesSetup />);
  it('renders every state with the frame copy', () => {
    for (const text of [
      'no-built-in-ai · Setup, Settings', 'Chrome’s built-in AI isn’t on this computer', 'The preview may be slow on this computer', 'Exports will take longer here',
      'Allow Motikord to reach Groq', 'Penv Cloud didn’t connect', 'No Groq key was shared with Motikord', 'Penv Cloud was disconnected',
      'Motikord doesn’t recognise this key', 'Groq didn’t accept this key', 'This is a Groq key · Checking…', 'pexels-key-rejected · Paste a key', 'Pexels didn’t accept this key', 'Media search still works with Openverse. Make a new Pexels key and paste it here.',
      'provider-access · first “Make clip” (Chrome asks once)', 'Chrome asks once. Only your prompt and the clip’s text are sent to api.groq.com.',
      'Add GROQ_API_KEY in Penv Cloud and choose it for Motikord, or paste one here.', 'It isn’t a Groq or Pexels key. Groq keys start with gsk_. Check you copied all of it.',
      'model-list-loading · Settings (Model)', 'Loading Groq’s models…', 'The Model list is greyed out for a moment. Your current choice, llama-3.3-70b-versatile, stays selected.',
      'model-list-failed · Settings (Model)', 'Couldn’t load Groq’s models', 'Your current choice, llama-3.3-70b-versatile, still works for clips. Check your connection, then ask again.',
      'model-needs-key · Settings (Model)', 'Add a Groq key to see its models', 'The list comes from Groq, so it needs your key first. Until then Motikord uses llama-3.3-70b-versatile.', 'Use Penv Cloud',
      'key-wrong-provider · Paste a key', 'This looks like an OpenAI key', 'You chose Groq, and its keys start with gsk_. Paste a Groq key, or switch provider to OpenAI.', 'Switch to OpenAI', 'Get a free Groq key',
      'key-check-unreachable · PasteKey', 'Motikord can’t check your key right now', 'Your key is kept until Chrome closes, and Motikord will check it again as soon as it’s back.',
    ]) expect(html).toContain(text.replace(/’/g, '’'));
  });
  it('names the chosen provider, its prefix, key name, host and key page', () => {
    const r = renderToStaticMarkup;
    expect(r(<ProviderAccess provider="anthropic" />)).toContain('sent to api.anthropic.com.');
    expect(r(<PenvNoUsableKeys provider="openrouter" />)).toContain('Add OPENROUTER_API_KEY in Penv Cloud');
    expect(r(<KeyRejected provider="openai" />)).toContain('OpenAI didn’t accept this key');
    expect(r(<KeyRejected provider="openai" />)).toContain('Get an OpenAI key');
    expect(r(<KeyWrongProvider provider="anthropic" detected="groq" />)).toContain('its keys start with sk-ant-.');
  });
  it('has the seven privacy rows', () => {
    expect(PRIVACY_ROWS).toHaveLength(7);
  });
});
