import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StatesVoice, { VoiceUnavailable, voiceFooterLine, voiceSettingsLine } from './StatesVoice';

describe('StatesVoice', () => {
  const html = renderToStaticMarkup(<StatesVoice />).replace(/<!-- -->/g, '');
  it('renders every voice state with the frame copy', () => {
    for (const text of [
      'Let Motikord hear you', 'Allow microphone', 'Type instead', 'Allow your microphone', 'The microphone is blocked', 'Open Chrome settings',
      'No microphone found', 'Didn’t catch that', 'Nothing was heard for 8 seconds.', 'Getting voice typing ready…', 'Voice typing isn’t available here',
      'Listening… Done puts the words in the box. Press send when they look right.', 'Speech becomes text on this computer. No recording is kept.',
    ]) expect(html).toContain(text);
  });
  it('names the provider in use', () => {
    expect(voiceFooterLine({ kind: 'cloud', provider: 'openai' })).toBe('Your voice goes to OpenAI to become text. Motikord keeps no recording.');
    expect(voiceSettingsLine({ kind: 'unavailable' }, 'anthropic')).toBe('Voice typing isn’t available with Anthropic on this computer.');
    expect(renderToStaticMarkup(<VoiceUnavailable provider="openrouter" />)).toContain('and OpenRouter doesn’t offer it.');
  });
});
