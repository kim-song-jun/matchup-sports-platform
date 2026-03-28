import Link from 'next/link';
import { Plus } from 'lucide-react';
import { TeamList } from './team-list';

export default function TeamsPage() {
  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <header className="flex items-center justify-between px-5 @3xl:px-0 pt-4 pb-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">팀·클럽</h1>
          <p className="text-sm text-gray-500 mt-0.5">동호회와 팀을 찾아보세요</p>
        </div>
        <Link href="/teams/new" className="flex items-center gap-1.5 rounded-xl bg-gray-900 dark:bg-white px-4 py-2.5 text-sm font-bold text-white dark:text-gray-900 transition-colors">
          <Plus size={14} strokeWidth={2.5} />
          팀 등록
        </Link>
      </header>

      <div className="px-5 @3xl:px-0">
        <TeamList />
      </div>
    </div>
  );
}
