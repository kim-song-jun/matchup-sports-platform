'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Save, XCircle, AlertTriangle, Swords } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useTeamMatch } from '@/hooks/use-api';
import { SKILL_GRADES, MATCH_TYPES } from '@/lib/skill-grades';
import type { SkillGrade, MatchType } from '@/lib/skill-grades';
import { api } from '@/lib/api';
import { Toggle } from '@/components/ui/toggle';

const sportOptions = [
  { value: 'soccer', label: '축구' },
  { value: 'futsal', label: '풋살' },
];

const quarterOptions = [2, 4, 6, 8, 10];

const matchStyleOptions = [
  { value: 'friendly', label: '친선', desc: '즐겁게 경기' },
  { value: 'competitive', label: '경쟁', desc: '승부 중심' },
  { value: 'manner_focused', label: '매너 중시', desc: '매너 우선' },
];

const gameFormatOptions = ['11:11', '8:8', '6:6', '5:5'] as const;

interface FormData {
  title: string;
  sportType: string;
  matchDate: string;
  startTime: string;
  endTime: string;
  quarterCount: number;
  venueName: string;
  venueAddress: string;
  totalFee: string;
  opponentFee: string;
  requiredLevel: string;
  skillGrade: SkillGrade;
  proPlayerCount: number;
  gameFormat: string;
  matchType: MatchType;
  uniformColor: string;
  hasProPlayers: boolean;
  allowMercenary: boolean;
  matchStyle: string;
  hasReferee: boolean;
  notes: string;
}

