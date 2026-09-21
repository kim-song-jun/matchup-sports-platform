'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import {
  useV1AdminMe,
  useV1CreateAdminTeamMatchRecruitment,
  useV1MasterRegions,
  useV1MasterSports,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import { MultiPresetChipSelector } from '@/components/v1-ui/create-form-fields';
import { teamMatchDateErrors } from '@/lib/team-match-dates';
import { V1_LEVELS } from '@/lib/v1-levels';
import { toDistrictRegionOptions } from '@/lib/v1-regions';

const inputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
const MATCH_STYLE_OPTIONS = ['친선', '매너 중시', '교환매치', '실력 중심', '초보 환영', '기타'] as const;
const UNIFORM_COLOR_OPTIONS = ['흰색', '검정', '빨강', '파랑', '노랑', '초록', '주황', '남색'] as const;
const GENDER_OPTIONS = ['성별 무관', '남', '여'] as const;

function formatOptions(sport?: { code?: string; name: string }) {
  const value = (sport?.code ?? sport?.name ?? '').toLowerCase();
  if (value.includes('futsal') || sport?.name.includes('풋살')) return ['6:6', '5:5', '4:4'];
  if (value.includes('soccer') || value.includes('football') || sport?.name.includes('축구')) return ['11:11', '9:9', '8:8', '7:7'];
  return [];
}

function moneyNote(totalCost: string, opponentCost: string) {
  const total = Math.max(0, Number(totalCost) || 0);
  const opponent = Math.max(0, Number(opponentCost) || 0);
  return total || opponent
    ? `총 ${total.toLocaleString('ko-KR')}원 · 상대팀 ${opponent.toLocaleString('ko-KR')}원`
    : null;
}

