'use client';

import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { useCalendarFeed, useConnectCalendarFeed, useRegenerateCalendarFeed } from '@/hooks/use-calendar-feed';
import { currentCalendarPlatform, googleCalendarAddUrl, type CalendarPlatform } from '@/lib/calendar-platform';

/** 내 일정 맨 위 "캘린더 연결" 버튼 — 누르면 시트가 열린다. 시트를 열기 전에는 서버를 부르지 않는다. */
export function CalendarConnectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="tm-calendar-connect-row">
        <Button type="button" variant="neutral" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <CalendarDays size={16} aria-hidden="true" /> 캘린더 연결
        </Button>
      </div>
      {open ? <CalendarConnectSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** 클립보드가 막힌 환경(앱 웹뷰 일부)에서는 숨은 입력칸으로 대신 복사한다. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand('copy');
      input.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** 기기별 안내 — 버튼 바로 아래에 둔다. 아이폰·맥은 캘린더 앱이 구독을 바로 받고, 갤럭시는 구글 캘린더(웹)를 거친다. */
const PLATFORM_HELP: Record<CalendarPlatform, string[]> = {
  ios: [
    '「캘린더에서 열기」를 누르고 구독을 확인해 주세요.',
    '반영은 바로 되지 않아요. 몇 시간 걸릴 수 있어요. 캘린더 목록에서 아래로 당기면 바로 새로고침돼요.',
  ],
  mac: [
    '「캘린더에서 열기」를 누르고 구독을 확인해 주세요. 맥 캘린더에 들어와요.',
    '구글 캘린더를 쓴다면 「주소 복사」 후 구글 캘린더(웹)의 「다른 캘린더 → URL로 추가」에 붙여 넣어 주세요.',
    '반영은 바로 되지 않아요. 몇 시간 걸릴 수 있어요.',
  ],
  android: [
    '「구글 캘린더에 추가」를 눌러 구독을 확인해 주세요. 구글 계정이 연결된 갤럭시 캘린더에도 보여요(안 보이면 구글 계정의 캘린더 동기화 설정에서 이 캘린더가 켜져 있는지 확인해 주세요).',
    '열리지 않으면 「주소 복사」 후 브라우저에서 구글 캘린더(PC 보기)를 열고 「다른 캘린더 → URL로 추가」에 붙여 넣어 주세요.',
    '반영은 바로 되지 않아요. 최대 하루 걸릴 수 있어요.',
  ],
  other: [
    '「구글 캘린더에 추가」를 누르거나, 「주소 복사」 후 쓰는 캘린더의 「URL로 추가」에 붙여 넣어 주세요.',
    '반영은 바로 되지 않아요. 몇 시간에서 최대 하루 걸릴 수 있어요.',
  ],
};

export function CalendarConnectSheet({ onClose }: { onClose: () => void }) {
  const feed = useCalendarFeed();
  const connect = useConnectCalendarFeed();
  const regenerate = useRegenerateCalendarFeed();
  const { confirm, ConfirmModal } = useConfirm();
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  // 시트는 사용자가 버튼을 눌러야 마운트돼 서버에서 그려지지 않는다 — 처음부터 기기를 정해 둘 수 있다(깜빡임 없음).
  const [platform] = useState<CalendarPlatform>(currentCalendarPlatform);

  // 열자마자 주소가 없으면 바로 만든다 — 「주소 만들기」를 따로 누르지 않아도 버튼이 나온다.
  const needsConnect = feed.data !== undefined && !feed.data.connected;
  const { mutate: connectNow, isPending: connecting, isError: connectFailed, isIdle: connectIdle } = connect;
  useEffect(() => {
    if (needsConnect && connectIdle) connectNow();
  }, [needsConnect, connectIdle, connectNow]);

  const connected = feed.data?.connected === true;
  const busy = connecting || regenerate.isPending;
  const failed = feed.isError || connectFailed || regenerate.isError;

  async function onCopy() {
    if (!feed.data?.feedUrl) return;
    setCopied((await copyText(feed.data.feedUrl)) ? 'done' : 'failed');
  }

  async function onRegenerate() {
    const ok = await confirm({
      title: '주소를 다시 만들까요?',
      message: '이전 주소는 바로 쓸 수 없게 돼요. 이미 캘린더에 연결해 둔 기기는 새 주소로 다시 연결해야 해요.',
      confirmLabel: '다시 만들기',
      tone: 'danger',
    });
    if (!ok) return;
    setCopied(null);
    regenerate.mutate();
  }

  const primary =
    platform === 'ios' || platform === 'mac' ? (
      <a className="tm-btn tm-btn-md tm-btn-primary tm-btn-block" href={feed.data?.webcalUrl ?? undefined}>
        캘린더에서 열기
      </a>
    ) : (
      <a
        className="tm-btn tm-btn-md tm-btn-primary tm-btn-block"
        href={feed.data?.webcalUrl ? googleCalendarAddUrl(feed.data.webcalUrl) : undefined}
        target="_blank"
        rel="noopener noreferrer"
      >
        구글 캘린더에 추가<span className="sr-only"> (새 창으로 열려요)</span>
      </a>
    );

  return (
    <>
      <BottomSheet open onClose={busy ? () => undefined : onClose} title="내 캘린더에 연결">
        <div className="tm-calendar-connect">
          {failed ? <AlertBanner tone="warning" message="캘린더 주소를 가져오지 못했어요. 잠시 후 다시 시도해 주세요." /> : null}

          {connected && feed.data ? (
            <>
              <div className="tm-calendar-connect-actions">
                {primary}
                <Button type="button" variant="neutral" block onClick={() => void onCopy()}>
                  {copied === 'done' ? '복사했어요' : '주소 복사'}
                </Button>
              </div>
              {copied === 'failed' ? <p className="tm-text-caption" role="status">복사하지 못했어요. 아래 주소를 길게 눌러 복사해 주세요.</p> : null}
              <ul className="tm-text-caption tm-calendar-connect-help">
                {PLATFORM_HELP[platform].map((line) => <li key={line}>{line}</li>)}
              </ul>
              <input
                className="tm-calendar-connect-url"
                readOnly
                aria-label="캘린더 구독 주소"
                value={feed.data.feedUrl ?? ''}
                onFocus={(event) => event.currentTarget.select()}
              />
              <p className="tm-text-body">
                앞으로 있을 팀 일정과 내 경기가 캘린더에 자동으로 들어와요. 일정이 바뀌면 캘린더도 따라 바뀌고, 끝나거나 취소된 일정과 불참을 누른 일정은 들어오지 않아요.
              </p>
              <p className="tm-text-caption tm-calendar-connect-warning">
                이 주소를 아는 사람은 내 일정을 볼 수 있어요. 다른 사람에게 알려 주지 마세요.
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={() => void onRegenerate()} loading={regenerate.isPending} disabled={busy}>
                주소 다시 만들기
              </Button>
            </>
          ) : failed ? (
            <Button type="button" variant="neutral" block onClick={() => { connect.reset(); void feed.refetch(); }}>
              다시 시도
            </Button>
          ) : (
            <p className="tm-text-caption" role="status">캘린더 주소를 만드는 중이에요…</p>
          )}
        </div>
      </BottomSheet>
      {ConfirmModal}
    </>
  );
}