export default function EditTeamMatchPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const { data: match, isLoading } = useTeamMatch(id);

  const [form, setForm] = useState<FormData>({
    title: '',
    sportType: '',
    matchDate: '',
    startTime: '',
    endTime: '',
    quarterCount: 4,
    venueName: '',
    venueAddress: '',
    totalFee: '',
    opponentFee: '',
    requiredLevel: 'middle',
    skillGrade: 'B',
    proPlayerCount: 0,
    gameFormat: '11:11',
    matchType: 'invitation',
    uniformColor: '',
    hasProPlayers: false,
    allowMercenary: false,
    matchStyle: 'friendly',
    hasReferee: false,
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (match) {
      setForm({
        title: match.title || '',
        sportType: match.sportType || '',
        matchDate: match.matchDate || '',
        startTime: match.startTime || '',
        endTime: match.endTime || '',
        quarterCount: match.quarterCount ?? 4,
        venueName: match.venueName || '',
        venueAddress: match.venueAddress || '',
        totalFee: match.totalFee != null ? String(match.totalFee) : '',
        opponentFee: match.opponentFee != null ? String(match.opponentFee) : '',
        requiredLevel: (match.requiredLevel != null ? String(match.requiredLevel) : 'middle'),
        skillGrade: (match.skillGrade as SkillGrade) || 'B',
        proPlayerCount: match.proPlayerCount ?? 0,
        gameFormat: match.gameFormat || '11:11',
        matchType: (match.matchType as MatchType) || 'invitation',
        uniformColor: match.uniformColor || '',
        hasProPlayers: match.hasProPlayers ?? false,
        allowMercenary: match.allowMercenary ?? false,
        matchStyle: match.matchStyle || 'friendly',
        hasReferee: match.hasReferee ?? false,
        notes: match.notes || '',
      });
    }
  }, [match]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const formatCurrency = (n: string) =>
    n ? new Intl.NumberFormat('ko-KR').format(Number(n)) + '원' : '';

  const handleSave = async () => {
    if (!form.title || !form.sportType || !form.matchDate || !form.startTime || !form.endTime || !form.venueName || !form.totalFee) {
      toast('error', '필수 항목을 입력해주세요');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        ...form,
        totalFee: Number(form.totalFee),
        opponentFee: form.opponentFee ? Number(form.opponentFee) : 0,
      };
      await api.patch(`/team-matches/${id}`, payload);
      toast('success', '모집글이 수정되었어요');
      router.push(`/team-matches/${id}`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '모집글 수정에 실패했어요. 다시 시도해주세요');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await api.patch(`/team-matches/${id}`, { status: 'cancelled' });
      toast('success', '모집글이 취소되었어요');
      router.push('/my/team-matches');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '취소하지 못했어요. 다시 시도해주세요');
    } finally {
      setIsCancelling(false);
      setShowCancelModal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-10 bg-gray-100 dark:bg-gray-700 rounded-xl" />
          <div className="h-48 bg-gray-100 dark:bg-gray-700 rounded-xl" />
          <div className="h-48 bg-gray-100 dark:bg-gray-700 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={Swords}
          title="모집글을 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 모집글이에요"
          action={{ label: '목록으로', href: '/team-matches' }}
        />
      </div>
    );
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white dark:focus:bg-gray-800 transition-colors';

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Mobile header */}
      <MobileGlassHeader className="gap-3">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="glass-mobile-icon-button flex items-center justify-center min-h-11 min-w-11 rounded-xl">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1">모집글 수정</h1>
      </MobileGlassHeader>

      {/* Desktop breadcrumb */}
      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/team-matches" className="hover:text-gray-600">팀 매칭</Link>
        <ChevronRight size={14} />
        <Link href={`/team-matches/${id}`} className="hover:text-gray-600">{match.title}</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-200">수정</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl">
        {/* 종목 선택 */}
        <section className="mb-6">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">종목 선택</label>
          <div className="grid grid-cols-2 gap-2">
            {sportOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update('sportType', opt.value)}
                className={`rounded-xl px-4 py-4 text-md font-semibold text-center transition-colors ${
                  form.sportType === opt.value
                    ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                    : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 모집글 제목 */}
        <section className="mb-5">
          <label htmlFor="team-match-edit-title" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
            모집글 제목 <span className="text-red-400">*</span>
          </label>
          <input
            id="team-match-edit-title"
            type="text"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="예: 일요일 오전 친선경기 모집합니다"
            className={inputClass}
          />
        </section>

        {/* 경기 날짜 */}
        <section className="mb-5">
          <label htmlFor="team-match-edit-date" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
            경기 날짜 <span className="text-red-400">*</span>
          </label>
          <input
            id="team-match-edit-date"
            type="date"
            value={form.matchDate}
            onChange={(e) => update('matchDate', e.target.value)}
            className={inputClass}
          />
        </section>

        {/* 시간 */}
        <section className="mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="team-match-edit-start-time" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
                시작 시간 <span className="text-red-400">*</span>
              </label>
              <input
                id="team-match-edit-start-time"
                type="time"
                value={form.startTime}
                onChange={(e) => update('startTime', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="team-match-edit-end-time" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
                종료 시간 <span className="text-red-400">*</span>
              </label>
              <input
                id="team-match-edit-end-time"
                type="time"
                value={form.endTime}
                onChange={(e) => update('endTime', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* 쿼터 수 */}
        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">쿼터 수</label>
          <div className="flex gap-2">
            {quarterOptions.map((q) => (
              <button
                key={q}
                onClick={() => update('quarterCount', q)}
                className={`flex-1 rounded-xl py-3 text-base font-semibold transition-colors ${
                  form.quarterCount === q
                    ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                    : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </section>

        {/* 장소 */}
        <section className="mb-5">
          <label htmlFor="team-match-edit-venue-name" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
            장소명 <span className="text-red-400">*</span>
          </label>
          <input
            id="team-match-edit-venue-name"
            type="text"
            value={form.venueName}
            onChange={(e) => update('venueName', e.target.value)}
            placeholder="예: 난지천 풋살장"
            className={inputClass}
          />
        </section>

        <section className="mb-5">
          <label htmlFor="team-match-edit-venue-address" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">장소 주소 (선택)</label>
          <input
            id="team-match-edit-venue-address"
            type="text"
            value={form.venueAddress}
            onChange={(e) => update('venueAddress', e.target.value)}
            placeholder="예: 서울시 마포구 상암동 481-6"
            className={inputClass}
          />
        </section>

        {/* 실력등급 */}
        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">실력등급</label>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {SKILL_GRADES.map((g) => (
              <button
                key={g.grade}
                onClick={() => update('skillGrade', g.grade as SkillGrade)}
                className={`shrink-0 rounded-xl px-4 py-2.5 text-center transition-colors ${
                  form.skillGrade === g.grade
                    ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                    : 'border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <p className={`text-base font-bold ${form.skillGrade === g.grade ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                  {g.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 whitespace-nowrap">{g.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* 선출선수 */}
        <section className="mb-5">
          <label htmlFor="team-match-edit-pro-player-count" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">선출선수 (명)</label>
          <input
            id="team-match-edit-pro-player-count"
            type="number"
            min={0}
            max={10}
            value={form.proPlayerCount}
            onChange={(e) => update('proPlayerCount', Math.min(10, Math.max(0, Number(e.target.value))))}
            placeholder="0"
            className={inputClass}
          />
          <p className="text-xs text-gray-500 mt-1">팀 내 축구/풋살 선출 출신 선수 수 (0~10명)</p>
        </section>

        {/* 경기방식 */}
        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">경기방식</label>
          <div className="flex gap-2">
            {gameFormatOptions.map((fmt) => (
              <button
                key={fmt}
                onClick={() => update('gameFormat', fmt)}
                className={`flex-1 rounded-xl py-3 text-base font-semibold transition-colors ${
                  form.gameFormat === fmt
                    ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                    : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </section>

        {/* 매치 유형 */}
        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">매치 유형</label>
          <div className="space-y-2">
            {MATCH_TYPES.map((mt) => (
              <label
                key={mt.value}
                className={`flex items-center gap-3 w-full rounded-xl px-4 py-3.5 cursor-pointer transition-colors ${
                  form.matchType === mt.value
                    ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                    : 'border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="matchType"
                  value={mt.value}
                  checked={form.matchType === mt.value}
                  onChange={() => update('matchType', mt.value as MatchType)}
                  className="h-4 w-4 text-blue-500 border-gray-300 focus:ring-blue-500"
                />
                <div>
                  <p className={`text-base font-semibold ${form.matchType === mt.value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                    {mt.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{mt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* 경기 스타일 */}
        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">경기 스타일</label>
          <div className="space-y-2">
            {matchStyleOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update('matchStyle', opt.value)}
                className={`w-full rounded-xl px-4 py-3.5 text-left transition-colors ${
                  form.matchStyle === opt.value
                    ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                    : 'border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <p className={`text-base font-semibold ${form.matchStyle === opt.value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* 유니폼 색상 */}
        <section className="mb-5">
          <label htmlFor="team-match-edit-uniform-color" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">유니폼 색상</label>
          <input
            id="team-match-edit-uniform-color"
            type="text"
            value={form.uniformColor}
            onChange={(e) => update('uniformColor', e.target.value)}
            placeholder="예: 빨강 상의 + 검정 하의"
            className={inputClass}
          />
        </section>

        {/* 토글 필드들 */}
        <section className="mb-5 space-y-3">
          <ToggleField
            label="용병 허용"
            checked={form.allowMercenary}
            onChange={(v) => update('allowMercenary', v)}
          />
          <ToggleField
            label="심판 배정"
            checked={form.hasReferee}
            onChange={(v) => update('hasReferee', v)}
          />
        </section>

        {/* 비용 */}
        <section className="mb-5">
          <label htmlFor="team-match-edit-total-fee" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
            총 비용 (원) <span className="text-red-400">*</span>
          </label>
          <input
            id="team-match-edit-total-fee"
            type="number"
            value={form.totalFee}
            onChange={(e) => update('totalFee', e.target.value)}
            placeholder="예: 200000"
            className={inputClass}
          />
          {form.totalFee && (
            <p className="text-xs text-gray-500 mt-1">{formatCurrency(form.totalFee)}</p>
          )}
        </section>

        <section className="mb-5">
          <label htmlFor="team-match-edit-opponent-fee" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">상대팀 부담금 (원, 선택)</label>
          <input
            id="team-match-edit-opponent-fee"
            type="number"
            value={form.opponentFee}
            onChange={(e) => update('opponentFee', e.target.value)}
            placeholder="비워두면 총 비용의 절반"
            className={inputClass}
          />
          {form.opponentFee && (
            <p className="text-xs text-gray-500 mt-1">{formatCurrency(form.opponentFee)}</p>
          )}
        </section>

        {/* 추가 안내 */}
        <section className="mb-6">
          <label htmlFor="team-match-edit-notes" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">추가 안내 (선택)</label>
          <textarea
            id="team-match-edit-notes"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="유니폼 색상, 주차 안내, 기타 규정 등"
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </section>

        {/* Action buttons */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setShowCancelModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-red-200 px-5 py-3.5 text-base font-semibold text-red-500 hover:bg-red-50 transition-colors"
          >
            <XCircle size={16} />
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            {isSubmitting ? '저장 중...' : '수정 완료'}
          </button>
        </div>
      </div>

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6 animate-fade-in">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">모집글을 취소하시겠어요?</h3>
            <p className="text-base text-gray-500 text-center mt-2">취소하면 신청한 팀들에게 알림이 발송돼요.</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                돌아가기
              </button>
              <button
                onClick={handleCancel}
                disabled={isCancelling}
                className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {isCancelling ? '취소 중...' : '취소하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3.5"
      onClick={() => onChange(!checked)}
    >
      <span className="text-base font-medium text-gray-800 dark:text-gray-200">{label}</span>
      <Toggle
        label={label}
        enabled={checked}
        onToggle={() => onChange(!checked)}
      />
    </div>
  );
}
