import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, ListItem } from '@/components/v1-ui/primitives';
import { BellIcon, ChevronLeftIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
import type { MatchCardModel, MatchCreateViewModel, MatchDetailViewModel, MatchListViewModel } from './matches.types';

export function MatchListPageView({ model }: { model: MatchListViewModel }) {
  return (
    <AppChrome
      title="매치"
      activeTab="matches"
      hasNewNotification
      floatingSlot={<MatchCreateFloatingButton />}
    >
      <div className="tm-match-list">
        <MatchSearchBar query={model.query} filterCount={model.filterCount} />
        <SportSelector sports={model.sports} />
        <div className="tm-match-summary-row">
          <div className="tm-text-label">{model.summary.label}</div>
          <div className="tm-text-caption tab-num">{model.summary.count}개 · 오늘 {model.summary.today} · 마감 {model.summary.urgent}</div>
        </div>
        <div className="tm-match-section-head">
          <div>
            <div className="tm-text-label">개인 매치</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>종목은 상단에 유지하고 정렬과 보기 방식은 필터에서 조정합니다.</div>
          </div>
          <span className="tm-badge tm-badge-blue">필터 {model.filterCount}</span>
        </div>
        <div className="tm-match-card-stack">
          {model.matches.map((match, index) => <MatchCardItem key={match.id} match={match} index={index} />)}
        </div>
      </div>
    </AppChrome>
  );
}

function MatchCreateFloatingButton() {
  return (
    <Link className="tm-floating-fab" href="/matches/new/sport" aria-label="매치 만들기">
      <PlusIcon size={25} strokeWidth={2.2} />
    </Link>
  );
}

export function MatchDetailPageView({ model }: { model: MatchDetailViewModel }) {
  const { match, mode } = model;
  const locked = mode === 'pending' || mode === 'approved' || match.status === 'full';
  const cta = mode === 'mine' ? '매치 관리' : mode === 'approved' ? '승인완료' : mode === 'pending' ? '승인중' : match.status === 'full' ? '모집완료' : '참가하기';
  const ctaTone = mode === 'pending' ? 'tm-btn-warning' : mode === 'approved' ? 'tm-btn-success' : locked ? 'tm-btn-neutral' : 'tm-btn-primary';

  return (
    <AppChrome title="" activeTab="matches" bottomNav={false} topBar={false}>
      <article className="tm-match-detail">
        <div className="tm-match-detail-hero" style={{ backgroundImage: `url(${match.image})` }}>
          <div className="tm-match-detail-overlay">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Link className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" href="/matches" aria-label="뒤로가기">
                <ChevronLeftIcon size={22} strokeWidth={2.2} />
              </Link>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="공유"><ShareIcon size={20} /></button>
                <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="알림"><BellIcon size={20} /></button>
              </div>
            </div>
            <div>
              <div className="tm-text-micro" style={{ color: 'rgba(255,255,255,.76)' }}>{match.sport} · {match.level}</div>
              <h1 className="tm-match-detail-title">{match.title}</h1>
              <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.76)', marginTop: 6 }}>{match.host} 호스트 · {match.deadline}</div>
            </div>
          </div>
        </div>
        <div className="tm-match-detail-body">
          <InfoRow label="날짜와 시간" value={`${match.date} ${match.time}`} />
          <InfoRow label="장소" value={match.venue} sub={match.address} />
          <InfoRow label="인원" value={`${match.current}/${match.capacity}명`} sub={`${match.capacity - match.current}자리 남음`} />
          <InfoRow label="참가비" value={`${match.fee.toLocaleString('ko-KR')}원`} sub="테스트 결제 흐름에서는 실제 청구 없음" />
          {mode === 'pending' ? <StateCard tone="orange" title="신청 확인을 완료했어요" body="호스트가 승인하면 알림으로 알려드릴게요." /> : null}
          {mode === 'approved' ? <StateCard tone="green" title="승인완료" body="참가가 확정되었습니다. 경기 전 안내를 계속 확인할 수 있습니다." /> : null}
          <Card pad={16} style={{ marginTop: 14 }}>
            <div className="tm-text-body-lg">매치 소개</div>
            <p className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.55 }}>{match.description}</p>
          </Card>
          <Card pad={16} style={{ marginTop: 10 }}>
            <div className="tm-text-body-lg">참가자</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {match.participants.map((person) => (
                <ListItem key={person.name} title={person.name} sub={person.meta} trailing={person.status} />
              ))}
            </div>
          </Card>
        </div>
      </article>
      <div className="tm-fixed-cta">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">{mode === 'mine' ? '내가 만든 매치' : locked ? '신청 상태' : '참가 신청 가능'}</span>
          <span className="tm-text-label tab-num">{match.fee.toLocaleString('ko-KR')}원</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: mode === 'mine' ? '1fr' : '104px 1fr', gap: 8 }}>
          {mode !== 'mine' ? <Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/chat/room-1">채팅</Link> : null}
          {mode === 'mine' ? (
            <Link className="tm-btn tm-btn-lg tm-btn-primary" href={`/matches/${match.id}/edit`}>{cta}</Link>
          ) : (
            <button className={`tm-btn tm-btn-lg ${ctaTone}`} type="button" disabled={locked}>{cta}</button>
          )}
        </div>
      </div>
    </AppChrome>
  );
}

