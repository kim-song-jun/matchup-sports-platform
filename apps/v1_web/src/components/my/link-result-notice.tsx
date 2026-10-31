'use client';

import Link from 'next/link';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner, Card } from '@/components/v1-ui/primitives';
import type { LinkOutcome } from '@/lib/link-result';

const PROVIDER_NAME = { kakao: '카카오', apple: 'Apple' } as const;

type CardNotice = {
  title: string;
  body: string;
  /** 실패는 즉시 읽히는 alert, 다음 행동 안내는 status. */
  role: 'alert' | 'status';
  actions: Array<'relogin' | 'inquiry' | 'dismiss'>;
};

type Notice = { kind: 'banner'; message: string } | ({ kind: 'card' } & CardNotice);

function noticeFor({ linkResult, provider }: LinkOutcome): Notice {
  const name = PROVIDER_NAME[provider];
  switch (linkResult) {
    case 'linked':
      return { kind: 'banner', message: `${name} 로그인이 연결됐어요. 이제 ${name}로도 같은 계정에 들어올 수 있어요.` };
    case 'merged':
      return { kind: 'banner', message: `${name} 로그인이 연결됐어요. ${name}로 가입하다 멈춘 계정은 정리하고 이 계정으로 옮겼어요.` };
    case 'already':
      return { kind: 'banner', message: `${name} 로그인은 이미 이 계정에 연결돼 있어요.` };
    case 'in_use':
      return {
        kind: 'card',
        title: `이미 다른 계정에 연결된 ${name} 계정이에요`,
        body: `이 ${name} 계정은 다른 팀밋 계정에서 쓰고 있어요. 그 계정으로 로그인하거나, 본인 계정이 아니라면 고객센터에 알려 주세요.`,
        role: 'alert',
        actions: ['inquiry', 'dismiss'],
      };
    case 'exists':
      return {
        kind: 'card',
        title: `이미 다른 ${name} 계정이 연결돼 있어요`,
        body: `이 계정에는 다른 ${name} 계정이 연결돼 있어요. 한 계정에는 ${name} 계정을 하나만 연결할 수 있어요.`,
        role: 'status',
        actions: ['dismiss'],
      };
    case 'recent_login':
      return {
        kind: 'card',
        title: '보안을 위해 다시 로그인해 주세요',
        body: '로그인한 지 오래돼서 바로 연결할 수 없어요. 다시 로그인하면 이 화면으로 돌아와 이어서 연결할 수 있어요.',
        role: 'status',
        actions: ['relogin'],
      };
    case 'mismatch':
      return {
        kind: 'card',
        title: '다른 계정에 로그인했어요',
        body: '처음 안내받은 계정과 달라서 연결하지 않았어요. 이 계정에 연결하려면 아래에서 직접 연결해 주세요.',
        role: 'status',
        actions: ['dismiss'],
      };
    case 'failed':
      return {
        kind: 'card',
        title: `${name} 로그인을 연결하지 못했어요`,
        body: '잠시 후 다시 시도해 주세요. 계속 안 되면 고객센터에 알려 주세요.',
        role: 'alert',
        actions: ['inquiry', 'dismiss'],
      };
  }
}

/** 연결이 새로 이뤄졌을 때 배너와 함께 잠깐 띄우는 한 줄. 이미 연결돼 있었거나 실패한 결과에는 없다. */
export function linkSuccessToast({ linkResult, provider }: LinkOutcome): string | null {
  return linkResult === 'linked' || linkResult === 'merged' ? `${PROVIDER_NAME[provider]} 로그인이 연결됐어요` : null;
}

export function LinkResultNotice({
  outcome,
  onDismiss,
  onRelogin,
  relogin,
}: {
  outcome: LinkOutcome;
  onDismiss: () => void;
  onRelogin: () => void;
  relogin: { pending: boolean; error: string | null };
}) {
  const notice = noticeFor(outcome);
  if (notice.kind === 'banner') return <AlertBanner tone="info" message={notice.message} />;

  return (
    <Card pad={16}>
      <div role={notice.role}>
        <div className="tm-text-body-lg">{notice.title}</div>
        <p className="tm-text-label" style={{ margin: '4px 0 0', color: 'var(--text-muted)', wordBreak: 'keep-all' }}>
          {notice.body}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {notice.actions.map((action) => {
          if (action === 'relogin') {
            return (
              <Button key={action} variant="primary" size="md" block loading={relogin.pending} onClick={onRelogin}>
                다시 로그인하기
              </Button>
            );
          }
          if (action === 'inquiry') {
            return (
              <Link key={action} className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/my/inquiries/new">
                고객센터 문의
              </Link>
            );
          }
          return (
            <Button key={action} variant="ghost" size="md" block onClick={onDismiss}>
              닫기
            </Button>
          );
        })}
      </div>
      {relogin.error ? (
        <p className="tm-text-caption" role="alert" style={{ margin: '8px 0 0', color: 'var(--red700)' }}>{relogin.error}</p>
      ) : null}
    </Card>
  );
}
