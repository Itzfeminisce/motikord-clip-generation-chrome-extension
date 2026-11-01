import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { HOSTS, requestHost } from '../lib/hostAccess';
import { FALLBACK_MODEL, listModels } from '../lib/llm';
import { PROVIDER_IDS, PROVIDERS } from '../lib/providers';
import { useRouter } from '../entrypoints/sidepanel/router';
import { Button } from '../components/ui';
import { getBrandKit } from '../lib/db';
import { chooseFolder } from '../lib/folder';
import { loadKeys } from '../lib/keys';
import { getSettings, onSettingsChanged, updateSettings, type SettingsPatch } from '../lib/settings';
import type { BrandKit, FileKind, Provider, Quality, Settings as SettingsData } from '../lib/types';
import { CODE_URL } from './Privacy';
import { BackButton, probeMachine, RowStatus } from './Setup';
import { ModelListFailed, ModelListLoading, ModelNeedsKey, NoBuiltInAi } from './StatesSetup';

const KINDS: [FileKind, string][] = [['mp4', 'MP4'], ['webm', 'WebM'], ['webm-alpha', 'See-through WebM'], ['gif', 'GIF']];
const QUALITIES: Quality[] = ['1080p', '720p'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <span className="mono" style={{ margin: '20px 24px 8px', fontSize: 11, color: 'var(--faint)' }}>{title}</span>
      <div style={{ margin: '0 24px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </>
  );
}

const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', border: 0, borderTop: '1px solid var(--line)', color: 'inherit', textDecoration: 'none', font: 'inherit', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' } as const;
const first = { borderTop: 0 } as const;
const text = (title: string, hint?: ReactNode) => (
  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
    {hint && <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--muted)' }}>{hint}</span>}
  </span>
);
const chevron = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;

function Switch({ label, hint, checked, onChange, top }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; top?: boolean }) {
  return (
    <label style={{ ...rowStyle, ...(top ? first : null), cursor: 'pointer' }}>
      {text(label, hint)}
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 36, height: 20, flexShrink: 0 }} />
    </label>
  );
}

type ModelState = { kind: 'needs-key' } | { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; models: string[]; recommended: string };

/** The provider's model list for the Model dropdown. `load(true)` first asks Chrome for the host, so call it from a click. */
function useModels(provider: Provider, key: string | undefined, asked?: Promise<unknown>) {
  const [state, setState] = useState<ModelState>({ kind: key ? 'loading' : 'needs-key' });
  const run = useRef(0);
  const load = useCallback((ask: boolean) => {
    const mine = ++run.current;
    if (!key) return setState({ kind: 'needs-key' });
    // No await before the request, so a click still counts as the gesture.
    const access: Promise<unknown> = ask ? requestHost(HOSTS[provider]) : asked ?? Promise.resolve();
    setState({ kind: 'loading' });
    access
      .then(() => listModels(provider, key))
      .then((list) => { if (mine === run.current) setState({ kind: 'ready', ...list }); })
      .catch(() => { if (mine === run.current) setState({ kind: 'failed' }); });
  }, [provider, key, asked]);
  useEffect(() => { load(false); }, [load]);
  return { state, load };
}

