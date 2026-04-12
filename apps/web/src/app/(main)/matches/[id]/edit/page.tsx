'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChevronRight, SearchX } from 'lucide-react';
import Link from 'next/link';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { useToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import { ImageUpload, type ImageUploadState } from '@/components/ui/image-upload';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useMatch, useUpdateMatch, useVenues } from '@/hooks/use-api';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { sportLabel, levelLabel } from '@/lib/constants';
import { getSportDetailImageSet } from '@/lib/sport-image';
import type { UpdateMatchInput, Venue } from '@/types/api';
import {
  firstUploadUrl,
  toExistingUploadAsset,
  type UploadAsset,
} from '@/lib/uploads';
import { extractErrorMessage } from '@/lib/utils';

const sportTypes = ['soccer', 'futsal', 'basketball', 'badminton', 'ice_hockey', 'swimming', 'tennis', 'baseball', 'volleyball', 'figure_skating', 'short_track'];

function toDateInputValue(value?: string | null) {
  return value ? value.split('T')[0] : '';
}

function buildUpdatePayload(form: {
  sportType: string;
  title: string;
  description: string;
  venueId: string;
  matchDate: string;
  startTime: string;
  endTime: string;
  maxPlayers: number;
  fee: number;
  levelMin: number;
  levelMax: number;
  gender: string;
  imageUrl?: string | null;
}): UpdateMatchInput {
  return {
    sportType: form.sportType,
    title: form.title.trim(),
    description: form.description.trim(),
    venueId: form.venueId,
    matchDate: form.matchDate,
    startTime: form.startTime,
    endTime: form.endTime,
    maxPlayers: Number(form.maxPlayers),
    fee: Number(form.fee),
    levelMin: Number(form.levelMin),
    levelMax: Number(form.levelMax),
    gender: form.gender,
    imageUrl: form.imageUrl ?? null,
  };
}

