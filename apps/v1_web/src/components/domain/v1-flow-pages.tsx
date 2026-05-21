'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CalendarDays, Check, Clock, MapPin, ShieldCheck, Users } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Section } from '@/components/ui/section';
import { personalMatches, teamMatches, teams } from '@/lib/mock-data';
import type { MatchCard as MockMatch, TeamCard as MockTeam } from '@/lib/mock-data';
import {
  useV1Match,
  useV1Matches,
  useV1MyTeams,
  useV1Team,
  useV1TeamMatch,
  useV1UpdateMatch,
  useV1UpdateTeam,
  useV1UpdateTeamMatch,
} from '@/hooks/use-v1-api';
import type { V1Match, V1Team } from '@/types/api';

type MatchKind = 'personal' | 'team';
type FormStep = 'start' | 'sport' | 'place-time' | 'team' | 'info' | 'confirm' | 'complete' | 'edit';

const personalMatch = personalMatches[0];
const teamMatch = teamMatches[0];
const team = teams[0];

export function MatchDetailProductPage({ kind = 'personal' }: { kind?: MatchKind }) {
  const isTeam = kind === 'team';
  const matchQuery = useV1Match('match-1');
  const teamMatchQuery = useV1TeamMatch('team-match-1');
  const match = isTeam
    ? toFlowMatch(teamMatchQuery.data, teamMatch)
    : toFlowMatch(matchQuery.data, personalMatch);
  const basePath = isTeam ? '/team-matches' : '/matches';

  return (
    <AppShell>
      <main className="v1-main">
        <article className="v1-card v1-card-pad">
          <div className="v1-hero-media" style={{ borderRadius: 8, margin: '-4px -4px 16px' }}>
            <div className="v1-hero-text">
              <Badge tone="blue">{isTeam ? '팀매치' : '개인 매치'}</Badge>
              <p className="v1-hero-title">{match.title}</p>
            </div>
          </div>
          <div className="v1-meta">
            <Badge tone={match.tone}>{statusLabel(match.status)}</Badge>
            <Badge>{match.sport}</Badge>
            <Badge>{match.level}</Badge>
          </div>
          <div className="v1-stack" style={{ marginTop: 16 }}>
            <InfoRow icon={<CalendarDays size={18} />} label="일정" value={match.schedule} />
            <InfoRow icon={<MapPin size={18} />} label="장소" value={match.place} />
            <InfoRow icon={<Users size={18} />} label="모집" value={match.capacity} />
          </div>
          <div className="v1-divider" />
          <p className="v1-body">
            v1 1차 화면은 신청, 승인 대기, 확정, 마감 상태를 같은 상세 구조에서 보여줍니다. 결제와 환불은 아직 제공하지
            않으며 신청 상태만 명확히 표시합니다.
          </p>
        </article>

        <Section title="다음 행동">
          <div className="v1-grid-2">
            <Link className="v1-quick v1-quick-primary" href={isTeam ? '/chat/chat-2' : '/chat/chat-1'}>
              연결 채팅
            </Link>
            <Link className="v1-quick" href={`${basePath}/${match.id}/edit`}>
              수정 화면
            </Link>
          </div>
        </Section>
      </main>
    </AppShell>
  );
}

