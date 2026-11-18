'use client';
import { useEffect, useState, type FormEvent, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest, Pending } from './auth-ui';
import { Button, Input, Select, Panel, PageHeader, Feedback } from './ui/controls';
import styles from './ui/form-layout.module.css';
import appearanceStyles from './ui/appearance.module.css';
import { generate, themes } from '../../../../packages/domain/src/theme';
import { SettingsLayout, PlatformAppearanceForm } from './platform-settings';
export type AppearanceBrand = {
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
    [brand, setBrand] = useState<AppearanceBrand | null>(null),
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
    if (!context?.user || (platform && !context.user.global_admin) || (!platform && !client))
      return;
    let cancelled = false;
    setFailure('');
    api<AppearanceBrand>('/branding' + (client ? '?clientId=' + client : ''))
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
  if (platform)
    return (
      <SettingsLayout tab="appearance">
        <Feedback error={failure} success={success} />
        {failure && (
          <Button variant="secondary" onClick={() => setRevision((n) => n + 1)}>
            Reload appearance
          </Button>
        )}
        {!brand && !failure && <p role="status">Loading appearance settings...</p>}
        {brand?.canEdit && (
          <PlatformAppearanceForm
            key={`${brand.version}:${revision}`}
            brand={brand}
            accent={accent}
            setAccent={setAccent}
            busy={busy}
            save={save}
            discard={() => {
              setBrand(null);
              setFailure('');
              setSuccess('');
              setRevision((n) => n + 1);
            }}
          />
        )}
        {brand && !brand.canEdit && (
          <p>Global Admin access is required to change platform appearance.</p>
        )}
      </SettingsLayout>
    );
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : !platform && !client ? (
        <>
          <PageHeader title="Choose a client" />
          <Link href="/clients">Choose your client</Link>
        </>
      ) : (
        <div className={styles.page}>
          <p className="eyebrow">{platform ? 'Platform' : context.client?.name}</p>
          <PageHeader title={platform ? 'Platform appearance' : 'Appearance'} />
          <p>
            <Link href="/dashboard">Return to workspace</Link>
          </p>
          <Feedback error={failure} success={success} />
          {failure && (
            <Button variant="secondary" onClick={() => setRevision((n) => n + 1)}>
              Reload appearance
            </Button>
          )}
          {!brand && !failure && <p role="status">Loading appearance settings…</p>}
          {brand && !platform && (
            <Panel className={styles.panel}>
              <h2>Choose your theme</h2>
              <p>Choose a look for your account in this client, across devices.</p>
              <div className={appearanceStyles.gallery} role="group" aria-label="Workspace theme">
                {Object.entries(brand.themes).map(([key, label]) => (
                  <Button
                    className={appearanceStyles.tile}
                    key={key}
                    aria-pressed={brand.selectedTheme === key}
                    disabled={busy}
                    onClick={() => choose(key)}
                  >
                    <span
                      className={appearanceStyles.swatch + ' sample-' + key}
                      aria-hidden="true"
                    />
                    <span>{label}</span>
                  </Button>
                ))}
              </div>
              <Button variant="secondary" disabled={busy} onClick={() => choose(null)}>
                Use client default
              </Button>
            </Panel>
          )}
          {brand?.canEdit && (
            <Panel className={styles.panel}>
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
                    <Select name="mode" defaultValue={brand.mode}>
                      <option value="cerebru">Cerebru</option>
                      <option value="co-branded">Client + Cerebru</option>
                      <option value="white-label">Client only (white-label)</option>
                    </Select>
                  </label>
                )}
                <label>
                  {platform ? 'Platform display name' : 'Client name'}
                  <Input
                    name="displayName"
                    defaultValue={brand.displayName}
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  Application name
                  <Input name="appName" defaultValue={brand.appName} required maxLength={120} />
                </label>
                <label>
                  Brand colour
                  <Input
                    className={appearanceStyles.colour}
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : '#1d4668'}
                    onChange={(e) => setAccent(e.target.value)}
                  />
                </label>
                <label>
                  Brand colour hex value
                  <Input
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    required
                    pattern="#[0-9a-fA-F]{6}"
                    maxLength={7}
                  />
                </label>
                <p>Choose one colour. We generate readable light and dark themes.</p>
                <div className={appearanceStyles.previews}>
                  {palettes &&
                    Object.entries(palettes).map(([variant, tokens]) => (
                      <section
                        key={variant}
                        className={appearanceStyles.preview}
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
                        <div className={appearanceStyles.card}>
                          <span className={appearanceStyles.active}>Active navigation</span>
                          <h4>Your learning workspace</h4>
                          <p>Readable text and comfortable cards.</p>
                          <span className={appearanceStyles.buttonPreview}>Button preview</span>
                        </div>
                      </section>
                    ))}
                </div>
                <label>
                  Default theme
                  <Select name="theme" defaultValue={platform ? brand.theme : brand.savedTheme}>
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
                  </Select>
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
                        <Input type="checkbox" name="removeLogo" /> Remove custom logo
                      </label>
                    </>
                  )}
                  <label>
                    {platform ? 'Platform logo' : 'Client logo'}
                    <Input
                      className={appearanceStyles.file}
                      name="logo"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                    />
                  </label>
                  <p>PNG, JPEG or WebP. Maximum 2 MB and 4096 × 4096 pixels.</p>
                </details>
                {platform && (
                  <label>
                    Appearance change reason
                    <Input name="reason" required minLength={8} maxLength={2000} />
                  </label>
                )}
                <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
                  {busy
                    ? 'Saving appearance…'
                    : platform
                      ? 'Save platform appearance'
                      : 'Save client branding'}
                </Button>{' '}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setBrand(null);
                    setRevision((n) => n + 1);
                  }}
                >
                  Discard changes
                </Button>
              </form>
            </Panel>
          )}
          {brand && !brand.canEdit && platform && (
            <p>Global Admin access is required to change platform appearance.</p>
          )}
        </div>
      )}
    </Guest>
  );
}