export default function EditMatchPage() {
  useRequireAuth();
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const matchId = params.id as string;
  const { data: apiMatch, isLoading } = useMatch(matchId);
  const updateMatchMutation = useUpdateMatch();
  const hydratedMatchIdRef = useRef<string | null>(null);

  const [form, setForm] = useState({
    sportType: '',
    title: '',
    description: '',
    venueId: '',
    matchDate: '',
    startTime: '',
    endTime: '',
    maxPlayers: 10,
    fee: 15000,
    levelMin: 1,
    levelMax: 5,
    gender: 'any',
  });
  const [imageAssets, setImageAssets] = useState<UploadAsset[]>([]);
  const [uploadState, setUploadState] = useState<ImageUploadState>({
    hasPendingUploads: false,
    hasUploadErrors: false,
    pendingCount: 0,
  });
  const fallbackImages = getSportDetailImageSet(
    form.sportType || apiMatch?.sportType || 'soccer',
    [firstUploadUrl(imageAssets), apiMatch?.imageUrl].filter(Boolean) as string[],
    `${matchId}-edit-form`,
    3,
  );
  const hasExistingMatchImage = imageAssets.length > 0;

  const { data: venuesData } = useVenues(form.sportType ? { sportType: form.sportType } : undefined);
  const venues: Venue[] = Array.isArray(venuesData) ? venuesData : (venuesData?.items ?? []);

  const guardImageUpload = () => {
    if (uploadState.hasPendingUploads) {
      toast('error', '이미지 업로드가 끝난 뒤 저장할 수 있어요');
      return false;
    }
    if (uploadState.hasUploadErrors) {
      toast('error', '실패한 이미지를 다시 시도하거나 제거해주세요');
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (apiMatch && hydratedMatchIdRef.current !== apiMatch.id) {
      setForm({
        sportType: apiMatch.sportType || '',
        title: apiMatch.title || '',
        description: apiMatch.description || '',
        venueId: apiMatch.venueId || apiMatch.venue?.id || '',
        matchDate: toDateInputValue(apiMatch.matchDate),
        startTime: apiMatch.startTime || '',
        endTime: apiMatch.endTime || '',
        maxPlayers: apiMatch.maxPlayers || 10,
        fee: apiMatch.fee ?? 15000,
        levelMin: apiMatch.levelMin || 1,
        levelMax: apiMatch.levelMax || 5,
        gender: apiMatch.gender || 'any',
      });
      setImageAssets(apiMatch.imageUrl ? [toExistingUploadAsset(apiMatch.imageUrl)] : []);
      hydratedMatchIdRef.current = apiMatch.id;
    }
  }, [apiMatch]);

  const handleSave = async () => {
    if (!guardImageUpload()) return;
    if (!form.title) return toast('error', '제목을 입력해주세요');
    if (!form.venueId) return toast('error', '시설을 선택해주세요');
    if (form.levelMin > form.levelMax) {
      return toast('error', '최소 레벨은 최대 레벨보다 높을 수 없어요');
    }
    try {
      await updateMatchMutation.mutateAsync({
        id: matchId,
        data: buildUpdatePayload({
          ...form,
          imageUrl: firstUploadUrl(imageAssets) ?? null,
        }),
      });
      toast('success', '매치 정보가 저장되었어요');
      router.push(`/matches/${matchId}`);
    } catch (error) {
      toast('error', extractErrorMessage(error, '수정에 실패했어요'));
    }
  };

  if (isLoading) {
    return (
      <div className="pt-[var(--safe-area-top)] @3xl:pt-0 px-5 @3xl:px-0 pb-8 max-w-lg">
        <div className="h-11 w-32 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse mb-6" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="mb-5">
            <div className="h-3 w-16 rounded bg-gray-100 dark:bg-gray-800 animate-pulse mb-2" />
            <div className="h-11 w-full rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!apiMatch) {
    return (
      <div className="px-5 @3xl:px-0 pt-10">
        <EmptyState
          icon={SearchX}
          title="매치를 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 매치예요"
          action={{ label: '매치 목록으로', href: '/matches' }}
        />
      </div>
    );
  }

  if (apiMatch.status === 'completed' || apiMatch.status === 'cancelled') {
    return (
      <div className="px-5 @3xl:px-0 pt-10">
        <EmptyState
          icon={SearchX}
          title="종료된 매치는 수정할 수 없어요"
          description="취소되었거나 이미 완료된 매치는 상세 화면에서 기록만 확인할 수 있어요"
          action={{ label: '매치 상세로', href: `/matches/${matchId}` }}
        />
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <MobileGlassHeader title="매치 수정" showBack />
      <div className="hidden @3xl:flex items-center gap-2 text-xs text-gray-500 mb-6">
        <Link href="/matches" className="hover:text-gray-600 transition-colors">매치 찾기</Link>
        <ChevronRight size={12} />
        <Link href={`/matches/${matchId}`} className="hover:text-gray-600 transition-colors">매치 상세</Link>
        <ChevronRight size={12} />
        <span className="text-gray-700 dark:text-gray-300">수정</span>
      </div>

      <div className="px-5 @3xl:px-0 pb-8 max-w-lg">
        {/* Sport Type */}
        <FormSection label="종목">
          <div className="flex flex-wrap gap-2">
            {sportTypes.map((type) => (
              <button key={type} onClick={() => setForm({ ...form, sportType: type })}
                className={`min-h-[44px] rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  form.sportType === type ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-500'
                }`}>
                {sportLabel[type] || type}
              </button>
            ))}
          </div>
        </FormSection>

        {/* Title */}
        <FormSection label="제목" id="edit-title">
          <Input id="edit-title" type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </FormSection>

        {/* Description */}
        <FormSection label="설명" id="edit-description">
          <Textarea id="edit-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="resize-none" />
        </FormSection>

        {/* Images */}
        <FormSection label="대표 이미지">
          <ImageUpload
            value={imageAssets}
            onChange={setImageAssets}
            onStateChange={setUploadState}
            max={1}
            accept="image/jpeg,image/png,image/webp,image/gif"
            maxSizeMB={10}
          />
          {!hasExistingMatchImage && fallbackImages.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {fallbackImages.map((src, index) => (
                <div key={`${src}-${index}`} className="relative shrink-0 h-20 w-20 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-700">
                  <img
                    src={src}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover opacity-60"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {hasExistingMatchImage
              ? '저장된 이미지는 제거/교체할 수 있어요.'
              : '대표 이미지가 없으면 기본 스포츠 이미지가 노출돼요.'}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            이미지 변경은 저장 후 실제 매치에 반영돼요.
          </p>
          {uploadState.hasPendingUploads && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              이미지 업로드가 끝난 뒤 저장할 수 있어요.
            </p>
          )}
          {uploadState.hasUploadErrors && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-400">
              실패한 이미지를 다시 시도하거나 제거해주세요.
            </p>
          )}
        </FormSection>

        {/* Venue */}
        <FormSection label="시설">
          {venues.length > 0 ? (
            <div className="space-y-2">
              {venues.map((v) => (
                <button key={v.id} onClick={() => setForm({ ...form, venueId: v.id })}
                  className={`w-full text-left rounded-xl p-3 transition-colors ${
                    form.venueId === v.id ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}>
                  <p className={`text-sm font-semibold ${form.venueId === v.id ? '' : 'text-gray-900 dark:text-gray-100'}`}>{v.name}</p>
                  <p className={`text-xs mt-0.5 ${form.venueId === v.id ? 'opacity-60' : 'text-gray-500'}`}>{v.address}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 py-2">종목을 선택하면 시설 목록이 나타나요</p>
          )}
        </FormSection>

        {/* Date & Time */}
        <FormSection label="일시" id="edit-matchDate">
          <div className="grid grid-cols-3 gap-3">
            <Input id="edit-matchDate" type="date" value={form.matchDate} onChange={(e) => setForm({ ...form, matchDate: e.target.value })} />
            <label htmlFor="edit-startTime" className="sr-only">시작 시간</label>
            <Input id="edit-startTime" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            <label htmlFor="edit-endTime" className="sr-only">종료 시간</label>
            <Input id="edit-endTime" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </div>
        </FormSection>

        {/* Max Players & Fee */}
        <FormSection label="인원 · 참가비" id="edit-maxPlayers">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-maxPlayers" className="block text-xs text-gray-500 mb-1">최대 인원</label>
              <Input id="edit-maxPlayers" type="number" value={form.maxPlayers} onChange={(e) => setForm({ ...form, maxPlayers: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label htmlFor="edit-fee" className="block text-xs text-gray-500 mb-1">참가비 (원)</label>
              <Input id="edit-fee" type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
        </FormSection>

        {/* Level Range */}
        <FormSection label="레벨 범위" id="edit-levelMin">
          <div className="grid grid-cols-2 gap-3">
            <Select id="edit-levelMin" value={form.levelMin} onChange={(e) => setForm({ ...form, levelMin: parseInt(e.target.value) })}>
              {[1,2,3,4,5].map(l => <option key={l} value={l}>{levelLabel[l]}</option>)}
            </Select>
            <label htmlFor="edit-levelMax" className="sr-only">최대 레벨</label>
            <Select id="edit-levelMax" value={form.levelMax} onChange={(e) => setForm({ ...form, levelMax: parseInt(e.target.value) })}>
              {[1,2,3,4,5].map(l => <option key={l} value={l}>{levelLabel[l]}</option>)}
            </Select>
          </div>
        </FormSection>

        {/* Gender */}
        <FormSection label="성별 제한">
          <div className="flex gap-2">
            {[{ value: 'any', label: '무관' }, { value: 'male', label: '남성' }, { value: 'female', label: '여성' }].map((g) => (
              <button key={g.value} onClick={() => setForm({ ...form, gender: g.value })}
                className={`min-h-[44px] rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  form.gender === g.value ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-500'
                }`}>
                {g.label}
              </button>
            ))}
          </div>
        </FormSection>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button onClick={() => router.back()}
            className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-800 py-3 text-base font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            돌아가기
          </button>
          <button onClick={handleSave} disabled={updateMatchMutation.isPending || uploadState.hasPendingUploads || uploadState.hasUploadErrors} data-testid="match-edit-save"
            className="flex-1 rounded-xl bg-blue-500 py-3 text-base font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors">
            {updateMatchMutation.isPending ? '수정 중...' : '수정 완료'}
          </button>
        </div>
      </div>
      <div className="h-24" />
    </div>
  );
}

function FormSection({ label, id, children }: { label: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      {id ? (
        <label htmlFor={id} className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{label}</label>
      ) : (
        <p className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{label}</p>
      )}
      {children}
    </div>
  );
}