export function MatchFormProductPage({ kind = 'personal', step = 'start' }: { kind?: MatchKind; step?: FormStep }) {
  const isTeam = kind === 'team';
  const updateMatch = useV1UpdateMatch('match-1');
  const updateTeamMatch = useV1UpdateTeamMatch('team-match-1');
  const mutationState = isTeam ? updateTeamMatch.status : updateMatch.status;
  const steps = isTeam
    ? ['종목', '팀 선택', '장소/시간', '상세 정보', '확인']
    : ['종목', '장소/시간', '상세 정보', '확인'];
  const activeIndex = Math.max(0, stepIndex(step, isTeam));
  const title = step === 'edit' ? '모집글 수정' : isTeam ? '팀매치 만들기' : '개인 매치 만들기';

  return (
    <AppShell>
      <main className="v1-main">
        <section className="v1-card v1-card-pad">
          <Badge tone={step === 'complete' ? 'green' : 'blue'}>{step === 'complete' ? '완료' : '작성 중'}</Badge>
          <h2 className="v1-item-title" style={{ marginTop: 10 }}>{title}</h2>
          <p className="v1-body" style={{ marginTop: 6 }}>
            {step === 'complete'
              ? '모집글이 등록되었습니다. 상세 화면과 연결 채팅으로 이어지는 상태를 확인합니다.'
              : `디자인 시안의 단계형 작성 흐름을 v1 화면 구조로 옮긴 상태입니다. 저장 hook 상태: ${mutationState}`}
          </p>
        </section>

        {step !== 'complete' ? (
          <Section title="작성 단계">
            <div className="v1-list">
              {steps.map((label, index) => (
                <div key={label} className="v1-card v1-card-pad">
                  <div className="v1-row">
                    <div>
                      <Badge tone={index <= activeIndex ? 'blue' : 'grey'}>{index + 1}</Badge>
                      <p className="v1-item-title" style={{ marginTop: 8 }}>{label}</p>
                      <p className="v1-caption" style={{ marginTop: 4 }}>{stepCopy(label)}</p>
                    </div>
                    {index < activeIndex ? <Check size={20} color="var(--green)" /> : <Clock size={20} color="var(--text-caption)" />}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        <Section title={step === 'complete' ? '등록 결과' : '입력 요약'}>
          <div className="v1-card v1-card-pad">
            <div className="v1-stack">
              <InfoRow icon={<ShieldCheck size={18} />} label="권한" value={isTeam ? '팀 owner/manager만 작성 가능' : '로그인 사용자'} />
              <InfoRow icon={<MapPin size={18} />} label="장소" value={isTeam ? teamMatch.place : personalMatch.place} />
              <InfoRow icon={<CalendarDays size={18} />} label="일정" value={isTeam ? teamMatch.schedule : personalMatch.schedule} />
            </div>
          </div>
        </Section>
      </main>
    </AppShell>
  );
}

export function MatchCollectionProductPage({ mode }: { mode: 'joined' | 'created' | 'participants' }) {
  const matchesQuery = useV1Matches();
  const items = matchesQuery.data?.items.map((item) => toFlowMatch(item, personalMatch)) ?? [personalMatch, personalMatches[1]];
  const title = mode === 'joined' ? '참여한 매치' : mode === 'created' ? '만든 매치' : '참여자 관리';
  return (
    <AppShell>
      <main className="v1-main">
        <Section title={title} subtitle="목록, 승인 대기, 마감 같은 중복 시안은 같은 리스트 컴포넌트의 상태 variant로 관리합니다.">
          <div className="v1-list">
            {items.map((match) => (
              <Link key={match.id} className="v1-card v1-card-pad v1-card-link" href={`/matches/${match.id}`}>
                <div className="v1-row">
                  <div>
                    <Badge tone={match.tone}>{statusLabel(match.status)}</Badge>
                    <p className="v1-item-title" style={{ marginTop: 8 }}>{match.title}</p>
                    <p className="v1-caption" style={{ marginTop: 4 }}>{match.place} · {match.schedule}</p>
                  </div>
                  <Badge>{mode === 'participants' ? match.capacity : match.sport}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      </main>
    </AppShell>
  );
}

export function TeamDetailProductPage({ mode = 'detail' }: { mode?: 'detail' | 'members' | 'edit' | 'new' | 'my' }) {
  const isEdit = mode === 'edit' || mode === 'new';
  const teamQuery = useV1Team('team-1');
  const updateTeam = useV1UpdateTeam('team-1');
  const item = toFlowTeam(teamQuery.data, team);
  return (
    <AppShell>
      <main className="v1-main">
        <section className="v1-card v1-card-pad">
          <Badge tone={item.trust === 'verified' ? 'green' : 'orange'}>{trustLabel(item.trust)}</Badge>
          <h2 className="v1-item-title" style={{ marginTop: 10 }}>{mode === 'new' ? '팀 만들기' : item.name}</h2>
          <p className="v1-body" style={{ marginTop: 6 }}>
            {isEdit
              ? `팀명, 종목, 활동 지역, 가입 승인 방식을 한 화면에서 수정합니다. 저장 hook 상태: ${updateTeam.status}`
              : `${item.region} · ${item.sport} · ${item.members}`}
          </p>
        </section>

        {isEdit ? <TeamFormSummary team={item} /> : <TeamOverview mode={mode} team={item} />}
      </main>
    </AppShell>
  );
}

export function MyTeamsProductPage({ members = false }: { members?: boolean }) {
  const myTeamsQuery = useV1MyTeams();
  const items = myTeamsQuery.data?.items.map((item) => ({
    id: item.teamId,
    name: item.name,
    sport: item.sport.name,
    region: item.region?.name ?? '지역 미정',
    members: `${item.memberCount}명`,
    trust: 'sample' as const,
    joinStatus: 'approval_required' as const,
  })) ?? teams.slice(0, 2);
  return (
    <AppShell>
      <main className="v1-main">
        <Section title={members ? '팀 멤버 관리' : '내 팀'} subtitle="내 팀, 멤버 승인, 팀 허브 화면은 같은 팀 데이터에서 파생되는 상태입니다.">
          <div className="v1-list">
            {items.map((item) => (
              <Link key={item.id} className="v1-card v1-card-pad v1-card-link" href={`/my/teams/${item.id}`}>
                <div className="v1-row">
                  <div>
                    <Badge tone={item.trust === 'verified' ? 'green' : 'orange'}>{trustLabel(item.trust)}</Badge>
                    <p className="v1-item-title" style={{ marginTop: 8 }}>{item.name}</p>
                    <p className="v1-caption" style={{ marginTop: 4 }}>{item.region} · {item.members}</p>
                  </div>
                  <Badge>{members ? '승인 대기' : item.sport}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      </main>
    </AppShell>
  );
}

function TeamOverview({ mode, team }: { mode: 'detail' | 'members' | 'edit' | 'new' | 'my'; team: MockTeam }) {
  return (
    <>
      <Section title={mode === 'members' ? '멤버' : '팀 정보'}>
        <div className="v1-list">
          {['운영자', '승인 대기', '활동 멤버'].map((label, index) => (
            <div key={label} className="v1-card v1-card-pad">
              <div className="v1-row">
                <div>
                  <p className="v1-item-title">{label}</p>
                  <p className="v1-caption" style={{ marginTop: 4 }}>
                    {index === 0 ? '권한 변경은 owner만 가능합니다.' : index === 1 ? '가입 신청을 승인하거나 거절합니다.' : '최근 활동 기준 샘플 목록입니다.'}
                  </p>
                </div>
                <Badge tone={index === 1 ? 'blue' : 'grey'}>{index === 1 ? '2명' : 'sample'}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="팀 액션">
        <div className="v1-grid-2">
          <Link className="v1-quick v1-quick-primary" href="/team-matches/new">팀매치 만들기</Link>
          <Link className="v1-quick" href={`/teams/${team.id}/members`}>멤버 보기</Link>
        </div>
      </Section>
    </>
  );
}

function TeamFormSummary({ team }: { team: MockTeam }) {
  return (
    <Section title="팀 설정">
      <div className="v1-card v1-card-pad">
        <div className="v1-stack">
          <InfoRow icon={<Users size={18} />} label="가입 방식" value="승인 필요" />
          <InfoRow icon={<MapPin size={18} />} label="활동 지역" value={team.region} />
          <InfoRow icon={<ShieldCheck size={18} />} label="신뢰 표시" value="검증/추정/샘플 구분 유지" />
        </div>
      </div>
    </Section>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="v1-row" style={{ gridTemplateColumns: 'auto 1fr' }}>
      <span className="v1-icon-button" style={{ width: 34, height: 34, background: 'var(--surface-soft)' }}>{icon}</span>
      <div>
        <p className="v1-caption">{label}</p>
        <p className="v1-body" style={{ fontWeight: 800 }}>{value}</p>
      </div>
    </div>
  );
}

function statusLabel(status: string) {
  return status === 'open' ? '모집 중' : status === 'pending' ? '승인 대기' : status === 'confirmed' ? '확정' : '마감';
}

function trustLabel(trust: string) {
  return trust === 'verified' ? '검증됨' : trust === 'estimated' ? '추정' : '샘플';
}

function stepIndex(step: FormStep, isTeam: boolean) {
  if (step === 'sport' || step === 'start' || step === 'edit') return 0;
  if (step === 'team') return 1;
  if (step === 'place-time') return isTeam ? 2 : 1;
  if (step === 'info') return isTeam ? 3 : 2;
  if (step === 'confirm' || step === 'complete') return isTeam ? 4 : 3;
  return 0;
}

function stepCopy(label: string) {
  if (label === '종목') return '서비스 전체 지원 종목을 줄이지 않고 동일하게 노출합니다.';
  if (label === '팀 선택') return '내가 관리 권한을 가진 팀만 선택할 수 있습니다.';
  if (label === '장소/시간') return '시간과 장소는 상세/수정 화면까지 같은 값으로 이어집니다.';
  if (label === '상세 정보') return '모집 조건과 안내 문구를 입력합니다.';
  return '등록 전 권한, 상태, 누락 값을 확인합니다.';
}

function toFlowMatch(match: V1Match | undefined, fallback: MockMatch): MockMatch {
  if (!match) return fallback;

  return {
    id: match.id,
    title: match.title,
    sport: match.sportName,
    level: match.levelLabel,
    place: match.placeName,
    schedule: formatShortDate(match.startsAt),
    capacity: match.capacityText,
    status: match.status === 'cancelled' ? 'closed' : match.status,
    tone: match.status === 'open' ? 'blue' : match.status === 'pending' ? 'green' : match.status === 'confirmed' ? 'orange' : 'red',
  };
}

function toFlowTeam(item: V1Team | undefined, fallback: MockTeam): MockTeam {
  if (!item) return fallback;

  return {
    id: item.id,
    name: item.name,
    sport: item.sportName,
    region: item.regionName,
    members: `${item.memberCount}명`,
    trust: item.trustState === 'none' ? 'sample' : item.trustState,
    joinStatus: item.joinPolicy,
  };
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
