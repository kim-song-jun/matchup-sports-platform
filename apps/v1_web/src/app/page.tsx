import type { Metadata } from 'next';
import { SessionEntryGate } from '@/components/auth/session-entry-gate';

export const metadata: Metadata = {
  title: 'Teameet',
  robots: { index: false, follow: true },
};

export default function Page() {
  return <SessionEntryGate mode="root" />;
}
