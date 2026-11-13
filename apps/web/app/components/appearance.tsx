'use client';
import { useEffect, useState, type FormEvent, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest, Pending, Feedback } from './auth-ui';
import { generate, themes } from '../../../../packages/domain/src/theme';
type Brand = {
  version: number;
  savedTheme: string;
  customLogo: boolean;
  displayName: string;
  appName: string;
  mode: string;
  accent: string;
  theme: string;
  selectedTheme: string;
  preferenceVersion: number;
  preference: string | null;
  themes: Record<string, string>;
  canEdit: boolean;
  logo: string | null;
};
export function Appearance({ platform = false }: { platform?: boolean }) {
  const { context, error, load } = useContext(),
    router = useRouter(),
    [brand, setBrand] = useState<Brand | null>(null),
    [failure, setFailure] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [accent, setAccent] = useState('#1d4668');
  const client = platform ? null : context?.client?.id;
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!context?.user || (!platform && !client)) return;
    let cancelled = false;
    setFailure('');
    api<Brand>('/branding' + (client ? '?clientId=' + client : ''))
      .then((data) => {
        if (!cancelled) {
          setBrand(data);
          setAccent(data.accent);
        }
      })
      .catch((e) => {
        if (!cancelled) setFailure(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [context?.user?.id, client, platform, revision]);
  function refresh() {
    setRevision((n) => n + 1);
    window.dispatchEvent(new Event('brandingchanged'));
  }
  async function choose(theme: string | null) {
    if (!context || !client || !brand || busy) return;
    setBusy(true);
    setFailure('');
    try {
      await api('/branding/preference', {
        csrf: context.csrf,
        clientId: client,
        version: brand.preferenceVersion,
        theme,
      });
      setSuccess('Your theme preference was saved.');
      refresh();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context || !brand || busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setFailure('');
    setSuccess('');
    try {
      const file = values.get('logo') as File;
      let logo: string | undefined;
      if (file?.size) {
        if (file.size > 2097152) throw new Error('Logo must be no larger than 2 MB.');
        logo = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('The logo could not be read.'));
          reader.readAsDataURL(file);
        });
      }
      await api('/branding', {
        csrf: context.csrf,
        clientId: client ?? null,
        version: brand.version,
        displayName: String(values.get('displayName')),
        appName: String(values.get('appName')),
        mode: platform ? 'white-label' : String(values.get('mode')),
        accent,
        theme: String(values.get('theme')),
        reason: String(values.get('reason') ?? ''),
        removeLogo: values.get('removeLogo') === 'on',
        logo,
      });
      setSuccess(
        platform
          ? 'Platform appearance saved.'
          : 'Client branding saved. Personal theme choices remain unchanged.',
      );
      refresh();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const palettes = /^#[0-9a-f]{6}$/i.test(accent) ? generate(accent) : null;
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : !platform && !client ? (
        <>
          <h1>Choose a client</h1>
          <Link href="/clients">Choose your client</Link>
        </>
      ) : (
        <>
          <p className="eyebrow">{platform ? 'Platform' : context.client?.name}</p>
          <h1>{platform ? 'Platform appearance' : 'Appearance'}</h1>
          <p>
            <Link href="/dashboard">Return to workspace</Link>
          </p>
          <Feedback error={failure} success={success} />
          {failure && (
            <button className="secondary" onClick={() => setRevision((n) => n + 1)}>
              Reload appearance
            </button>
          )}
          {!brand && !failure && <p role="status">Loading appearance settings…</p>}
          {brand && !platform && (
            <section className="panel">
              <h2>Choose your theme</h2>
              <p>Choose a look for your account in this client, across devices.</p>
              <div className="theme-gallery" role="group" aria-label="Workspace theme">
                {Object.entries(brand.themes).map(([key, label]) => (
                  <button
                    className="theme-tile"
                    key={key}
                    aria-pressed={brand.selectedTheme === key}
                    disabled={busy}
                    onClick={() => choose(key)}
                  >
                    <span className={'theme-preview sample-' + key} aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <button className="secondary" disabled={busy} onClick={() => choose(null)}>
                Use client default
              </button>
            </section>
          )}
          {brand?.canEdit && (
            <section className="panel">
              <h2>{platform ? 'Platform branding' : 'Client branding'}</h2>
              <p>
                {platform
                  ? 'Shared branding appears on sign-in and platform screens.'
                  : 'Changes apply to the selected client on the next page load.'}
              </p>
              <form key={brand.version} onSubmit={save}>
                {!platform && (
                  <label>
                    Branding mode
                    <select name="mode" defaultValue={brand.mode}>
                      <option value="cerebru">Cerebru</option>
                      <option value="co-branded">Client + Cerebru</option>
                      <option value="white-label">Client only (white-label)</option>
                    </select>
                  </label>
                )}
                <label>
                  {platform ? 'Platform display name' : 'Client name'}
                  <input
                    name="displayName"
                    defaultValue={brand.displayName}
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  Application name
                  <input name="appName" defaultValue={brand.appName} required maxLength={120} />
                </label>
                <label>
                  Brand colour
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : '#1d4668'}
                    onChange={(e) => setAccent(e.target.value)}
                  />
                </label>
                <label>
                  Brand colour hex value
                  <input
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    required
                    pattern="#[0-9a-fA-F]{6}"
                    maxLength={7}
                  />
                </label>
                <p>Choose one colour. We generate readable light and dark themes.</p>
                <div className="auto-theme-previews">
                  {palettes &&
                    Object.entries(palettes).map(([variant, tokens]) => (
                      <section
                        key={variant}
                        className="auto-theme-preview"
                        aria-label={variant + ' theme preview'}
                        style={
                          Object.fromEntries(
                            Object.entries(tokens).map(([key, value]) => [
                              '--preview-' + key,
                              value,
                            ]),
                          ) as CSSProperties
                        }
                      >
                        <h3>{variant === 'light' ? 'Light' : 'Dark'}</h3>
                        <p>Preview only until you save.</p>
                        <div className="auto-preview-card">
                          <span className="auto-preview-active">Active navigation</span>
                          <h4>Your learning workspace</h4>
                          <p>Readable text and comfortable cards.</p>
                          <span className="auto-preview-button">Button preview</span>
                        </div>
                      </section>
                    ))}
                </div>
                <label>
                  Default theme
                  <select name="theme" defaultValue={platform ? brand.theme : brand.savedTheme}>
                    {!platform && <option value="">Use configured default</option>}
                    {Object.entries(
                      platform
                        ? themes
                        : {
                            light: 'Light',
                            dark: 'Dark',
                            'neon-cyan': 'Neon Cyan',
                            'neon-emerald': 'Neon Emerald',
                            'neon-amber': 'Neon Amber',
                            'client-light': 'Client Light',
                            'client-dark': 'Client Dark',
                          },
                    ).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <details>
                  <summary>Logo</summary>
                  {brand.customLogo && brand.logo && (
                    <>
                      <img
                        src={brand.logo}
                        alt="Current logo"
                        style={{ maxWidth: 180, maxHeight: 100 }}
                      />
                      <label>
                        <input type="checkbox" name="removeLogo" /> Remove custom logo
                      </label>
                    </>
                  )}
                  <label>
                    {platform ? 'Platform logo' : 'Client logo'}
                    <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
                  </label>
                  <p>PNG, JPEG or WebP. Maximum 2 MB and 4096 × 4096 pixels.</p>
                </details>
                {platform && (
                  <label>
                    Appearance change reason
                    <input name="reason" required minLength={8} maxLength={2000} />
                  </label>
                )}
                <button className="primary" disabled={busy} aria-busy={busy}>
                  {busy
                    ? 'Saving appearance…'
                    : platform
                      ? 'Save platform appearance'
                      : 'Save client branding'}
                </button>{' '}
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setBrand(null);
                    setRevision((n) => n + 1);
                  }}
                >
                  Discard changes
                </button>
              </form>
            </section>
          )}
          {brand && !brand.canEdit && platform && (
            <p>Global Admin access is required to change platform appearance.</p>
          )}
        </>
      )}
    </Guest>
  );
}
