'use client';

import { useEffect, useRef, useState } from 'react';
import { getV1ApiBaseUrl } from '@/lib/api-client';
import { clearChunkReloadMark, requestReleaseReload } from '@/lib/release-reload';
import { BrandMark } from './brand-logo';

const CHECK_INTERVAL_MS = 3 * 60 * 1000;
const RELEASE_HEADER = 'x-teameet-release';

/**
 * 배포 후에도 오래 열려있던 탭이 옛날 JS 청크를 계속 참조하다 청크 로드 에러를
 * 만나는 것을 막는다. alpha만 매 응답에 X-Teameet-Release 헤더를 싣고 있어서
 * (deploy-alpha.sh가 배포마다 nginx에 새로 생성) 이 헤더 유무로 활성화 여부가
 * 자동으로 갈린다 — 헤더가 없는 환경(local dev, 아직 헤더가 없는 production)에서는
 * baseline 확보 자체가 안 돼 조용히 아무 것도 하지 않는다.
 */
export function ReleaseVersionWatcher() {
  const baselineRef = useRef<string | null>(null);
  const reloadingRef = useRef(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 이 컴포넌트가 떴다 = 화면이 정상으로 그려졌다. 청크 복구 표식을 지워 다음 배포 때
    // 자동 복구가 다시 한 번 열리게 한다.
    clearChunkReloadMark();

    const checkVersion = async () => {
      if (reloadingRef.current) return;

      let release: string | null;
      try {
        const res = await fetch(`${getV1ApiBaseUrl()}/health`, { cache: 'no-store' });
        release = res.headers.get(RELEASE_HEADER);
      } catch {
        return;
      }
      if (cancelled || !release) return;

      if (baselineRef.current === null) {
        baselineRef.current = release;
        return;
      }

      if (release !== baselineRef.current) {
        reloadingRef.current = true;
        setUpdating(true);
        // 리로드는 global-error 의 청크 복구와 같은 경로를 쓴다(SW 정적 캐시 무효화 포함).
        requestReleaseReload();
      }
    };

    checkVersion();
    const interval = window.setInterval(checkVersion, CHECK_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', checkVersion);
    // bfcache 복귀(뒤로가기 등) 시에도 버전을 재확인한다 — persisted 페이지는
    // 새로고침 없이 되살아나므로 focus/visibilitychange만으론 놓칠 수 있다.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) checkVersion();
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', checkVersion);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  if (!updating) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'var(--surface, #fff)' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <BrandMark size={42} alt="Teameet" />
        <p className="tm-text-body" style={{ color: 'var(--text-muted)' }}>
          새 버전으로 업데이트하고 있어요
        </p>
      </div>
    </div>
  );
}
