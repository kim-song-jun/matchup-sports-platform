'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import {
  useV1AdminMe,
  useV1CreateAdminTeamMatchRecruitment,
  useV1MasterRegions,
  useV1MasterSports,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import { toDistrictRegionOptions } from '@/lib/v1-regions';

const inputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

export default function AdminTeamMatchNewPage() {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;
  const [sportId, setSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [addressText, setAddressText] = useState('');
  const [deadlineAt, setDeadlineAt] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const { data: sports } = useV1MasterSports();
  const { data: regions } = useV1MasterRegions();
  const regionOptions = toDistrictRegionOptions(regions ?? []);
  const createRecruitment = useV1CreateAdminTeamMatchRecruitment();
  const canSubmit =
    canWrite &&
    sportId !== '' &&
    regionId !== '' &&
    title.trim() !== '' &&
    placeName.trim() !== '' &&
    deadlineAt !== '' &&
    startsAt !== '' &&
    new Date(deadlineAt) < new Date(startsAt);

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const result = await createRecruitment.mutateAsync({
        clientCommandId: randomUuid(),
        sportId,
        regionId,
        title: title.trim(),
        description: description.trim() || null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        deadlineAt: new Date(deadlineAt).toISOString(),
        manualPlaceName: placeName.trim(),
        addressText: addressText.trim() || null,
      });
      router.push(result.detailRoute);
    } catch (error) {
      showToast(extractErrorMessage(error, '팀매치 모집을 만들지 못했어요.'), 'error');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <AdminPageHeader
        eyebrow="플랫폼 관리"
        title="팀매치 모집 만들기"
        description="경기 조건을 등록해 팀 신청을 받은 뒤, 신청 목록에서 참가할 두 팀을 확정해요."
      />

      {!canWrite && adminMe ? (
        <div role="alert" className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-muted)]">
          지원 관리자에게는 팀매치 모집 생성 권한이 없어요.
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 md:p-5">
            <div>
              <h2 className="text-base font-bold text-[var(--text-strong)]">모집 조건</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">이 단계에서는 팀을 지정하지 않아요. 같은 종목의 팀들이 모집에 신청할 수 있어요.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="admin-team-match-sport" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">종목</label>
                <select id="admin-team-match-sport" value={sportId} onChange={(event) => setSportId(event.target.value)} className={inputClass}>
                  <option value="">종목 선택</option>
                  {(sports ?? []).map((sport) => <option key={sport.id} value={sport.id}>{sport.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="admin-team-match-region" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">지역</label>
                <select id="admin-team-match-region" value={regionId} onChange={(event) => setRegionId(event.target.value)} className={inputClass}>
                  <option value="">시·군·구 선택</option>
                  {regionOptions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 md:p-5">
            <h2 className="text-base font-bold text-[var(--text-strong)]">경기 정보</h2>
            <div>
              <label htmlFor="admin-team-match-title" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">매치 제목</label>
              <input id="admin-team-match-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="예: 강남 주말 친선전" className={inputClass} />
            </div>
            <div>
              <label htmlFor="admin-team-match-place" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">경기 장소</label>
              <input id="admin-team-match-place" value={placeName} onChange={(event) => setPlaceName(event.target.value)} maxLength={120} placeholder="장소명" className={inputClass} />
            </div>
            <div>
              <label htmlFor="admin-team-match-address" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">상세 주소 (선택)</label>
              <input id="admin-team-match-address" value={addressText} onChange={(event) => setAddressText(event.target.value)} maxLength={200} placeholder="도로명 주소 또는 코트 안내" className={inputClass} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="admin-team-match-deadline" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">신청 마감</label>
                <input id="admin-team-match-deadline" type="datetime-local" value={deadlineAt} onChange={(event) => setDeadlineAt(event.target.value)} max={startsAt || undefined} className={inputClass} />
              </div>
              <div>
                <label htmlFor="admin-team-match-start" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">경기 시작</label>
                <input id="admin-team-match-start" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} min={deadlineAt || undefined} className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="admin-team-match-end" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">경기 종료 (선택)</label>
              <input id="admin-team-match-end" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} min={startsAt || undefined} className={inputClass} />
            </div>
            <div>
              <label htmlFor="admin-team-match-description" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">모집 안내 (선택)</label>
              <textarea id="admin-team-match-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} className={`${inputClass} h-auto min-h-[112px] py-3`} />
            </div>
          </section>

          <div className="rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-muted)]">
            생성 후 팀매치 목록에 모집 중으로 공개돼요. 신청이 모이면 관리자 상세에서 홈팀과 상대팀을 선택해 확정할 수 있어요.
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit || createRecruitment.isPending}
            className="min-h-[48px] w-full rounded-xl bg-blue-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            {createRecruitment.isPending ? '모집 만드는 중…' : '팀 신청 모집 시작하기'}
          </button>
        </div>
      )}

      <AdminToasts toasts={toasts} />
    </div>
  );
}