export function MatchCreatePageView({ model }: { model: MatchCreateViewModel }) {
  if (model.step === 'complete') return <MatchComplete model={model} />;
  const edit = model.step === 'edit';
  const stepNo = edit ? 2 : stepToNumber(model.step);
  return (
    <AppChrome title={edit ? '매치 수정' : '매치 만들기'} activeTab="matches" bottomNav={false} backHref={edit ? '/matches/match-1' : '/matches'}>
      <div className="tm-create-shell">
        <CreateProgress step={stepNo} edit={edit} />
        {model.step === 'sport' ? <SportStep model={model} /> : null}
        {model.step === 'info' || model.step === 'edit' ? <InfoStep model={model} edit={edit} /> : null}
        {model.step === 'place-time' ? <PlaceTimeStep model={model} /> : null}
        {model.step === 'confirm' ? <ConfirmStep model={model} /> : null}
      </div>
      <div className="tm-fixed-cta tm-create-fixed-cta">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={model.step === 'sport' ? '/matches' : '/matches/new'}>{edit ? '변경 취소' : model.step === 'sport' ? '취소' : '이전'}</Link>
          <Link className="tm-btn tm-btn-lg tm-btn-primary" href={nextCreateHref(model.step)}>{edit ? '변경사항 저장' : model.step === 'confirm' ? '매치 만들기' : '다음'}</Link>
        </div>
      </div>
    </AppChrome>
  );
}

function MatchSearchBar({ query, filterCount }: { query: string; filterCount: number }) {
  return (
    <div className="tm-match-searchbar">
      <div className={`tm-match-search-input ${query ? 'tm-match-search-input-filled' : ''}`}>
        <span className="tm-text-body" style={{ color: query ? 'var(--text-strong)' : 'var(--text-caption)' }}>{query || '지역, 시간, 매치명 검색'}</span>
      </div>
      <button className="tm-btn tm-btn-icon tm-btn-ghost" type="button" aria-label="검색 실행"><SearchIcon size={19} /></button>
      <button className="tm-match-filter-button" type="button" aria-label="필터">필터 {filterCount}</button>
    </div>
  );
}

function SportSelector({ sports }: { sports: MatchListViewModel['sports'] }) {
  return <div className="tm-sport-chip-row">{sports.map((sport) => <button key={sport.label} className={`tm-chip ${sport.active ? 'tm-chip-active' : ''}`} type="button">{sport.label} <span className="tab-num">{sport.count}</span></button>)}</div>;
}

function MatchCardItem({ match, index }: { match: MatchCardModel; index: number }) {
  return (
    <Link className="tm-match-list-card tm-pressable" href={`/matches/${match.id}`}>
      <div className="tm-match-list-media" style={{ backgroundImage: `url(${match.image})` }}>
        <span className="tm-badge tm-badge-blue">{index === 0 ? '추천' : match.sport}</span>
        <span className="tm-match-count-badge tab-num">{match.current}/{match.capacity}</span>
      </div>
      <div className="tm-match-list-card-body">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="tm-badge tm-badge-grey">{match.sport}</span>
          <span className="tm-badge tm-badge-grey">{match.level}</span>
          <span className="tm-badge tm-badge-orange">{match.deadline}</span>
        </div>
        <div className="tm-text-body-lg" style={{ marginTop: 10 }}>{match.title}</div>
        <div className="tm-text-caption" style={{ marginTop: 5 }}>{match.date} {match.time} · {match.venue}</div>
        <div className="tm-match-list-footer">
          <span className="tm-text-caption">{match.region} · {match.host}</span>
          <span className="tm-text-label tab-num">{match.fee.toLocaleString('ko-KR')}원</span>
        </div>
      </div>
    </Link>
  );
}

function InfoRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="tm-info-row">
      <div className="tm-text-caption">{label}</div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
        <div className="tm-text-label">{value}</div>
        {sub ? <div className="tm-text-micro" style={{ marginTop: 3, color: 'var(--text-caption)' }}>{sub}</div> : null}
      </div>
    </div>
  );
}

function StateCard({ tone, title, body }: { tone: 'orange' | 'green'; title: string; body: string }) {
  return <Card pad={14} style={{ marginTop: 14, background: tone === 'green' ? 'rgba(3,178,108,.08)' : 'rgba(254,152,0,.10)' }}><div className="tm-text-label" style={{ color: tone === 'green' ? 'var(--green500)' : 'var(--orange500)' }}>{title}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{body}</div></Card>;
}

function CreateProgress({ step, edit }: { step: number; edit: boolean }) {
  return (
    <div className="tm-create-progress">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span className={`tm-badge ${edit ? 'tm-badge-orange' : 'tm-badge-blue'}`}>{edit ? '수정' : `Step ${step}/4`}</span>
        <span className="tm-text-caption">{edit ? '기존 값 유지 · 변경사항만 저장' : ['종목 선택', '매치 정보', '장소와 시간', '작성 내용 확인'][step - 1]}</span>
      </div>
      {!edit ? <div className="tm-create-bars">{[1, 2, 3, 4].map((item) => <span key={item} data-active={item <= step} />)}</div> : null}
    </div>
  );
}

function SportStep({ model }: { model: MatchCreateViewModel }) {
  return <div><h1 className="tm-text-heading">어떤 종목인가요?</h1><p className="tm-text-body" style={{ marginTop: 8 }}>매치 목록의 종목 chip과 같은 기준으로 생성 후 필터에 반영됩니다.</p><div className="tm-create-sport-grid">{model.sports.map((sport) => <Card key={sport} pad={16} className={sport === model.selectedSport ? 'tm-create-selected' : ''}><div className="tm-text-body-lg">{sport}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{sport === model.selectedSport ? '선택됨' : '선택 가능'}</div></Card>)}</div></div>;
}

function InfoStep({ model, edit }: { model: MatchCreateViewModel; edit: boolean }) {
  const draft = model.draft;
  return (
    <div>
      <h1 className="tm-text-heading">매치 정보</h1>
      <CreateField label="매치 제목" value={draft.title} />
      <CreateField label="설명" value={draft.description} multiline />
      <Card pad={0} style={{ marginTop: 14, overflow: 'hidden' }}>
        <div className="tm-create-image-preview" style={{ backgroundImage: `url(${draft.image})` }}><span className="tm-badge tm-badge-grey">예시 이미지</span></div>
        <div style={{ padding: 14 }}>
          <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" type="button">+ 이미지 업로드</button>
          <div className="tm-text-caption" style={{ marginTop: 8 }}>선택된 파일 없음 · 예시 이미지는 제출 데이터에 포함되지 않아요.</div>
        </div>
      </Card>
      <div className="tm-create-two-col"><CreateField label="최대 인원" value={`${draft.capacity}`} /><CreateField label="참가비" value={`${draft.fee}`} suffix="원" /></div>
      <div className="tm-create-two-col"><CreateField label="최소 레벨" value={draft.minLevel} /><CreateField label="최대 레벨" value={draft.maxLevel} /></div>
      {edit ? <StateCard tone="orange" title="수정 모드" body="기존 값은 prefill되고 변경사항만 저장합니다. 저장 실패 시 입력값을 유지합니다." /> : null}
    </div>
  );
}

