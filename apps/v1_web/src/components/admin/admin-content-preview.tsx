'use client';

import { Monitor, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { browserAppRoute } from '@/lib/app-route';
import type { V1RichContentDocument } from '@/types/api';

export type AdminContentPreviewPayload =
  | {
      kind: 'notice';
      title: string;
      category: string;
      content: V1RichContentDocument;
      body: string;
    }
  | {
      kind: 'popup';
      title: string;
      content: V1RichContentDocument;
      body: string;
      linkUrl?: string | null;
      linkLabel?: string | null;
    };

export function AdminContentPreview({ payload }: { payload: AdminContentPreviewPayload }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewSrc = browserAppRoute('/admin-content-preview');

  const sendPreview = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'teameet:admin-content-preview', payload },
      window.location.origin,
    );
  };

  useEffect(() => {
    sendPreview();
  }, [payload]);

  useEffect(() => {
    const receiveReady = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === 'teameet:admin-content-preview-ready') sendPreview();
    };
    window.addEventListener('message', receiveReady);
    return () => window.removeEventListener('message', receiveReady);
  }, [payload]);

  return (
    <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4" aria-labelledby="content-preview-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="content-preview-title" className="text-base font-bold text-[var(--text-strong)]">실제 화면 미리보기</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">저장 전 내용을 실제 사용자 컴포넌트와 viewport로 확인합니다.</p>
        </div>
        <div className="tm-on-tint inline-flex rounded-xl bg-[var(--surface-soft)] p-1" aria-label="미리보기 화면 크기">
          <DeviceButton active={device === 'desktop'} onClick={() => setDevice('desktop')} label="웹"><Monitor /></DeviceButton>
          <DeviceButton active={device === 'mobile'} onClick={() => setDevice('mobile')} label="모바일"><Smartphone /></DeviceButton>
        </div>
      </div>
      <div className="mt-4 overflow-auto rounded-xl bg-[var(--surface-soft)] p-3">
        <iframe
          ref={iframeRef}
          title={`${payload.kind === 'notice' ? '공지사항' : '팝업'} ${device === 'desktop' ? '웹' : '모바일'} 미리보기`}
          src={previewSrc}
          onLoad={sendPreview}
          className="mx-auto block rounded-xl border border-[var(--border)] bg-[var(--card-surface)] shadow-sm"
          style={{
            width: device === 'desktop' ? 1180 : 390,
            height: device === 'desktop' ? 760 : 720,
            maxWidth: '100%',
          }}
        />
      </div>
    </section>
  );
}

function DeviceButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  // 활성 알약은 트랙(--surface-soft)보다 **밝아야** 한다 — shadow-sm 이 말하는 "떠 있는"
  // 상태를 지면 톤도 같이 말해야 하고, --grey300 은 라이트에서 트랙보다 어두워 그 신호를
  // 뒤집었다(blue700 대비도 3.70:1 로 미달). 밝은 쪽 토큰이 테마마다 달라 쌍으로 준다:
  // 라이트 --surface(#fff, 5.41:1) · 다크 --grey300(#333a45, 4.73:1). 디자인 시스템의
  // .tm-segmented-thumb 도 같은 이유로 surface/grey150 쌍을 쓴다(globals.css).
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors [&_svg]:h-4 [&_svg]:w-4 ${active ? 'bg-[var(--surface)] dark:bg-[var(--grey300)] text-[var(--blue700)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]'}`}
    >
      {children}{label}
    </button>
  );
}
