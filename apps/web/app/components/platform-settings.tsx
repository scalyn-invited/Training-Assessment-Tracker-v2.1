'use client';
import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, Guest, useContext, Pending } from './auth-ui';
import type { AppearanceBrand } from './appearance';
import { generate, themes } from '../../../../packages/domain/src/theme';
import { Button, Input, Select, PageHeader, RouteTabs, Feedback } from './ui/controls';
import layout from '../platform/overview.module.css';
import styles from '../platform/settings/settings.module.css';

export function SettingsIcon({
  name,
}: {
  name: 'settings-active' | 'upload' | 'key' | 'mail' | 'ai' | 'info';
}) {
  return (
    <img className={styles.icon} src={`/images/settings/${name}.svg`} alt="" aria-hidden="true" />
  );
}

export function SettingsLayout({
  tab,
  children,
}: {
  tab: 'appearance' | 'status';
  children: ReactNode;
}) {
  const { context, error, load } = useContext();
  const router = useRouter();
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : !context.user.global_admin ? (
        <>
          <h1>Global Admin access required</h1>
          <Link href="/dashboard">Return to workspace</Link>
        </>
      ) : (
        <div className={`${layout.page} ${styles.page}`}>
          <PageHeader title="Settings">
            Platform defaults inherited by all clients. Client settings and personal themes take
            precedence.
          </PageHeader>
          <RouteTabs
            label="Settings sections"
            items={[
              { href: '/platform/settings', label: 'Appearance', active: tab === 'appearance' },
              {
                href: '/platform/settings/status',
                label: 'System status',
                active: tab === 'status',
              },
            ]}
          />
          {children}
        </div>
      )}
    </Guest>
  );
}

