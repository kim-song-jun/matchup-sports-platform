import { TeamContactSettingsPageClient } from './team-contact-settings-client';

export default async function TeamContactSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamContactSettingsPageClient teamId={id} />;
}
