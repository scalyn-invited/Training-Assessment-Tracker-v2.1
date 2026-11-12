import type { Metadata } from 'next';
import './globals.css';
import './workspace.css';
import './directory.css';
export const metadata: Metadata = {
  title: 'Training Assessment Tracker V2.1',
  description: 'Training and employee development',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
