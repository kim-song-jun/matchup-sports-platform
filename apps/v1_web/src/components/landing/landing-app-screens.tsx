import Image from 'next/image';
import { BellIcon, PlusIcon, SearchIcon } from '@/components/v1-ui/icons';
import { BrandMark } from '@/components/v1-ui/brand-logo';

/* 목업 화면의 팀·장소·인원은 전부 가상의 예시다. 사람은 이니셜·등번호로만 적는다. */

const SPORT_CHIPS = ['전체', '축구', '풋살', '러닝', '수영'] as const;

function SportChips() {
  return (
    <div className="lpm-chips">
      {SPORT_CHIPS.map((chip, i) => (
        <span key={chip} className="lpm-chip" data-on={i === 0}>{chip}</span>
      ))}
    </div>
  );
}

function MatchCard({
  image,
  meta,
  title,
  when,
  filled,
  capacity,
  badge,
}: {
  image: string;
  meta: string;
  title: string;
  when: string;
  filled: number;
  capacity: number;
  badge: { tone: 'green' | 'grey'; label: string };
}) {
  return (
    <div className="lpm-mcard">
      <Image src={image} alt="" width={320} height={320} sizes="72px" />
      <div>
        <div className="lpm-mcard-meta">{meta}</div>
        <div className="lpm-mcard-title">
          <span className="lpm-badge" data-tone={badge.tone}>{badge.label}</span>
          {title}
        </div>
        <div className="lpm-mcard-when">{when}</div>
        <div className="lpm-bar">
          <i style={{ width: `${Math.round((filled / capacity) * 100)}%` }} />
        </div>
        <div className="lpm-mcard-foot">
          <span>{filled}/{capacity}명</span>
          <b>신청하기</b>
        </div>
      </div>
    </div>
  );
}

/** 홈 — 진행 중 대회 + 추천 매치. 홈 추천은 개인화가 아니라 곧 열리는 모집 글이라 "내 지역 기준" 같은 문구를 쓰지 않는다. */
export function HomeScreenBody() {
  return (
    <>
      <div className="lpm-appbar">
        <BrandMark size={26} />
        <span className="lpm-appbar-title">teameet</span>
        <BellIcon size={24} />
      </div>
      <div className="lpm-body">
        <p className="lpm-greet">안녕하세요,<br />한강 10번님</p>
        <SportChips />
        <div className="lpm-cover">
          <span className="lpm-badge" data-tone="live">LIVE · 결승</span>
          <Image src="/illustrations/sport-futsal-hero-320.webp" alt="" width={320} height={320} sizes="120px" />
          <b>가을 풋살 챔피언십</b>
          <span>FC 한강 vs 성수 러너스 · 후반 진행 중</span>
        </div>
        <div className="lpm-sect"><b>추천 매치</b><span>전체보기</span></div>
        <MatchCard
          image="/illustrations/sport-futsal-320.webp"
          meta="풋살 · 입문-초보 · 성별 무관"
          title="성수 저녁 풋살"
          when="토요일 19:00 · 성동구"
          filled={6}
          capacity={10}
          badge={{ tone: 'green', label: '모집 중' }}
        />
      </div>
    </>
  );
}

/** 매치 찾기 (/matches) */
export function MatchScreenBody() {
  return (
    <>
      <div className="lpm-body lpm-body-top">
        <div className="lpm-search">지역, 시간, 매치명 검색<SearchIcon size={20} /></div>
        <div className="lpm-seg"><span>팀</span><span data-on="true">개인</span></div>
        <SportChips />
        <div className="lpm-summary"><b>성동구 · 개인 매치</b><span>경기 전 매치</span></div>
        <MatchCard
          image="/illustrations/sport-futsal-320.webp"
          meta="풋살 · 입문-초보 · 성별 무관"
          title="성수 저녁 풋살"
          when="토요일 19:00 · 성동구"
          filled={6}
          capacity={10}
          badge={{ tone: 'green', label: '모집 중' }}
        />
        <MatchCard
          image="/illustrations/sport-soccer-320.webp"
          meta="축구 · 중급 · 11:11"
          title="일요 아침 축구"
          when="일요일 08:00 · 광진구"
          filled={18}
          capacity={22}
          badge={{ tone: 'green', label: '모집 중' }}
        />
        <MatchCard
          image="/illustrations/sport-running-320.webp"
          meta="러닝 · 누구나 · 5km"
          title="한강 퇴근런"
          when="화요일 20:00 · 성동구"
          filled={9}
          capacity={10}
          badge={{ tone: 'grey', label: '마감 임박' }}
        />
      </div>
      <span className="lpm-fab"><PlusIcon size={28} /></span>
    </>
  );
}

const TEAM_MEMBERS = [
  { initial: 'A', role: '팀장' },
  { initial: 'B', role: '운영진' },
  { initial: 'C', role: '멤버' },
  { initial: 'D', role: '멤버' },
] as const;

/** 팀 (/teams/[id]) — 전적 네 갈래 + 역할별 멤버 */
export function TeamScreenBody() {
  return (
    <>
      <div className="lpm-appbar"><span className="lpm-appbar-title">팀</span><BellIcon size={24} /></div>
      <div className="lpm-body">
        <div className="lpm-team-head">
          <span className="lpm-team-logo">FC</span>
          <div>
            <div className="lpm-team-name">FC 한강</div>
            <div className="lpm-tags">
              <span className="lpm-badge" data-tone="blue">풋살</span>
              <span className="lpm-badge" data-tone="grey">서울 성동</span>
              <span className="lpm-badge" data-tone="grey">중급</span>
            </div>
          </div>
        </div>
        <div className="lpm-tabs"><span data-on="true">전체</span><span>대회</span><span>리그</span><span>친선</span></div>
        <div className="lpm-card">
          <div className="lpm-wdl">
            <div><b>11</b><span>승</span></div><div><b>3</b><span>무</span></div><div><b>4</b><span>패</span></div>
          </div>
          <div className="lpm-wdl-bar"><i data-part="win" /><i data-part="draw" /><i data-part="loss" /></div>
        </div>
        <div className="lpm-sect"><b>멤버</b><span>역할 순</span></div>
        <ul className="lpm-roster">
          {TEAM_MEMBERS.map((member) => (
            <li key={member.initial}>
              <span className="lpm-av">{member.initial}</span>팀원 {member.initial}<span>{member.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