function PlaceTimeStep({ model }: { model: MatchCreateViewModel }) {
  const draft = model.draft;
  return <div><h1 className="tm-text-heading">장소와 시간</h1><Card pad={16} className="tm-create-selected" style={{ marginTop: 16 }}><div className="tm-text-body-lg">{draft.venue}</div><div className="tm-text-caption" style={{ marginTop: 4 }}>{draft.address}</div></Card><CreateField label="장소 직접 입력" value="" placeholder="예: 한강공원 축구장, 동네 체육관 등" /><CreateField label="날짜" value={draft.date} /><div className="tm-create-two-col"><CreateField label="시작 시간" value={draft.startTime} /><CreateField label="종료 시간" value={draft.endTime} /></div></div>;
}

function ConfirmStep({ model }: { model: MatchCreateViewModel }) {
  const draft = model.draft;
  return <div><h1 className="tm-text-heading">작성된 내용을 확인해주세요</h1><Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}><div className="tm-create-image-preview" style={{ backgroundImage: `url(${draft.image})` }} /><div style={{ padding: 16 }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="tm-badge tm-badge-blue">{model.selectedSport}</span><span className="tm-badge tm-badge-grey">{draft.minLevel}-{draft.maxLevel}</span><span className="tm-badge tm-badge-grey">{draft.gender}</span></div><div className="tm-text-subhead" style={{ marginTop: 10 }}>{draft.title}</div><div className="tm-text-caption" style={{ marginTop: 6 }}>{draft.description}</div></div></Card><Card pad={16} style={{ marginTop: 12 }}><InfoRow label="일시" value={`${draft.date} ${draft.startTime}-${draft.endTime}`} /><InfoRow label="장소" value={draft.venue} sub={draft.address} /><InfoRow label="인원/참가비" value={`최대 ${draft.capacity}명 · ${draft.fee.toLocaleString('ko-KR')}원`} /><InfoRow label="이미지" value="선택된 파일 없음" sub="예시 이미지는 저장되지 않음" /></Card></div>;
}

function MatchComplete({ model }: { model: MatchCreateViewModel }) {
  return (
    <AppChrome title="매치 만들기 완료" activeTab="matches" bottomNav={false} backHref="/matches">
      <div className="tm-create-shell">
        <EmptyState title="매치가 만들어졌어요" sub="개인매치도 먼저 내 팀에게 공유해서 팀원 참여 가능 여부를 확인할 수 있습니다." />
        <Card pad={16} style={{ marginTop: 22, background: 'var(--blue50)', borderColor: 'rgba(49,130,246,.24)' }}>
          <div className="tm-text-body-lg">FC 발빠른놈들 팀 채팅</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>24명에게 개인매치 링크와 일정 정보를 공유</div>
        </Card>
        {['내 팀에 공유', '초대 링크 복사', '관심 멤버에게 보내기'].map((item, index) => <Card key={item} pad={14} className={index === 0 ? 'tm-create-selected' : ''} style={{ marginTop: 10 }}><div className="tm-text-label">{item}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{model.draft.title} 일정 정보를 공유합니다.</div></Card>)}
      </div>
      <div className="tm-fixed-cta"><div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}><Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/matches/match-1">상세 보기</Link><button className="tm-btn tm-btn-lg tm-btn-primary" type="button">내 팀에 공유</button></div></div>
    </AppChrome>
  );
}

function CreateField({ label, value, placeholder, suffix, multiline }: { label: string; value?: string; placeholder?: string; suffix?: string; multiline?: boolean }) {
  return <div className="tm-create-field"><div className="tm-text-label">{label}</div><div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}><span className="tm-text-body" style={{ color: value ? 'var(--text-strong)' : 'var(--text-caption)' }}>{value || placeholder}</span>{suffix ? <span className="tm-text-caption">{suffix}</span> : null}</div></div>;
}

function stepToNumber(step: MatchCreateViewModel['step']) {
  if (step === 'sport') return 1;
  if (step === 'info') return 2;
  if (step === 'place-time') return 3;
  return 4;
}

function nextCreateHref(step: MatchCreateViewModel['step']) {
  if (step === 'sport') return '/matches/new';
  if (step === 'info') return '/matches/new/place-time';
  if (step === 'place-time') return '/matches/new/confirm';
  if (step === 'confirm') return '/matches/new/complete';
  return '/matches/match-1';
}
