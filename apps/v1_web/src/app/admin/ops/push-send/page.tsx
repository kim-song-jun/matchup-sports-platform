'use client';

import { AdminPageHeader } from '@/components/admin';
import { PushSendForm } from '@/components/admin/push-send-form';
import { PushHistoryView } from '@/components/admin/push-history-view';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { useState, type KeyboardEvent } from 'react';
import { useV1AdminMe } from '@/hooks/use-v1-api';

export default function AdminPushSendPage() {
  const [tab, setTab] = useState('send');
  const { data: admin } = useV1AdminMe();
  const canSend = admin?.adminRole === 'owner' || admin?.adminRole === 'ops';
  const activeTab = canSend ? tab : 'history';
  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || tabs.length === 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
  }
  return (
    <>
      <AdminPageHeader
        eyebrow="운영"
        title="푸시 발송"
        description="앱·웹 알림을 보내고, 발송 이력과 표시 내용을 확인해요."
      />
      <div className="mb-5 max-w-sm" onKeyDown={onTabKeyDown}>
        <SegmentedTabs role="tablist" ariaLabel="푸시 발송 메뉴" activeId={activeTab} onSelect={setTab} items={[
          { id: 'send', label: '발송하기', disabled: !canSend },
          { id: 'history', label: '발송 이력' },
        ]} />
      </div>
      {canSend && <div role="tabpanel" aria-label="발송하기" hidden={activeTab !== 'send'} className="tm-content-enter">
        <PushSendForm />
      </div>}
      {activeTab === 'history' && <div role="tabpanel" aria-label="발송 이력" className="tm-content-enter"><PushHistoryView /></div>}
    </>
  );
}