export function PlatformAppearanceForm({
  brand,
  accent,
  setAccent,
  busy,
  save,
  discard,
}: {
  brand: AppearanceBrand;
  accent: string;
  setAccent: (value: string) => void;
  busy: boolean;
  save: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  discard: () => void;
}) {
  const [name, setName] = useState(brand.displayName);
  const [filename, setFilename] = useState('No file chosen');
  const palettes = /^#[0-9a-f]{6}$/i.test(accent) ? generate(accent) : null;
  return (
    <div className={styles.columns}>
      <form className={styles.form} onSubmit={save} aria-label="Platform appearance">
        <fieldset disabled={busy} className={styles.fields}>
          <label>
            Platform display name{' '}
            <span className={styles.required} aria-hidden="true">
              *
            </span>
            <Input
              name="displayName"
              aria-label="Platform display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label>
            Application name{' '}
            <span className={styles.required} aria-hidden="true">
              *
            </span>
            <Input
              name="appName"
              aria-label="Application name"
              defaultValue={brand.appName}
              required
              maxLength={120}
            />
          </label>
          <div className={styles.field}>
            <label htmlFor="platform-colour">
              Brand colour{' '}
              <span className={styles.required} aria-hidden="true">
                *
              </span>
            </label>
            <div className={styles.colour}>
              <input
                aria-label="Brand colour picker"
                type="color"
                value={palettes ? accent : '#1d4668'}
                onChange={(e) => setAccent(e.target.value)}
              />
              <input
                id="platform-colour"
                aria-label="Brand colour hex value"
                aria-describedby="colour-help"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                required
                pattern="#[0-9a-fA-F]{6}"
                maxLength={7}
              />
            </div>
            <p id="colour-help" className={styles.help}>
              Applies to buttons, navigation, backgrounds and cards in Platform Light and Platform
              Dark.
            </p>
          </div>
          <label>
            Default theme
            <Select name="theme" defaultValue={brand.theme}>
              {Object.entries(themes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <div className={styles.field}>
            <label htmlFor="platform-logo">Platform logo</label>
            <div className={styles.upload}>
              <span className={styles.iconBox}>
                <SettingsIcon name="upload" />
              </span>
              <div className={styles.fileCopy}>
                <span>{filename}</span>
                <p id="logo-help" className={styles.help}>
                  PNG, JPEG or WebP · max 2 MB · up to 4096 × 4096 px · shown on shared sign-in
                  screens
                </p>
              </div>
              <label className={styles.fileButton}>
                Choose file
                <input
                  id="platform-logo"
                  aria-label="Platform logo"
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-describedby="logo-help"
                  onChange={(e) => setFilename(e.target.files?.[0]?.name ?? 'No file chosen')}
                />
              </label>
            </div>
            {brand.customLogo && brand.logo && (
              <div className={styles.currentLogo}>
                <img src={brand.logo} alt="Current platform logo" />
                <label>
                  <input type="checkbox" name="removeLogo" /> Remove custom logo
                </label>
              </div>
            )}
          </div>
          <label>
            Reason for change{' '}
            <span className={styles.required} aria-hidden="true">
              *
            </span>
            <Input
              name="reason"
              aria-label="Reason for change"
              placeholder="Explain the change"
              required
              minLength={8}
              maxLength={2000}
              aria-describedby="reason-help"
            />
            <span id="reason-help" className={styles.help}>
              Required: at least 8 characters. Recorded in the audit log.
            </span>
          </label>
        </fieldset>
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
            {busy ? 'Saving appearance...' : 'Save appearance'}
          </Button>
          <Button disabled={busy} onClick={discard}>
            Discard changes
          </Button>
        </div>
      </form>
      <aside className={styles.previews} aria-label="Live appearance preview">
        <div>
          <h2>Live preview</h2>
          <p className={styles.help}>Preview only until you save.</p>
        </div>
        {!palettes && <p>Enter a valid hex colour to preview the platform themes.</p>}
        {palettes &&
          Object.entries(palettes).map(([variant, tokens]) => (
            <section
              className={styles.preview}
              key={variant}
              aria-label={`Platform ${variant} preview`}
              style={
                Object.fromEntries(
                  Object.entries(tokens).map(([key, value]) => ['--preview-' + key, value]),
                ) as CSSProperties
              }
            >
              <h3>Platform {variant === 'light' ? 'Light' : 'Dark'}</h3>
              <div className={styles.mock}>
                <span className={styles.activePreview}>Active navigation</span>
                <h4>{name || 'Platform display name'}</h4>
                <p>Readable text and comfortable cards.</p>
                <span className={styles.buttonPreview}>Button preview</span>
              </div>
            </section>
          ))}
      </aside>
    </div>
  );
}

type Status = {
  clients: number;
  assignments: number;
  identityMode: string;
  emailConfigured: boolean;
  aiConfigured: boolean;
};
export function PlatformSystemStatus() {
  const { context } = useContext();
  const [data, setData] = useState<Status | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const userId = context?.user?.global_admin ? context.user.id : undefined;
  useEffect(() => {
    let current = true;
    setData(null);
    setError('');
    if (userId)
      api<Status>('/platform/overview')
        .then((value) => {
          if (current) setData(value);
        })
        .catch((e: Error) => {
          if (current) setError(e.message);
        });
    return () => {
      current = false;
    };
  }, [userId, revision]);
  return (
    <SettingsLayout tab="status">
      <Feedback error={error} />
      {error && <Button onClick={() => setRevision((n) => n + 1)}>Retry system status</Button>}
      {!data && !error && <p role="status">Loading system status...</p>}
      {data && (
        <section className={styles.connections} aria-labelledby="connections-title">
          <header>
            <h2 id="connections-title">Connections</h2>
            <p>
              {data.clients} {data.clients === 1 ? 'client' : 'clients'} · {data.assignments}{' '}
              current Global Admin {data.assignments === 1 ? 'assignment' : 'assignments'}
            </p>
          </header>
          <dl>
            {(
              [
                [
                  'key',
                  'Identity connection',
                  data.identityMode === 'local_password'
                    ? 'Password sign-in'
                    : data.identityMode === 'mock'
                      ? 'Local mock sign-in'
                      : 'External identity configuration required',
                  false,
                ],
                [
                  'mail',
                  'External email delivery',
                  data.emailConfigured
                    ? 'Configured; delivery not verified here'
                    : 'Email is not configured',
                  !data.emailConfigured,
                ],
                [
                  'ai',
                  'Live AI',
                  data.aiConfigured
                    ? 'Configured; provider access not verified here'
                    : 'AI generation is not configured',
                  !data.aiConfigured,
                ],
              ] as const
            ).map(([icon, label, value, warning]) => (
              <div className={styles.connection} key={icon}>
                <dt>
                  <span className={styles.iconBox}>
                    <SettingsIcon name={icon} />
                  </span>
                  {label}
                </dt>
                <dd className={warning ? styles.warning : styles.status}>
                  <span aria-hidden="true">●</span> <span>{value}</span>
                </dd>
              </div>
            ))}
          </dl>
          <div className={styles.ownerNote}>
            <SettingsIcon name="info" />
            <p>
              Owner: Technical administrator. Configure the approved mail service and verify a test
              inbox before enabling delivery. Confirm the approved AI provider and verify a sample
              request before enabling generation. Credentials are managed outside this screen.
            </p>
          </div>
        </section>
      )}
    </SettingsLayout>
  );
}
