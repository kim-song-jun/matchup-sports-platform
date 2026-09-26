'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AdminEmpty, AdminPageHeader, AdminTableSkeleton, AdminToasts, useAdminToast } from '@/components/admin';
import { toDatetimeLocalValue } from '@/components/team-schedules/team-schedules.view-model';
import {
  useV1AdminMe,
  useV1AdminTeamMatch,
  useV1MasterRegions,
  useV1UpdateAdminTeamMatchRecruitment,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import { teamMatchDateErrors } from '@/lib/team-match-dates';
import { V1_LEVELS } from '@/lib/v1-levels';
import { toDistrictRegionOptions } from '@/lib/v1-regions';
import type { V1AdminTeamMatchDetail } from '@/types/api';

const inputClass = 'mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60';

function EditForm({ teamMatch }: { teamMatch: V1AdminTeamMatchDetail }) {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const { data: adminMe } = useV1AdminMe();
  const { data: regions } = useV1MasterRegions();
  const mutation = useV1UpdateAdminTeamMatchRecruitment(teamMatch.teamMatchId);
  const uploadImages = useV1UploadImages();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;
  const [title, setTitle] = useState(teamMatch.title);
  const [description, setDescription] = useState(teamMatch.description ?? '');
  const [imageUrl, setImageUrl] = useState(teamMatch.imageUrl ?? '');
  const [regionId, setRegionId] = useState(teamMatch.regionId);
  const [placeName, setPlaceName] = useState(teamMatch.placeName);
  const [addressText, setAddressText] = useState(teamMatch.placeAddress ?? '');
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(teamMatch.startAt));
  const [endsAt, setEndsAt] = useState(toDatetimeLocalValue(teamMatch.endAt));
  const [deadlineAt, setDeadlineAt] = useState(toDatetimeLocalValue(teamMatch.deadlineAt));
  const [minLevelCode, setMinLevelCode] = useState(teamMatch.minLevelCode ?? '');
  const [maxLevelCode, setMaxLevelCode] = useState(teamMatch.maxLevelCode ?? '');
  const [matchFormat, setMatchFormat] = useState(teamMatch.matchFormat ?? '');
  const [matchStyle, setMatchStyle] = useState(teamMatch.matchStyle.join(', '));
  const [genderRule, setGenderRule] = useState(teamMatch.genderRule ?? '');
  const [uniformColor, setUniformColor] = useState(teamMatch.uniformColor ?? '');
  const [costNote, setCostNote] = useState(teamMatch.costNote ?? '');
  const [rulesText, setRulesText] = useState(teamMatch.formatNote ?? '');
  const [uploading, setUploading] = useState(false);
  const dateErrors = teamMatchDateErrors({ startsAt, endsAt, deadlineAt, existingDeadlineAt: teamMatch.deadlineAt });
  const canSubmit = canWrite && title.trim() !== '' && regionId !== '' && placeName.trim() !== '' && startsAt !== '' && Object.keys(dateErrors).length === 0 && !uploading;

  const uploadImage = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadImages.mutateAsync([file]);
      setImageUrl(result.urls[0] ?? imageUrl);
    } catch (error) {
      showToast(extractErrorMessage(error, '이미지를 업로드하지 못했어요.'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const result = await mutation.mutateAsync({
        clientCommandId: randomUuid(),
        version: teamMatch.version,
        sportId: teamMatch.sportId,
        regionId,
        title: title.trim(),
        description: description.trim() || null,
        imageUrl: imageUrl || null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        deadlineAt: deadlineAt ? new Date(deadlineAt).toISOString() : null,
        manualPlaceName: placeName.trim(),
        addressText: addressText.trim() || null,
        costNote: costNote.trim() || null,
        rulesText: rulesText.trim() || null,
        minLevelCode: minLevelCode || null,
        maxLevelCode: maxLevelCode || null,
        genderRule: genderRule.trim() || null,
        matchFormat: matchFormat.trim() || null,
        matchStyle: matchStyle.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 3),
        uniformColor: uniformColor.trim() || null,
      });
      router.push(result.detailRoute);
    } catch (error) {
      showToast(extractErrorMessage(error, '팀매치 모집을 수정하지 못했어요.'), 'error');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <AdminPageHeader
        eyebrow="플랫폼 · 팀매치"
        title="팀매치 모집 수정"
        description="신청 팀을 확정하기 전까지 모집 조건을 수정할 수 있어요. 종목은 변경할 수 없어요."
        action={<Link href={`/admin/team-matches/${encodeURIComponent(teamMatch.teamMatchId)}`} className="inline-flex h-[44px] items-center rounded-xl border border-[var(--border)] px-4 text-[length:var(--font-size-body-sm)] font-semibold">상세로</Link>}
      />
      {!canWrite && adminMe ? (
        <div role="alert" className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">모집을 수정할 권한이 없어요.</div>
      ) : (
        <div className="space-y-5">
          <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
            <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">기본 정보</h2>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium">종목<input aria-label="종목" value={teamMatch.sportName} disabled className={inputClass} /></label>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium">제목<input aria-label="제목" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} className={inputClass} /></label>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium">모집 안내<textarea aria-label="모집 안내" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} className={`${inputClass} py-3`} /></label>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium">지역<select aria-label="지역" value={regionId} onChange={(event) => setRegionId(event.target.value)} className={inputClass}><option value="">지역 선택</option>{toDistrictRegionOptions(regions ?? []).map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>
            <div>
              <label htmlFor="admin-team-match-edit-image" className="block text-[length:var(--font-size-body-sm)] font-medium">대표 이미지</label>
              <input id="admin-team-match-edit-image" aria-label="대표 이미지" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => void uploadImage(event.target.files?.[0])} className="mt-1 min-h-[44px] w-full text-[length:var(--font-size-body-sm)] file:mr-3 file:min-h-[44px] file:rounded-xl file:border-0 file:px-4" />
              {imageUrl && <button type="button" onClick={() => setImageUrl('')} className="mt-2 min-h-[44px] rounded-lg px-3 text-[length:var(--font-size-body-sm)] font-semibold text-red-600">현재 이미지 제거</button>}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
            <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">장소와 시간</h2>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium">경기 장소<input aria-label="경기 장소" value={placeName} onChange={(event) => setPlaceName(event.target.value)} maxLength={120} className={inputClass} /></label>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium">상세 주소<input aria-label="상세 주소" value={addressText} onChange={(event) => setAddressText(event.target.value)} maxLength={200} className={inputClass} /></label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-[length:var(--font-size-body-sm)] font-medium">경기 시작<input aria-label="경기 시작" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={inputClass} /></label>
              <label className="text-[length:var(--font-size-body-sm)] font-medium">경기 종료<input aria-label="경기 종료" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={inputClass} /></label>
            </div>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium">신청 마감<input aria-label="신청 마감" type="datetime-local" value={deadlineAt} onChange={(event) => setDeadlineAt(event.target.value)} className={inputClass} /></label>
            {Object.entries(dateErrors).map(([field, message]) => <p key={field} role="alert" className="text-[length:var(--font-size-body-sm)] text-red-500">{message}</p>)}
          </section>

          <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
            <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">경기 조건</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-[length:var(--font-size-body-sm)] font-medium">최소 등급<select aria-label="최소 등급" value={minLevelCode} onChange={(event) => setMinLevelCode(event.target.value)} className={inputClass}><option value="">미지정</option>{V1_LEVELS.map((level) => <option key={level.code} value={level.code}>{level.label}</option>)}</select></label>
              <label className="text-[length:var(--font-size-body-sm)] font-medium">최대 등급<select aria-label="최대 등급" value={maxLevelCode} onChange={(event) => setMaxLevelCode(event.target.value)} className={inputClass}><option value="">미지정</option>{V1_LEVELS.map((level) => <option key={level.code} value={level.code}>{level.label}</option>)}</select></label>
              <label className="text-[length:var(--font-size-body-sm)] font-medium">경기 형식<input aria-label="경기 형식" value={matchFormat} onChange={(event) => setMatchFormat(event.target.value)} maxLength={20} className={inputClass} /></label>
              <label className="text-[length:var(--font-size-body-sm)] font-medium">유니폼 색<input aria-label="유니폼 색" value={uniformColor} onChange={(event) => setUniformColor(event.target.value)} maxLength={20} className={inputClass} /></label>
              <label className="text-[length:var(--font-size-body-sm)] font-medium">성별 조건<input aria-label="성별 조건" value={genderRule} onChange={(event) => setGenderRule(event.target.value)} maxLength={20} className={inputClass} /></label>
              <label className="text-[length:var(--font-size-body-sm)] font-medium">경기 성격<input aria-label="경기 성격" value={matchStyle} onChange={(event) => setMatchStyle(event.target.value)} placeholder="쉼표로 최대 3개" className={inputClass} /></label>
            </div>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium">비용 안내<input aria-label="비용 안내" value={costNote} onChange={(event) => setCostNote(event.target.value)} maxLength={500} className={inputClass} /></label>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium">경기 규칙<textarea aria-label="경기 규칙" value={rulesText} onChange={(event) => setRulesText(event.target.value)} maxLength={2000} rows={3} className={`${inputClass} py-3`} /></label>
          </section>

          <button type="button" disabled={!canSubmit || mutation.isPending} onClick={() => void submit()} className="min-h-[48px] w-full rounded-xl bg-blue-500 px-5 text-[length:var(--font-size-body-sm)] font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50">{mutation.isPending ? '저장 중…' : '수정 내용 저장'}</button>
        </div>
      )}
      <AdminToasts toasts={toasts} />
    </div>
  );
}

export default function AdminTeamMatchEditPage() {
  const params = useParams<{ id: string }>();
  const { data, isPending, isError, error, refetch } = useV1AdminTeamMatch(params.id);
  if (isPending) return <AdminTableSkeleton rows={6} />;
  if (isError || !data) return <AdminEmpty title="팀매치 정보를 불러오지 못했어요" description={extractErrorMessage(error, '잠시 후 다시 시도해 주세요.')} action={<button type="button" onClick={() => void refetch()} className="min-h-[44px] rounded-xl bg-blue-500 px-4 text-[length:var(--font-size-body-sm)] font-semibold text-white">다시 시도</button>} />;
  if (!data.platformManaged || data.status !== 'recruiting' || data.league || data.tournament) return <AdminEmpty title="수정할 수 없는 팀매치예요" description="플랫폼이 모집 중인 단발 팀매치만 여기에서 수정할 수 있어요." action={<Link href={`/admin/team-matches/${encodeURIComponent(data.teamMatchId)}`} className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border)] px-4 text-[length:var(--font-size-body-sm)] font-semibold">상세로</Link>} />;
  return <EditForm key={data.version} teamMatch={data} />;
}