export default function AdminTeamMatchNewPage() {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;
  const [sportId, setSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [addressText, setAddressText] = useState('');
  const [deadlineAt, setDeadlineAt] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [levelCode, setLevelCode] = useState('');
  const [matchFormat, setMatchFormat] = useState('');
  const [matchStyle, setMatchStyle] = useState<string[]>([]);
  const [uniformColor, setUniformColor] = useState('');
  const [genderRule, setGenderRule] = useState('성별 무관');
  const [totalCost, setTotalCost] = useState('0');
  const [opponentCost, setOpponentCost] = useState('0');
  const [uploadingImage, setUploadingImage] = useState(false);

  const { data: sports } = useV1MasterSports();
  const { data: regions } = useV1MasterRegions();
  const regionOptions = toDistrictRegionOptions(regions ?? []);
  const createRecruitment = useV1CreateAdminTeamMatchRecruitment();
  const uploadImages = useV1UploadImages();
  const selectedSport = sports?.find((sport) => sport.id === sportId);
  const matchFormatOptions = useMemo(() => formatOptions(selectedSport), [selectedSport]);

  const startDate = startsAt ? new Date(startsAt) : null;
  const deadlineDate = deadlineAt ? new Date(deadlineAt) : null;
  const endDate = endsAt ? new Date(endsAt) : null;
  const dateErrors = teamMatchDateErrors({ startsAt, endsAt, deadlineAt });
  const datesValid = startsAt !== '' && Object.keys(dateErrors).length === 0;
  const canSubmit =
    canWrite &&
    sportId !== '' &&
    regionId !== '' &&
    title.trim() !== '' &&
    placeName.trim() !== '' &&
    startsAt !== '' &&
    datesValid &&
    !uploadingImage;

  const uploadImage = async (file: File | undefined) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const result = await uploadImages.mutateAsync([file]);
      setImageUrl(result.urls[0] ?? '');
    } catch (error) {
      showToast(extractErrorMessage(error, '이미지를 업로드하지 못했어요.'), 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const submit = async () => {
    if (!canSubmit || !startDate) return;
    try {
      const result = await createRecruitment.mutateAsync({
        clientCommandId: randomUuid(),
        sportId,
        regionId,
        title: title.trim(),
        description: description.trim() || null,
        imageUrl: imageUrl || null,
        startsAt: startDate.toISOString(),
        endsAt: endDate?.toISOString() ?? null,
        deadlineAt: deadlineDate?.toISOString() ?? null,
        manualPlaceName: placeName.trim(),
        addressText: addressText.trim() || null,
        costNote: moneyNote(totalCost, opponentCost),
        rulesText: null,
        minLevelCode: levelCode || null,
        maxLevelCode: levelCode || null,
        genderRule,
        matchFormat: matchFormat.trim() || null,
        matchStyle,
        uniformColor: uniformColor.trim() || null,
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
        description="일반 팀매치와 같은 경기 조건으로 모집한 뒤, 신청 목록에서 참가할 두 팀을 확정해요."
      />

      {!canWrite && adminMe ? (
        <div role="alert" className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
          지원 관리자에게는 팀매치 모집 생성 권한이 없어요.
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 md:p-5">
            <div>
              <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">모집 조건</h2>
              <p className="mt-1 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">이 단계에서는 팀을 지정하지 않아요. 같은 종목의 팀들이 모집에 신청할 수 있어요.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
                종목
                <select aria-label="종목" value={sportId} onChange={(event) => { setSportId(event.target.value); setMatchFormat(''); }} className={"mt-1 " + inputClass}>
                  <option value="">종목 선택</option>
                  {(sports ?? []).map((sport) => <option key={sport.id} value={sport.id}>{sport.name}</option>)}
                </select>
              </label>
              <label className="text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
                지역
                <select aria-label="지역" value={regionId} onChange={(event) => setRegionId(event.target.value)} className={"mt-1 " + inputClass}>
                  <option value="">시·군·구 선택</option>
                  {regionOptions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 md:p-5">
            <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">경기 정보</h2>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
              매치 제목
              <input aria-label="매치 제목" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="예: 강남 주말 친선전" className={"mt-1 " + inputClass} />
            </label>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
              모집 안내 (선택)
              <textarea aria-label="모집 안내 (선택)" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} className={`${inputClass} mt-1 h-auto min-h-[112px] py-3`} />
            </label>
            <div>
              <label htmlFor="admin-team-match-image" className="block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">대표 이미지</label>
              <input
                id="admin-team-match-image"
                aria-label="대표 이미지"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploadingImage}
                onChange={(event) => void uploadImage(event.target.files?.[0])}
                className="mt-1 block min-h-[44px] w-full text-[length:var(--font-size-body-sm)] text-[var(--text-muted)] file:mr-3 file:min-h-[44px] file:rounded-xl file:border-0 file:bg-[var(--surface-soft)] file:px-4 file:font-semibold file:text-[var(--text-body)]"
              />
              {imageUrl ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
                  <div role="img" aria-label="대표 이미지 미리보기" className="h-40 bg-cover bg-center" style={{ backgroundImage: `url("${imageUrl.replaceAll('"', '%22')}")` }} />
                  <button type="button" onClick={() => setImageUrl('')} className="min-h-[44px] w-full text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-muted)]">이미지 제거</button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 md:p-5">
            <div>
              <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">경기 조건</h2>
              <p className="mt-1 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">일반 팀매치와 동일하게 등급, 방식, 스타일, 유니폼, 성별과 비용을 설정해요.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
                실력등급
                <select aria-label="실력등급" value={levelCode} onChange={(event) => setLevelCode(event.target.value)} className={"mt-1 " + inputClass}>
                  <option value="">등급 미지정</option>
                  {V1_LEVELS.map((level) => <option key={level.code} value={level.code}>{level.label}</option>)}
                </select>
              </label>
              <label className="text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
                경기방식
                <input aria-label="경기방식" list="admin-team-match-formats" value={matchFormat} onChange={(event) => setMatchFormat(event.target.value)} maxLength={20} placeholder="예: 5:5" className={"mt-1 " + inputClass} />
                <datalist id="admin-team-match-formats">{matchFormatOptions.map((format) => <option key={format} value={format} />)}</datalist>
              </label>
              <label className="text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
                유니폼 색상
                <input aria-label="유니폼 색상" list="admin-team-match-uniforms" value={uniformColor} onChange={(event) => setUniformColor(event.target.value)} maxLength={20} placeholder="예: 파랑" className={"mt-1 " + inputClass} />
                <datalist id="admin-team-match-uniforms">{UNIFORM_COLOR_OPTIONS.map((color) => <option key={color} value={color} />)}</datalist>
              </label>
              <label className="text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
                성별 조건
                <select aria-label="성별 조건" value={genderRule} onChange={(event) => setGenderRule(event.target.value)} className={"mt-1 " + inputClass}>
                  {GENDER_OPTIONS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
                </select>
              </label>
            </div>
            <MultiPresetChipSelector
              label="경기 스타일"
              options={MATCH_STYLE_OPTIONS}
              values={matchStyle}
              allowFreeText
              freeTextPlaceholder="목록에 없으면 직접 입력해 주세요"
              maxItems={3}
              onChange={setMatchStyle}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
                총비용
                <div className="relative mt-1">
                  <input aria-label="총비용" type="number" min="0" step="1000" value={totalCost} onChange={(event) => setTotalCost(event.target.value)} className={inputClass + " pr-10"} />
                  <span className="pointer-events-none absolute right-3 top-3 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">원</span>
                </div>
              </label>
              <label className="text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
                상대팀 부담금
                <div className="relative mt-1">
                  <input aria-label="상대팀 부담금" type="number" min="0" step="1000" value={opponentCost} onChange={(event) => setOpponentCost(event.target.value)} className={inputClass + " pr-10"} />
                  <span className="pointer-events-none absolute right-3 top-3 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">원</span>
                </div>
              </label>
            </div>
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">상대팀 부담금이 0원이면 무료 초청으로 안내돼요.</p>
          </section>

          <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 md:p-5">
            <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">장소와 시간</h2>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
              경기 장소
              <input aria-label="경기 장소" value={placeName} onChange={(event) => setPlaceName(event.target.value)} maxLength={120} placeholder="장소명" className={"mt-1 " + inputClass} />
            </label>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
              상세 주소 (선택)
              <input aria-label="상세 주소 (선택)" value={addressText} onChange={(event) => setAddressText(event.target.value)} maxLength={200} placeholder="도로명 주소 또는 코트 안내" className={"mt-1 " + inputClass} />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
                경기 시작
                <input aria-label="경기 시작" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} min={deadlineAt || undefined} className={"mt-1 " + inputClass} />
              </label>
              <label className="text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
                경기 종료 (선택)
                <input aria-label="경기 종료 (선택)" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} min={startsAt || undefined} className={"mt-1 " + inputClass} />
              </label>
            </div>
            <label className="block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
              신청 마감 (선택)
              <input aria-label="신청 마감" type="datetime-local" value={deadlineAt} onChange={(event) => setDeadlineAt(event.target.value)} max={startsAt || undefined} className={"mt-1 " + inputClass} />
              <span className="mt-1 block text-[length:var(--font-size-caption)] font-normal text-[var(--text-muted)]">비워두면 경기 시작 전까지 신청을 받아요.</span>
            </label>
            {Object.entries(dateErrors).map(([field, message]) => <p key={field} role="alert" className="text-[length:var(--font-size-body-sm)] text-red-500">{message}</p>)}
          </section>

          <div className="rounded-xl bg-[var(--surface-soft)] p-4 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
            생성 후 팀매치 목록에 모집 중으로 공개돼요. 신청이 모이면 관리자 상세에서 홈팀과 상대팀을 선택해 확정할 수 있어요.
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit || createRecruitment.isPending}
            className="min-h-[48px] w-full rounded-xl bg-blue-500 px-5 text-[length:var(--font-size-body-sm)] font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            {createRecruitment.isPending ? '모집 만드는 중…' : '팀 신청 모집 시작하기'}
          </button>
        </div>
      )}

      <AdminToasts toasts={toasts} />
    </div>
  );
}
