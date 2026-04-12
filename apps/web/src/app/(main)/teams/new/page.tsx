'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Globe, Video } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { useToast } from '@/components/ui/toast';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { api } from '@/lib/api';
import { sportLabel } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Card } from '@/components/ui/card';

const sportTypes = ['soccer', 'futsal', 'basketball', 'badminton', 'ice_hockey', 'swimming', 'tennis', 'baseball', 'volleyball', 'figure_skating', 'short_track'];

const cities = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

export default function CreateTeamPage() {
  const router = useRouter();
  const { toast } = useToast();
  useRequireAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    sportType: '',
    description: '',
    city: '',
    district: '',
    contactInfo: '',
    level: 3,
    isRecruiting: true,
    snsLinks: { instagram: '', youtube: '', kakaotalk: '' },
    shortsUrl: '',
  });

  const handleSubmit = async () => {
    if (!form.name) return toast('error', '팀명을 입력해주세요');
    if (!form.sportType) return toast('error', '종목을 선택해주세요');
    if (!form.city) return toast('error', '활동 지역을 선택해주세요');

    const payload = {
      name: form.name,
      sportType: form.sportType,
      description: form.description || undefined,
      city: form.city,
      district: form.district || undefined,
      contactInfo: form.contactInfo || undefined,
      level: form.level,
      isRecruiting: form.isRecruiting,
      instagramUrl: form.snsLinks.instagram || undefined,
      youtubeUrl: form.snsLinks.youtube || undefined,
      kakaoOpenChat: form.snsLinks.kakaotalk || undefined,
      shortsUrl: form.shortsUrl || undefined,
    };

    setIsSubmitting(true);
    try {
      await api.post('/teams', payload);
      toast('success', '팀이 등록되었어요!');
      router.push('/teams');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '등록에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <MobileGlassHeader title="팀 등록" showBack />

      {/* Desktop breadcrumb */}
      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/teams" className="hover:text-gray-600 transition-colors">팀/클럽</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-200">팀 등록</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl">
        {/* 팀명 */}
        <FormField label="팀명" required htmlFor="team-name" className="mb-5">
          <Input
            id="team-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={50}
            placeholder="팀/동호회 이름을 입력해주세요"
          />
        </FormField>

        {/* 종목 */}
        <FormField label="종목" required className="mb-5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="종목 선택">
            {sportTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm({ ...form, sportType: type })}
                aria-pressed={form.sportType === type}
                className={`rounded-lg px-3.5 py-2 min-h-11 text-sm font-medium transition-colors ${
                  form.sportType === type
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {sportLabel[type] || type}
              </button>
            ))}
          </div>
        </FormField>

        {/* 팀 소개 */}
        <FormField label="팀 소개" htmlFor="team-description" className="mb-5">
          <Textarea
            id="team-description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={1000}
            placeholder="팀 소개, 활동 시간, 분위기 등을 자유롭게 적어주세요"
            rows={4}
            className="min-h-[120px] resize-none"
          />
        </FormField>

        {/* 활동 지역 */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <FormField label="시/도" required htmlFor="team-city">
            <Select
              id="team-city"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            >
              <option value="">선택</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </FormField>
          <FormField label="구/군" htmlFor="team-district">
            <Input
              id="team-district"
              value={form.district}
              onChange={(e) => setForm({ ...form, district: e.target.value })}
              placeholder="예: 강남구"
            />
          </FormField>
        </div>

        {/* 모집 여부 */}
        <FormField label="팀원 모집" className="mb-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, isRecruiting: true })}
              className={`rounded-xl py-3 text-base font-semibold transition-colors ${
                form.isRecruiting
                  ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                  : 'border border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              모집중
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, isRecruiting: false })}
              className={`rounded-xl py-3 text-base font-semibold transition-colors ${
                !form.isRecruiting
                  ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                  : 'border border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              모집 마감
            </button>
          </div>
        </FormField>

        {/* 연락처 */}
        <FormField label="연락처" htmlFor="team-contactInfo" className="mb-5">
          <Input
            id="team-contactInfo"
            value={form.contactInfo}
            onChange={(e) => setForm({ ...form, contactInfo: e.target.value })}
            placeholder="카카오톡 ID 또는 연락 가능한 연락처"
          />
        </FormField>

        {/* SNS 링크 */}
        <Card className="mb-5" padding="sm">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={16} className="text-gray-500" />
            <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">SNS 링크</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label htmlFor="team-instagram" className="block text-xs text-gray-500 mb-1">Instagram</label>
              <Input
                id="team-instagram"
                value={form.snsLinks.instagram}
                onChange={(e) => setForm({ ...form, snsLinks: { ...form.snsLinks, instagram: e.target.value } })}
                placeholder="https://instagram.com/..."
              />
            </div>
            <div>
              <label htmlFor="team-youtube" className="block text-xs text-gray-500 mb-1">YouTube</label>
              <Input
                id="team-youtube"
                value={form.snsLinks.youtube}
                onChange={(e) => setForm({ ...form, snsLinks: { ...form.snsLinks, youtube: e.target.value } })}
                placeholder="https://youtube.com/..."
              />
            </div>
            <div>
              <label htmlFor="team-kakaotalk" className="block text-xs text-gray-500 mb-1">카카오톡 오픈채팅</label>
              <Input
                id="team-kakaotalk"
                value={form.snsLinks.kakaotalk}
                onChange={(e) => setForm({ ...form, snsLinks: { ...form.snsLinks, kakaotalk: e.target.value } })}
                placeholder="https://open.kakao.com/..."
              />
            </div>
          </div>
        </Card>

        {/* 홍보 영상(Shorts) */}
        <Card className="mb-5" padding="sm">
          <div className="flex items-center gap-2 mb-3">
            <Video size={16} className="text-gray-500" />
            <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">홍보 영상 (Shorts)</h3>
          </div>
          <label htmlFor="team-shortsUrl" className="sr-only">홍보 영상 URL</label>
          <Input
            id="team-shortsUrl"
            value={form.shortsUrl}
            onChange={(e) => setForm({ ...form, shortsUrl: e.target.value })}
            placeholder="YouTube Shorts 또는 Instagram Reels URL"
          />
          <p className="text-xs text-gray-500 mt-1.5">팀 활동을 보여주는 짧은 영상 링크를 등록하세요</p>
        </Card>

        {/* 등록 버튼 */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          fullWidth
          size="lg"
          className="mb-6"
        >
          {isSubmitting ? '등록 중...' : '팀 등록하기'}
        </Button>
      </div>
      <div className="h-24" />
    </div>
  );
}
