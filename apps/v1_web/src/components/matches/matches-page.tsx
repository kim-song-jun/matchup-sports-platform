import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, ListItem } from '@/components/v1-ui/primitives';
import { BellIcon, ChevronLeftIcon, FilterIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
import type {
  MatchCardModel,
  MatchCreateViewModel,
  MatchDetailViewModel,
  MatchListViewModel,
  MatchStateViewModel,
} from './matches.types';

export function MatchListPageView({ model }: { model: MatchListViewModel }) {
  return (
    <AppChrome
      title="매치"
      activeTab="matches"
      topBar={false}
      floatingSlot={<MatchCreateFloatingButton />}
    >
      <MatchSearchBar query={model.query} filterCount={model.filterCount} />
      <div className="tm-match-list">
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

export function MatchStatePageView({ model }: { model: MatchStateViewModel }) {
  if (model.state === 'filter') return <MatchFilterPageView model={model} />;
  if (model.state === 'participants') return <MatchParticipantsPageView />;

  return (
    <AppChrome title={model.title} activeTab="matches" bottomNav={false} backHref="/matches">
      <div className="tm-match-list">
        <EmptyState title={model.title} sub={model.description} />
        {model.state === 'error' ? (
          <Card pad={16} style={{ marginTop: 18, background: 'var(--grey50)' }}>
            <div className="tm-text-label">아직 재시도 API가 연결되지 않았어요</div>
            <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.55 }}>
              지금은 목록으로 돌아가 상태를 확인할 수 있고, 실제 재시도 mutation은 API 바인딩 후 연결합니다.
            </div>
            <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/matches" style={{ marginTop: 14 }}>목록으로 돌아가기</Link>
          </Card>
        ) : null}
        {model.state === 'joined' ? (
          <div className="tm-match-card-stack" style={{ marginTop: 18 }}>
            {model.matches.map((match, index) => <MatchCardItem key={match.id} match={match} index={index} />)}
          </div>
        ) : null}
      </div>
    </AppChrome>
  );
}

function MatchFilterPageView({ model }: { model: MatchStateViewModel }) {
  return (
    <AppChrome title="필터" activeTab="matches" bottomNav={false} backHref="/matches">
      <div className="tm-create-shell">
        <section>
          <h1 className="tm-text-heading">매치 조건</h1>
          <p className="tm-text-body" style={{ marginTop: 8, lineHeight: 1.55 }}>{model.description}</p>
        </section>
        <Card pad={16}>
          <div className="tm-text-body-lg">종목</div>
          <div className="tm-sport-chip-row" style={{ marginTop: 12 }}>
            {model.sports.map((sport) => <button key={sport.label} className={`tm-chip ${sport.active ? 'tm-chip-active' : ''}`} type="button">{sport.label}</button>)}
          </div>
        </Card>
        <Card pad={16}>
          <div className="tm-text-body-lg">현재 적용된 조건</div>
          <div className="tm-my-list-stack" style={{ marginTop: 12 }}>
            <ListItem title="지역" sub="서울 전체" trailing="변경 가능" />
            <ListItem title="날짜" sub="이번 주" trailing="변경 가능" />
            <ListItem title="모집 상태" sub="모집중 우선" trailing="2개" />
          </div>
        </Card>
      </div>
      <div className="tm-fixed-cta">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/matches">초기화</Link>
          <Link className="tm-btn tm-btn-lg tm-btn-primary" href="/matches">{model.matches.length}개 결과 보기</Link>
        </div>
      </div>
    </AppChrome>
  );
}

function MatchParticipantsPageView() {
  const participants = [
    { name: '김정민', meta: '호스트 · 매너 4.9', status: '승인완료' },
    { name: '박서준', meta: '초급 · 최근 3경기', status: '승인완료' },
    { name: '이하나', meta: '중급 · 빠른 응답', status: '승인중' },
  ];

  return (
    <AppChrome title="참가자" activeTab="matches" bottomNav={false} backHref="/matches/match-1">
      <div className="tm-match-list">
        <Card pad={16} style={{ background: 'var(--blue50)', borderColor: 'rgba(49,130,246,.24)' }}>
          <div className="tm-text-body-lg">주말 풋살 한판!</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>승인 완료 2명 · 승인중 1명 · 정원 10명</div>
        </Card>
        <div className="tm-my-list-stack" style={{ marginTop: 14 }}>
          {participants.map((person) => <ListItem key={person.name} title={person.name} sub={person.meta} trailing={person.status} />)}
        </div>
        <Card pad={14} style={{ marginTop: 16, background: 'var(--grey50)' }}>
          <div className="tm-text-label">참가자 관리는 상세/수정 플로우에서 연결됩니다</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>이 route는 참가자 상태 표현을 확인하기 위한 읽기 전용 fixture입니다.</div>
        </Card>
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
  const canRunAction = Boolean(model.onApply);
  const cta = model.applyLabel ?? (mode === 'mine' ? '매치 관리' : mode === 'approved' ? '승인완료' : mode === 'pending' ? '승인중' : match.status === 'full' ? '모집완료' : '참가 신청');
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
          <InfoRow label="신청 방식" value={match.actionLabel} sub="v1은 결제 없이 호스트 승인으로만 참가가 확정됩니다." />
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
                <div key={person.name}>
                  <ListItem title={person.name} sub={person.meta} trailing={person.status} />
                  {person.onApprove || person.onReject ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                      <button className="tm-btn tm-btn-sm tm-btn-primary" type="button" disabled={person.actionPending} onClick={person.onApprove}>승인</button>
                      <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled={person.actionPending} onClick={person.onReject}>거절</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </article>
      <div className="tm-fixed-cta">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">{mode === 'mine' ? '내가 만든 매치' : locked ? '신청 상태' : '참가 신청 가능'}</span>
          <span className="tm-text-label">{match.actionLabel}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: mode === 'mine' ? '1fr' : '104px 1fr', gap: 8 }}>
          {mode !== 'mine' ? <Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/chat/room-1">채팅</Link> : null}
          {mode === 'mine' ? (
            <Link className="tm-btn tm-btn-lg tm-btn-primary" href={`/matches/${match.id}/edit`}>{cta}</Link>
          ) : (
            <button className={`tm-btn tm-btn-lg ${ctaTone}`} type="button" disabled={!canRunAction || model.applyPending} onClick={model.onApply}>
              {model.applyPending ? '신청 중' : cta}
            </button>
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
  const primaryLabel = model.form?.submitLabel ?? (edit ? '변경사항 저장' : model.step === 'confirm' ? '매치 만들기' : '다음');
  const primaryAction = model.step === 'confirm' || edit ? model.form?.onSubmit : model.form?.onNext;
  const secondaryAction = model.form?.onBack;
  return (
    <AppChrome title={edit ? '매치 수정' : '매치 만들기'} activeTab="matches" bottomNav={false} backHref={edit ? '/matches/match-1' : '/matches'}>
      <div className="tm-create-shell">
        <CreateProgress step={stepNo} edit={edit} />
        {model.form?.error ? <StateCard tone="orange" title="저장할 수 없어요" body={model.form.error} /> : null}
        {model.form?.lockedReason ? <StateCard tone="orange" title="수정이 제한된 매치입니다" body={model.form.lockedReason} /> : null}
        {model.step === 'sport' ? <SportStep model={model} /> : null}
        {model.step === 'info' || model.step === 'edit' ? <InfoStep model={model} edit={edit} /> : null}
        {model.step === 'place-time' ? <PlaceTimeStep model={model} /> : null}
        {model.step === 'confirm' ? <ConfirmStep model={model} /> : null}
      </div>
      <div className="tm-fixed-cta tm-create-fixed-cta">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          {secondaryAction ? (
            <button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" onClick={secondaryAction}>{edit ? '변경 취소' : model.step === 'sport' ? '취소' : '이전'}</button>
          ) : (
            <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={model.step === 'sport' ? '/matches' : '/matches/new'}>{edit ? '변경 취소' : model.step === 'sport' ? '취소' : '이전'}</Link>
          )}
          {primaryAction ? (
            <button className="tm-btn tm-btn-lg tm-btn-primary" type="button" disabled={model.form?.submitting || Boolean(model.form?.lockedReason)} onClick={primaryAction}>
              {model.form?.submitting ? '저장 중' : primaryLabel}
            </button>
          ) : (
            <Link className="tm-btn tm-btn-lg tm-btn-primary" href={nextCreateHref(model.step)}>{primaryLabel}</Link>
          )}
        </div>
        {edit && model.form?.onCancel ? <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" type="button" style={{ marginTop: 8 }} disabled={model.form.submitting} onClick={model.form.onCancel}>매치 취소</button> : null}
      </div>
    </AppChrome>
  );
}

function MatchSearchBar({ query, filterCount }: { query: string; filterCount: number }) {
  return (
    <div className="tm-list-searchbar">
      <Link className="tm-list-search-input" href="/search" aria-label="매치 검색">
        <span className="tm-list-search-text">{query || '지역, 시간, 매치명 검색'}</span>
        <SearchIcon size={19} strokeWidth={2} />
      </Link>
      <Link className="tm-list-filter-button" href="/matches/filter" aria-label={`필터 ${filterCount}개 적용`}>
        <FilterIcon size={21} strokeWidth={2} />
        <span className="tm-list-filter-count tab-num">{filterCount}</span>
      </Link>
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
          <span className="tm-text-label">{match.actionLabel}</span>
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
  return <div><h1 className="tm-text-heading">어떤 종목인가요?</h1><p className="tm-text-body" style={{ marginTop: 8 }}>매치 목록의 종목 chip과 같은 기준으로 생성 후 필터에 반영됩니다.</p><div className="tm-create-sport-grid">{model.sports.map((sport) => <button key={sport} className={`tm-card tm-pressable ${sport === model.selectedSport ? 'tm-create-selected' : ''}`} style={{ padding: 16, textAlign: 'left' }} type="button" onClick={() => model.form?.onSelectSport(sport)}><div className="tm-text-body-lg">{sport}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{sport === model.selectedSport ? '선택됨' : '선택 가능'}</div></button>)}</div></div>;
}

function InfoStep({ model, edit }: { model: MatchCreateViewModel; edit: boolean }) {
  const draft = model.draft;
  return (
    <div>
      <h1 className="tm-text-heading">매치 정보</h1>
      <CreateField label="매치 제목" value={draft.title} onChange={(value) => model.form?.onFieldChange('title', value)} />
      <CreateField label="설명" value={draft.description} multiline onChange={(value) => model.form?.onFieldChange('description', value)} />
      <Card pad={0} style={{ marginTop: 14, overflow: 'hidden' }}>
        <div className="tm-create-image-preview" style={{ backgroundImage: `url(${draft.image})` }}><span className="tm-badge tm-badge-grey">예시 이미지</span></div>
        <div style={{ padding: 14 }}>
          <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" type="button">+ 이미지 업로드</button>
          <div className="tm-text-caption" style={{ marginTop: 8 }}>선택된 파일 없음 · 예시 이미지는 제출 데이터에 포함되지 않아요.</div>
        </div>
      </Card>
      <div className="tm-create-two-col"><CreateField label="최대 인원" value={`${draft.capacity}`} type="number" onChange={(value) => model.form?.onFieldChange('capacity', Number(value))} /><CreateField label="신청 방식" value={draft.actionLabel} /></div>
      <div className="tm-create-two-col"><CreateField label="최소 레벨" value={draft.minLevel} onChange={(value) => model.form?.onFieldChange('minLevel', value)} /><CreateField label="최대 레벨" value={draft.maxLevel} onChange={(value) => model.form?.onFieldChange('maxLevel', value)} /></div>
      <CreateField label="규칙" value={draft.rules} multiline onChange={(value) => model.form?.onFieldChange('rules', value)} />
      {edit ? <StateCard tone="orange" title="수정 모드" body="기존 값은 prefill되고 변경사항만 저장합니다. 저장 실패 시 입력값을 유지합니다." /> : null}
    </div>
  );
}

function PlaceTimeStep({ model }: { model: MatchCreateViewModel }) {
  const draft = model.draft;
  return <div><h1 className="tm-text-heading">장소와 시간</h1><Card pad={16} className="tm-create-selected" style={{ marginTop: 16 }}><div className="tm-text-body-lg">{draft.venue}</div><div className="tm-text-caption" style={{ marginTop: 4 }}>{draft.address}</div></Card><CreateField label="장소 직접 입력" value={draft.venue} placeholder="예: 한강공원 축구장, 동네 체육관 등" onChange={(value) => model.form?.onFieldChange('venue', value)} /><CreateField label="상세 주소" value={draft.address} onChange={(value) => model.form?.onFieldChange('address', value)} /><CreateField label="날짜" value={draft.date} type="date" onChange={(value) => model.form?.onFieldChange('date', value)} /><div className="tm-create-two-col"><CreateField label="시작 시간" value={draft.startTime} type="time" onChange={(value) => model.form?.onFieldChange('startTime', value)} /><CreateField label="종료 시간" value={draft.endTime} type="time" onChange={(value) => model.form?.onFieldChange('endTime', value)} /></div></div>;
}

function ConfirmStep({ model }: { model: MatchCreateViewModel }) {
  const draft = model.draft;
  return <div><h1 className="tm-text-heading">작성된 내용을 확인해주세요</h1><Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}><div className="tm-create-image-preview" style={{ backgroundImage: `url(${draft.image})` }} /><div style={{ padding: 16 }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="tm-badge tm-badge-blue">{model.selectedSport}</span><span className="tm-badge tm-badge-grey">{draft.minLevel}-{draft.maxLevel}</span><span className="tm-badge tm-badge-grey">{draft.gender}</span></div><div className="tm-text-subhead" style={{ marginTop: 10 }}>{draft.title}</div><div className="tm-text-caption" style={{ marginTop: 6 }}>{draft.description}</div></div></Card><Card pad={16} style={{ marginTop: 12 }}><InfoRow label="일시" value={`${draft.date} ${draft.startTime}-${draft.endTime}`} /><InfoRow label="장소" value={draft.venue} sub={draft.address} /><InfoRow label="인원/신청 방식" value={`최대 ${draft.capacity}명 · ${draft.actionLabel}`} /><InfoRow label="이미지" value="선택된 파일 없음" sub="예시 이미지는 저장되지 않음" /></Card></div>;
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

function CreateField({ label, value, placeholder, suffix, multiline, type = 'text', onChange }: { label: string; value?: string; placeholder?: string; suffix?: string; multiline?: boolean; type?: string; onChange?: (value: string) => void }) {
  return (
    <label className="tm-create-field">
      <div className="tm-text-label">{label}</div>
      <div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}>
        {onChange ? (
          multiline ? (
            <textarea className="tm-create-native-input" value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
          ) : (
            <input className="tm-create-native-input" type={type} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
          )
        ) : (
          <span className="tm-text-body" style={{ color: value ? 'var(--text-strong)' : 'var(--text-caption)' }}>{value || placeholder}</span>
        )}
        {suffix ? <span className="tm-text-caption">{suffix}</span> : null}
      </div>
    </label>
  );
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
