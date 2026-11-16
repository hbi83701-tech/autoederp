import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'AutoED-ERP', template: '%s · AutoED-ERP' },
  description: 'AutoED-ERP: one configurable platform to run every part of a school or school group.',
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { themeColor: '#0f6e6e', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
