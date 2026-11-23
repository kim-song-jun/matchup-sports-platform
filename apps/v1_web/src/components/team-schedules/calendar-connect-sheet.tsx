'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { useCalendarFeed, useConnectCalendarFeed, useRegenerateCalendarFeed } from '@/hooks/use-calendar-feed';

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

export function CalendarConnectSheet({ onClose }: { onClose: () => void }) {
  const feed = useCalendarFeed();
  const connect = useConnectCalendarFeed();
  const regenerate = useRegenerateCalendarFeed();
  const { confirm, ConfirmModal } = useConfirm();
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);

  const connected = feed.data?.connected === true;
  const busy = connect.isPending || regenerate.isPending;
  const failed = feed.isError || connect.isError || regenerate.isError;

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

  return (
    <>
      <BottomSheet open onClose={busy ? () => undefined : onClose} title="내 캘린더에 연결">
        <div className="tm-calendar-connect">
          <p className="tm-text-body">
            아이폰 캘린더·구글 캘린더에 팀 일정과 내 경기가 자동으로 들어와요. 일정이 바뀌거나 취소되면 캘린더도 따라 바뀌고, 불참을 누른 일정은 들어오지 않아요.
          </p>

          {failed ? <AlertBanner tone="warning" message="캘린더 주소를 가져오지 못했어요. 잠시 후 다시 시도해 주세요." /> : null}

          {feed.isLoading ? (
            <p className="tm-text-caption" role="status">불러오는 중이에요…</p>
          ) : connected && feed.data ? (
            <>
              <div className="tm-calendar-connect-actions">
                <a className="tm-btn tm-btn-md tm-btn-primary tm-btn-block" href={feed.data.webcalUrl ?? undefined}>
                  폰 캘린더에서 열기
                </a>
                <Button type="button" variant="neutral" block onClick={() => void onCopy()}>
                  {copied === 'done' ? '복사했어요' : '주소 복사'}
                </Button>
              </div>
              {copied === 'failed' ? <p className="tm-text-caption" role="status">복사하지 못했어요. 아래 주소를 길게 눌러 복사해 주세요.</p> : null}
              <input
                className="tm-calendar-connect-url"
                readOnly
                aria-label="캘린더 구독 주소"
                value={feed.data.feedUrl ?? ''}
                onFocus={(event) => event.currentTarget.select()}
              />
              <ul className="tm-text-caption tm-calendar-connect-help">
                <li>아이폰: 「폰 캘린더에서 열기」를 누르고 구독을 확인해 주세요.</li>
                <li>구글 캘린더: 캘린더 설정 → 「URL로 추가」에 주소를 붙여 넣어 주세요.</li>
                <li>반영은 바로 되지 않아요. 아이폰은 수 시간, 구글은 최대 하루 걸릴 수 있어요.</li>
              </ul>
              <p className="tm-text-caption tm-calendar-connect-warning">
                이 주소를 아는 사람은 내 일정을 볼 수 있어요. 다른 사람에게 알려 주지 마세요.
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={() => void onRegenerate()} loading={regenerate.isPending} disabled={busy}>
                주소 다시 만들기
              </Button>
            </>
          ) : (
            <Button type="button" variant="primary" block onClick={() => connect.mutate()} loading={connect.isPending} disabled={busy || feed.isError}>
              캘린더 주소 만들기
            </Button>
          )}
        </div>
      </BottomSheet>
      {ConfirmModal}
    </>
  );
}