function ModelSection({ s, keys, set, asked }: { s: SettingsData; keys: Record<string, string>; set: (patch: SettingsPatch) => void; asked?: Promise<unknown> }) {
  const { navigate } = useRouter();
  const provider = s.provider;
  const label = PROVIDERS[provider].label;
  const { state, load } = useModels(provider, keys[PROVIDERS[provider].keyName], asked);
  const chosen = s.models[provider];
  const models = state.kind === 'ready' ? state.models : [];
  // A pick the provider no longer lists falls back to the recommended model without a warning.
  const current = state.kind === 'ready' ? (chosen && models.includes(chosen) ? chosen : state.recommended) : chosen ?? FALLBACK_MODEL[provider];
  const options = state.kind === 'ready' ? models : [current];
  return (
    <>
      <span className="mono" style={{ margin: '20px 24px 8px', fontSize: 11, color: 'var(--faint)' }}>Model</span>
      <div style={{ margin: '0 24px', padding: '12px 14px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 500, flexGrow: 1 }}>{`Model from ${label}`}</span>
          <select aria-label="Model" value={current} disabled={state.kind !== 'ready'} onChange={(e) => set({ models: { [provider]: e.target.value } })}
            className="mono" style={{ height: 34, maxWidth: 220, minWidth: 0, borderRadius: 8, border: '1px solid var(--line-strong)', background: 'var(--surface)', font: '12px var(--mono)', color: 'var(--ink)', opacity: state.kind === 'ready' ? 1 : 0.6 }}>
            {options.map((id, i) => <option key={id} value={id}>{state.kind === 'ready' && i === 0 ? `${id} · Recommended` : id}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--muted)' }}>{`Pick a large, strong model for the best clips. Small models are faster but write simpler clips. Motikord asks ${label} for its current list.`}</span>
      </div>
      {state.kind !== 'ready' && (
        <div style={{ margin: '10px 24px 0' }}>
          {state.kind === 'loading' && <ModelListLoading provider={provider} model={current} />}
          {state.kind === 'failed' && <ModelListFailed provider={provider} model={current} onTryAgain={() => load(true)} />}
          {state.kind === 'needs-key' && <ModelNeedsKey provider={provider} model={current} onPaste={() => navigate('PasteKey')} onPenv={() => navigate('PenvConnect')} />}
        </div>
      )}
    </>
  );
}

export default function Settings() {
  const { back, navigate } = useRouter();
  const [s, setS] = useState<SettingsData | null>(null);
  const [kit, setKit] = useState<BrandKit | undefined>();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [builtInAi, setBuiltInAi] = useState<boolean | null>(null);
  const [asked, setAsked] = useState<Promise<unknown>>();

  useEffect(() => {
    getSettings().then(setS).catch((error: unknown) => console.error('Motikord: could not read settings', error));
    getBrandKit().then(setKit).catch((error: unknown) => console.error('Motikord: could not read the brand kit', error));
    loadKeys().then(setKeys).catch((error: unknown) => console.error('Motikord: could not read keys', error));
    probeMachine().then((m) => setBuiltInAi(m.builtInAi)).catch((error: unknown) => console.error('Motikord: could not check this computer', error));
    return onSettingsChanged(setS);
  }, []);

  if (!s) return null;
  const set = (patch: SettingsPatch) => { updateSettings(patch).catch((error: unknown) => console.error('Motikord: could not save settings', error)); };
  const change = async () => {
    try { await chooseFolder(); } catch (error) { console.error('Motikord: could not choose the save folder', error); }
  };
  // Inside the click: ask Chrome for the provider's host now, so its model list can load.
  const pick = (p: Provider, hasKey: boolean) => {
    if (hasKey) setAsked(requestHost(HOSTS[p]));
    set({ ai: 'cloud', provider: p });
  };
  const version = browser.runtime.getManifest().version;
  const connected = s.keySource === 'penv-app';

  return (
    <main data-frame="Settings" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', paddingBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '20px 24px 0' }}>
        <BackButton onBack={back} />
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Settings</h1>
      </div>

      <Section title="Who writes your clips">
        <div role="radiogroup" aria-label="Who writes your clips" style={{ display: 'flex', flexDirection: 'column' }}>
          {PROVIDER_IDS.map((p, i) => {
            const ready = !!keys[PROVIDERS[p].keyName];
            return (
              <label key={p} style={{ ...rowStyle, ...(i === 0 ? first : null) }}>
                <input type="radio" name="ai" checked={s.ai === 'cloud' && s.provider === p} onChange={() => pick(p, ready)} style={{ accentColor: 'var(--accent)' }} />
                <span style={{ flexGrow: 1 }}>{text(PROVIDERS[p].settingsLabel, 'Your prompt and the clip’s text are sent')}</span>
                {ready ? <RowStatus ready /> : <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--faint)', whiteSpace: 'nowrap' }}>Needs a key</span>}
              </label>
            );
          })}
          <label style={rowStyle}>
            <input type="radio" name="ai" checked={s.ai === 'local'} disabled={builtInAi === false} onChange={() => set({ ai: 'local' })} style={{ accentColor: 'var(--accent)' }} />
            <span style={{ flexGrow: 1 }}>{text('On this computer', 'Chrome’s built-in AI. Nothing is sent.')}</span>
            <RowStatus ready={builtInAi === true} />
          </label>
        </div>
      </Section>
      {builtInAi === false && <div style={{ margin: '10px 24px 0' }}><NoBuiltInAi provider={s.provider} onUseGroq={() => set({ ai: 'cloud' })} /></div>}
      {s.ai === 'cloud' && <ModelSection key={s.provider} s={s} keys={keys} set={set} asked={asked} />}

      <Section title="Keys">
        <a href="#keys" onClick={(e) => { e.preventDefault(); navigate('PenvConnected'); }} style={{ ...rowStyle, ...first }}>
          <span className="mono" aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--ink)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, flexShrink: 0 }}>pv</span>
          <span style={{ flexGrow: 1 }}>{text('Penv Cloud', 'Groq and Pexels keys')}</span>
          {connected && <span style={{ fontSize: 13, color: 'var(--success-ink)', fontWeight: 500 }}>Connected</span>}
          {chevron}
        </a>
        <a href="#paste" onClick={(e) => { e.preventDefault(); navigate('PasteKey'); }} style={{ ...rowStyle, color: 'var(--accent)', fontSize: 14, fontWeight: 500 }}>Paste a key instead</a>
      </Section>

      <Section title="Clips">
        <a href="#brand" onClick={(e) => { e.preventDefault(); navigate('BrandKit'); }} style={{ ...rowStyle, ...first }}>
          {text('Brand kit')}
          <span style={{ flexGrow: 1, display: 'flex', gap: 4, justifyContent: 'flex-end' }} aria-hidden="true">
            {(kit?.colours ?? []).slice(0, 3).map((c, i) => <span key={i} style={{ width: 16, height: 16, borderRadius: 999, background: c.hex, border: '1px solid var(--line)' }} />)}
          </span>
          {chevron}
        </a>
        <div style={rowStyle}>
          {text('Save folder', s.folderName)}
          <Button variant="secondary" onClick={() => void change()}>Change</Button>
        </div>
        <label style={rowStyle}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Default export</span>
          <select
            value={`${s.defaultExport.kind}|${s.defaultExport.quality}`}
            onChange={(e) => { const [kind, quality] = e.target.value.split('|') as [FileKind, Quality]; set({ defaultExport: { kind, quality } }); }}
            style={{ height: 34, borderRadius: 8, border: '1px solid var(--line-strong)', background: 'var(--surface)', font: '13px var(--font)', color: 'var(--ink)', maxWidth: 190 }}
          >
            {KINDS.flatMap(([kind, label]) => QUALITIES.map((q) => <option key={`${kind}|${q}`} value={`${kind}|${q}`}>{label} · {q} · {s.defaultAspect}</option>))}
          </select>
        </label>
        <Switch label="Keep the preview smooth" hint="Shows a lighter preview when needed. Exports are always full quality." checked={s.smoothPreview} onChange={(v) => set({ smoothPreview: v })} />
      </Section>

      <Section title="Free media libraries">
        <Switch top label="Openverse" hint="Photos and music. No key needed." checked={s.libraries.openverse} onChange={(v) => set({ libraries: { openverse: v } })} />
        <Switch label="Pexels" hint="Photos and videos. Key from Penv Cloud." checked={s.libraries.pexels} onChange={(v) => set({ libraries: { pexels: v } })} />
        <Switch label="Show all licences" hint="Also shows share-alike and non-commercial media. Check the licence before you use it." checked={s.libraries.allLicences} onChange={(v) => set({ libraries: { allLicences: v } })} />
      </Section>

      <div style={{ margin: '20px 24px 0', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line)' }}>
        <a href="#privacy" onClick={(e) => { e.preventDefault(); navigate('Privacy'); }} style={{ ...rowStyle, ...first }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Where your data goes</span>{chevron}
        </a>
      </div>

      <div style={{ marginTop: 'auto', padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--faint)' }}>
        <span className="mono">Motikord {version}</span>
        <a href={CODE_URL} target="_blank" rel="noreferrer">Open source on GitHub</a>
      </div>
    </main>
  );
}
