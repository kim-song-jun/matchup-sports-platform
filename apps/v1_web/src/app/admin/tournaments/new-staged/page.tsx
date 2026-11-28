import { redirect } from 'next/navigation';

export default function NewStagedPage() {
  redirect('/admin/tournaments/new?format=staged');
}
