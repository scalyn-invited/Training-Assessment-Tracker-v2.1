import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { loadInitialAppearance } from './initial-appearance';
import { appearanceScript, paletteProperties } from './components/appearance-state';
import { AppearanceProvider } from './components/appearance-provider';
import './globals.css';
import './workspace.css';
import './directory.css';
import './assessments.css';
export const metadata: Metadata = {
  title: 'Training Assessment Tracker V2.1',
  description: 'Training and employee development',
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const request = await headers();
  const initial = await loadInitialAppearance(
    request.get('x-tracker-pathname') ?? '/',
    request.get('cookie') ?? '',
    process.env.API_INTERNAL_ORIGIN ?? 'http://127.0.0.1:3101',
  );
  return (
    <html
      lang="en"
      data-theme={initial.brand?.selectedTheme ?? 'light'}
      style={paletteProperties(initial.brand)}
      suppressHydrationWarning
    >
      <head>
        {/* Deliberately parser-blocking: local-only overrides must precede body paint. */}
        <script dangerouslySetInnerHTML={{ __html: appearanceScript(initial) }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <AppearanceProvider initial={initial}>{children}</AppearanceProvider>
      </body>
    </html>
  );
}
