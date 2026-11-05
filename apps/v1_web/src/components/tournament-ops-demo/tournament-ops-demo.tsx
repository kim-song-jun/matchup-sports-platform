'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Copy, RotateCcw } from 'lucide-react';
import { V1DataSourceProvider } from '@/components/providers/v1-data-source';
import { NavigationScopeProvider } from '@/components/providers/navigation-scope';
import { TournamentManagementContent } from '@/app/admin/tournaments/[id]/tournament-admin-shell';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { ADMIN_DEMO_ID, ADMIN_DEMO_STORAGE_KEY, createAdminDemoSource, restoreAdminDemo, runAdminDemo } from '@/lib/tournament-admin-demo';
import { DEMO_PATH } from '@/lib/tournament-ops-demo';
import styles from './demo.module.css';

const demoNavigationScope = {
  allow: (pathname: string) => pathname === DEMO_PATH || pathname.startsWith(DEMO_PATH + '/') || pathname.startsWith('#') || pathname.startsWith('?'),
  reason: '실제 서비스로 연결되는 이 화면은 체험에서 열 수 없어요.',
  disabledLabel: '체험 제외',
};

export function TournamentOpsDemo({ children }: { children: ReactNode }) {
  // The sample must not read, populate or invalidate the signed-in account's query cache.
  const [client] = useState(() => new QueryClient({ defaultOptions: {
    queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false }, mutations: { retry: false },
  } }));
  const session = useRef<ReturnType<typeof restoreAdminDemo> | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const { confirm, ConfirmModal } = useConfirm();
  const [source] = useState(() => createAdminDemoSource((method, path, body) => {
    if (!session.current) throw new Error('체험 저장소가 준비되지 않았어요.');
    const current = session.current;
    const next = runAdminDemo(current.state, method, path, body);
    if (method !== 'GET') {
      const commands = [...current.commands, { method, path, body }];
      if (commands.length > 1000) throw new Error('체험 기록이 가득 찼어요. 초기화 후 다시 시작해 주세요.');
      // Publish only after persistence succeeds: failed writes cannot appear saved in another section.
      window.sessionStorage.setItem(ADMIN_DEMO_STORAGE_KEY, JSON.stringify({ version: 2, commands }));
      session.current = { state: next.state, commands };
      void client.invalidateQueries();
    }
    return next.data;
  }));

  useEffect(() => {
    setShareUrl(window.location.origin + DEMO_PATH);
    try {
      const restored = restoreAdminDemo(window.sessionStorage.getItem(ADMIN_DEMO_STORAGE_KEY));
      window.sessionStorage.setItem(ADMIN_DEMO_STORAGE_KEY, JSON.stringify({ version: 2, commands: restored.commands }));
      session.current = restored; setReady(true);
    } catch { setStorageError('체험 기록을 읽거나 저장하지 못했어요. 브라우저 저장 권한을 확인하거나 체험을 초기화해 주세요.'); }
    return () => { client.clear(); };
  }, [client]);

  async function reset() {
    if (!(await confirm({ title: '체험을 초기화할까요?', message: '이 탭의 샘플 설정과 경기 결과를 지워요. 실제 대회에는 영향을 주지 않아요.', confirmLabel: '체험 초기화', tone: 'danger' }))) return;
    try {
      const fresh = restoreAdminDemo(null);
      window.sessionStorage.setItem(ADMIN_DEMO_STORAGE_KEY, JSON.stringify({ version: 2, commands: [] }));
      session.current = fresh; client.clear(); setStorageError(null); setError(null); setReady(true);
      setNotice('이 탭의 체험을 초기화했어요.'); router.push(DEMO_PATH);
    } catch { setStorageError('체험을 저장하지 못했어요. 브라우저 저장 권한을 확인해 주세요.'); setReady(false); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); setError(null); setNotice('체험 시작 링크를 복사했어요. 받은 분은 별도 체험을 시작해요.'); }
    catch { setError('링크를 복사하지 못했어요. 아래 공유 주소를 직접 선택해 복사해 주세요.'); }
  }
  function containNavigation(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    if (!link) return;
    const url = new URL(link.href, window.location.origin);
    if (url.origin === window.location.origin && (url.pathname === DEMO_PATH || url.pathname.startsWith(DEMO_PATH + '/'))) return;
    event.preventDefault(); event.stopPropagation();
    if (url.pathname === '/home') { router.push('/home'); return; }
    setError('이 링크는 실제 서비스의 화면이에요. 샘플 체험 안에서는 이동하지 않아요.');
  }

  return <div className={styles.page} onClickCapture={containNavigation}>
    <header className={styles.header}><div className={styles.headerInner}>
      <Link className={styles.brand} href="/home">teameet</Link>
      <span className={styles.badge}>대회 관리 체험 · 샘플 데이터</span>
      <div className={styles.actions}>
        <button className={styles.quiet} onClick={copyLink} disabled={!shareUrl}><Copy size={16} aria-hidden="true" />공유 링크 복사</button>
        <button className={styles.quiet} onClick={reset}><RotateCcw size={16} aria-hidden="true" />체험 초기화</button>
      </div>
    </div></header>
    <main className={styles.container}>
      <p className={styles.notice}>실제 어드민과 같은 관리 화면을 체험해요. 변경은 이 탭에만 저장되며 실제 대회·알림·공식 기록에는 반영되지 않아요.</p>
      {storageError && <p className={styles.error} role="alert">{storageError}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {ready && !storageError && <QueryClientProvider client={client}><V1DataSourceProvider source={source}><NavigationScopeProvider scope={demoNavigationScope}>
        <TournamentManagementContent id={ADMIN_DEMO_ID} role="PLATFORM_OPS" navigation={{ basePath: DEMO_PATH, listHref: DEMO_PATH, operationsBasePath: DEMO_PATH, localPopups: true }}>
          <div key={pathname} role="region" aria-label="대회 관리 내용">{children}</div>
        </TournamentManagementContent>
      </NavigationScopeProvider></V1DataSourceProvider></QueryClientProvider>}
      {!ready && !storageError && <p role="status">체험을 준비하고 있어요.</p>}
      <details className={styles.guide} id="demo-guide"><summary className={styles.quiet}>체험 안내와 공유 주소</summary>
        <p className={styles.muted}>신청 관리에서 4팀을 확정하고 대진 관리에서 4팀 토너먼트를 만들어 보세요. 팀을 배정한 뒤 점수 입력으로 결과를 확정하면 결승과 통계에 반영돼요.</p>
        <p className={styles.small}>샘플은 4팀 토너먼트를 지원해요. 파일 업로드·외부 캠페인 발행·실제 회원 초대는 지원하지 않아요. 이전 단계형 체험의 진행 기록은 이전하지 않아요. 실제 개인정보는 입력하지 마세요.</p>
        <label className={styles.field}>공유할 체험 주소<input className={styles.input} value={shareUrl} readOnly onFocus={(e) => e.target.select()} /></label>
      </details>
    </main>{ConfirmModal}
  </div>;
}
