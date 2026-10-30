'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, RotateCcw } from 'lucide-react';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import {
  applyDemoCommand, createDemoState, DEMO_PATH, DEMO_PLAYERS, DEMO_STORAGE_KEY, DEMO_TEAMS,
  demoPlayer, demoPlayers, demoScore, demoTeam, encodeDemoSession, replayDemoSession,
  type DemoCommand, type DemoInput, type DemoRole, type DemoState,
} from '@/lib/tournament-ops-demo';
import styles from './demo.module.css';

const STEPS = ['대회 준비', '참가팀', '대진 구성', '경기 기록', '결과·시상'];
const ROLE_LABELS: Record<DemoRole, string> = { director: '디렉터', recorder: '기록 담당자', participant: '참가자' };
const STATUS_LABELS = { scheduled: '예정', live: '진행 중', review: '검토 대기', official: '체험 결과 확정' };

export function TournamentOpsDemo() {
  const [state, setState] = useState<DemoState>(createDemoState);
  const history = useRef<DemoCommand[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [role, setRole] = useState<DemoRole>('director');
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(state.title);
  const [venue, setVenue] = useState(state.venue);
  const [fixtureId, setFixtureId] = useState('semi-1');
  const [playerId, setPlayerId] = useState('blue-1');
  const [minute, setMinute] = useState('1');
  const [winner, setWinner] = useState('');
  const [award, setAward] = useState('blue-1');
  const [shareUrl, setShareUrl] = useState('');
  const { confirm, ConfirmModal } = useConfirm();

  useEffect(() => {
    setShareUrl(`${window.location.origin}${DEMO_PATH}`);
    try {
      const restored = replayDemoSession(window.sessionStorage.getItem(DEMO_STORAGE_KEY));
      // Verify persistence is available before enabling actions; no fake saved state on failure.
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, encodeDemoSession(restored.commands));
      history.current = restored.commands; setState(restored.state);
      setTitle(restored.state.title); setVenue(restored.state.venue);
    } catch {
      setStorageError('이 탭의 체험 기록을 읽거나 저장하지 못했어요. 브라우저 저장 권한을 확인하거나 체험을 초기화해 주세요.');
    }
    setReady(true);
  }, []);

  function execute(command: DemoInput, message: string): boolean {
    setError(null); setNotice(null);
    if (!ready || storageError) return false;
    try {
      const nextCommand = { ...command, role };
      const next = applyDemoCommand(state, nextCommand);
      const commands = [...history.current, nextCommand];
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, encodeDemoSession(commands));
      history.current = commands; setState(next); setNotice(message); return true;
    } catch (e) { setError(e instanceof Error ? e.message : '체험 변경을 저장하지 못했어요. 다시 시도해 주세요.'); return false; }
  }
  async function reset() {
    if (!(await confirm({ title: '이 탭의 체험을 처음부터 시작할까요?', message: '샘플 설정과 경기 기록이 초기화돼요. 실제 대회와 다른 업체의 체험은 바뀌지 않아요.', confirmLabel: '체험 초기화', tone: 'danger' }))) return;
    try {
      const fresh = createDemoState();
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, encodeDemoSession([]));
      history.current = []; setState(fresh); setTitle(fresh.title); setVenue(fresh.venue);
      setRole('director'); setStep(0); setFixtureId('semi-1'); setPlayerId('blue-1'); setWinner(''); setMinute('1'); setAward('blue-1');
      setStorageError(null); setError(null); setNotice('이 탭의 체험을 초기화했어요.');
    } catch { setStorageError('브라우저가 체험 저장을 차단하고 있어요. 저장 권한을 허용한 뒤 다시 초기화해 주세요.'); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); setError(null); setNotice('체험 시작 링크를 복사했어요. 받은 분은 별도의 새 체험을 시작해요.'); }
    catch { setError('링크를 복사하지 못했어요. 아래 공유 주소를 직접 선택해 복사해 주세요.'); }
  }
  function changeRole(next: DemoRole) {
    setRole(next); setStep(next === 'recorder' ? 3 : next === 'participant' ? 4 : 0);
    setFixtureId('semi-1'); setPlayerId('blue-1'); setWinner(''); setError(null); setNotice(null);
  }
  function selectFixture(id: string) {
    setFixtureId(id); setWinner('');
    const selected = state.fixtures.find((f) => f.id === id);
    setPlayerId(selected?.home ? `${selected.home}-1` : 'blue-1');
  }
  const fixture = state.fixtures.find((f) => f.id === fixtureId);
  const visibleFixtures = role === 'recorder' ? state.fixtures.filter((f) => f.id === 'semi-1') : state.fixtures;
  const participants = fixture ? DEMO_PLAYERS.filter((p) => p.teamId === fixture.home || p.teamId === fixture.away) : [];
  const official = state.fixtures.filter((f) => f.status === 'official');
  const mayChange = ready && !storageError;
  const nextStep = (index: number, label: string) => <button className={styles.secondary} onClick={() => { setStep(index); setError(null); setNotice(null); }}>{label}<ArrowRight size={16} aria-hidden="true" /></button>;

  return <div className={styles.page}>
    <header className={styles.header}><div className={styles.headerInner}>
      <Link className={styles.brand} href="/home" aria-label="Teameet 홈">teameet</Link>
      <span className={styles.badge}>운영 콘솔 체험 · 샘플 데이터</span>
      <div className={styles.actions}><button className={styles.quiet} onClick={copyLink} disabled={!shareUrl}><Copy size={16} aria-hidden="true" />공유 링크 복사</button><button className={styles.quiet} onClick={reset} disabled={!ready}><RotateCcw size={16} aria-hidden="true" />처음부터</button></div>
    </div></header>
    <main className={styles.container}>
      <div className={styles.intro}><div><p className={styles.eyebrow}>대회 운영사 전용 미리 체험</p><h1>한 번의 대회를, 준비부터 시상까지</h1><p>가상의 4팀 대회로 주요 업무 흐름을 따라가 보세요.<br />이 탭에만 저장되며 실제 대회·알림·공식 기록에는 반영되지 않아요.</p></div><span className={styles.badge}>로그인 없이 · 약 5분</span></div>
      <div className={styles.roles} aria-label="체험 역할"><span className={styles.rolesLabel}>누구의 화면인가요?</span>{(Object.keys(ROLE_LABELS) as DemoRole[]).map((r) => <button key={r} className={styles.role} aria-pressed={role === r} onClick={() => changeRole(r)}>{ROLE_LABELS[r]}</button>)}</div>
      <nav className={styles.nav} aria-label="대회 운영 체험 단계">{STEPS.map((label, index) => {
        if ((role === 'recorder' && index !== 3) || (role === 'participant' && index !== 4)) return null;
        return <button key={label} className={styles.step} aria-current={step === index ? 'step' : undefined} onClick={() => { setStep(index); setError(null); setNotice(null); }}><span className={styles.stepNumber}>{index + 1}</span>{label}</button>;
      })}</nav>
      {!ready && <p role="status" className={styles.notice}>이 탭의 체험을 준비하고 있어요.</p>}
      {storageError && <div role="alert" className={styles.error}>{storageError} <button className={styles.secondary} onClick={reset}>체험 초기화</button></div>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      <div className={styles.grid}><section className={styles.panel} aria-label={`${ROLE_LABELS[role]} ${STEPS[step]}`}>
        {step === 0 && <><h2>대회 준비</h2><p className={styles.muted}>먼저 대회명과 장소를 정해 보세요. 참가팀과 경기에서 같은 설정을 사용해요.</p><form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (execute({ type: 'settings', title, venue }, '체험 대회 설정을 저장했어요.')) setStep(1); }}><label className={styles.field}>체험 대회명<input className={styles.input} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} required /></label><label className={styles.field}>체험 장소<input className={styles.input} maxLength={80} value={venue} onChange={(e) => setVenue(e.target.value)} required /></label><p className={styles.small}>경기 방식: 4팀 토너먼트 · 양 팀 선발 6명 · 샘플 선수만 사용</p><div><button className={styles.primary} disabled={!mayChange}>설정 저장 후 참가팀 보기<ArrowRight size={16} aria-hidden="true" /></button></div></form></>}
        {step === 1 && <><h2>참가팀 확인</h2><p className={styles.muted}>신청 팀과 선수 명단을 확인하고 4팀을 확정해 보세요. 실제 신청·입금 처리는 발생하지 않아요.</p>{DEMO_TEAMS.map((t) => <div className={styles.row} key={t.id}><div><h3>{t.name}</h3><details className={styles.small}><summary>샘플 선수 6명 보기</summary>{demoPlayers(t.id).map((p) => <p key={p.id}>{p.name}</p>)}</details></div>{state.confirmed.includes(t.id) ? <span className={styles.success}><Check size={14} className="inline" aria-hidden="true" />참가 확정</span> : <button className={styles.secondary} disabled={!mayChange} aria-label={`${t.name} 참가 확정`} onClick={() => execute({ type: 'confirm', teamId: t.id }, `${t.name}의 체험 참가를 확정했어요.`)}>참가 확정</button>}</div>)}<div className={styles.actions}>{nextStep(0, '대회 준비로')}{nextStep(2, '대진 구성으로')}</div></>}
        {step === 2 && <><h2>대진 구성</h2><p className={styles.muted}>확정된 4팀으로 4강 2경기와 결승을 만들어요. 4강 결과를 확정하면 결승 자리가 채워져요.</p>{state.fixtures.length === 0 ? <div className={styles.empty}><p className={styles.muted}>확정된 샘플 참가팀 {state.confirmed.length}/4팀</p><button className={styles.primary} disabled={!mayChange} onClick={() => execute({ type: 'generate' }, '샘플 대진 3경기를 만들었어요.')}>샘플 대진 만들기</button>{nextStep(1, '참가팀 확인하기')}</div> : <>{state.fixtures.map((f) => <div className={styles.row} key={f.id}><div><p className={styles.small}>{f.label}</p><h3>{demoTeam(f.home)} vs {demoTeam(f.away)}</h3><p className={styles.small}>{state.venue} · {STATUS_LABELS[f.status]}</p></div><button className={styles.secondary} onClick={() => { selectFixture(f.id); setStep(3); }}>경기 열기</button></div>)}{nextStep(3, '경기 기록 체험하기')}</>}</>}
        {step === 3 && <><h2>경기 기록</h2><p className={styles.muted}>{role === 'recorder' ? '기록 담당자에게 배정된 4강 1경기예요. 결과 확정은 디렉터 관점에서 진행해요.' : '경기를 선택하고 라인업 준비 → 시작 → 기록 → 종료를 따라가 보세요.'}</p>{!fixture ? <div className={styles.empty}><p className={styles.muted}>아직 샘플 대진이 없어요. 디렉터 관점에서 대진을 먼저 만들어 주세요.</p>{role === 'director' ? nextStep(2, '대진 구성으로') : <button className={styles.secondary} onClick={() => changeRole('director')}>디렉터로 준비하기</button>}</div> : <>
          <div className={styles.form}><label className={styles.field}>체험 경기<select className={styles.input} value={fixtureId} onChange={(e) => selectFixture(e.target.value)}>{visibleFixtures.map((f) => <option key={f.id} value={f.id}>{f.label} · {demoTeam(f.home)} vs {demoTeam(f.away)}</option>)}</select></label></div>
          <div className={styles.score}><span>{demoTeam(fixture.home)}</span><strong aria-label="체험 경기 점수">{demoScore(fixture, fixture.home)} : {demoScore(fixture, fixture.away)}</strong><span>{demoTeam(fixture.away)}</span></div><p className={styles.small}>{STATUS_LABELS[fixture.status]} · {state.venue}</p>
          {fixture.status === 'scheduled' && <div className={styles.stack}><p className={styles.notice}>체험용 라인업 준비는 참가팀의 제출 상황을 샘플로 채워요. 실제 기록 담당자에게 참가팀 명단 제출 권한을 주는 기능은 아니에요.</p><div className={styles.actions}><button className={styles.secondary} disabled={!mayChange || fixture.lineup} onClick={() => execute({ type: 'lineup', fixtureId }, '양 팀 샘플 라인업 6명씩 준비했어요.')}>{fixture.lineup ? '샘플 라인업 준비됨' : '체험용 라인업 준비'}</button><button className={styles.primary} disabled={!mayChange} onClick={() => execute({ type: 'start', fixtureId }, '체험 경기를 시작했어요.')}>체험 경기 시작</button></div></div>}
          {fixture.status === 'live' && <><div className={`${styles.two} ${styles.form}`}><label className={styles.field}>기록 선수<select className={styles.input} value={playerId} onChange={(e) => setPlayerId(e.target.value)}>{participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className={styles.field}>기록 시각 (분)<input className={styles.input} type="number" min={0} max={120} value={minute} onChange={(e) => setMinute(e.target.value)} /></label></div><div className={styles.actions}>{(['goal', 'yellow'] as const).map((kind) => <button key={kind} className={kind === 'goal' ? styles.primary : styles.secondary} disabled={!mayChange} onClick={() => execute({ type: 'event', fixtureId, event: { kind, playerId, teamId: demoPlayer(playerId)?.teamId ?? '', minute: minute.trim() === '' ? NaN : Number(minute) } }, kind === 'goal' ? '샘플 득점을 기록했어요.' : '샘플 경고를 기록했어요.')}>{kind === 'goal' ? '득점 기록' : '경고 기록'}</button>)}<button className={styles.secondary} disabled={!mayChange || fixture.events.length === 0} onClick={() => execute({ type: 'undo', fixtureId }, '마지막 체험 기록을 취소했어요.')}>마지막 기록 취소</button></div></>}
          <ol className={styles.eventList} aria-label="체험 경기 기록">{fixture.events.map((e, i) => <li key={i}><span className={styles.badge}>{e.minute}분</span><span>{e.kind === 'goal' ? '득점' : '경고'} · {demoPlayer(e.playerId)?.name}</span></li>)}</ol>
          {fixture.status === 'live' && <button className={styles.secondary} disabled={!mayChange} onClick={async () => { if (await confirm({ title: '체험 경기를 종료할까요?', message: '종료하면 기록을 잠그고 디렉터의 결과 검토 단계로 넘어가요.', confirmLabel: '체험 경기 종료' })) execute({ type: 'end', fixtureId }, '체험 경기를 종료했어요. 디렉터가 결과를 검토할 차례예요.'); }}>체험 경기 종료</button>}
          {(fixture.status === 'review' || fixture.status === 'official') && <div className={styles.stack}><p className={styles.notice}>{fixture.status === 'official' ? '체험 결과가 확정되어 기록을 변경할 수 없어요.' : '기록 담당자는 경기 종료까지 맡고, 디렉터가 결과를 검토해요.'}</p><button className={styles.secondary} onClick={() => { setRole('director'); setStep(4); setNotice(null); }}>디렉터 결과 검토로<ArrowRight size={16} aria-hidden="true" /></button></div>}
        </>}</>}
        {step === 4 && <><h2>{role === 'participant' ? '참가자에게 보이는 결과' : '결과 검토와 시상'}</h2><p className={styles.muted}>{role === 'participant' ? '확정된 샘플 경기와 시상만 보여요. 아직 검토 중인 기록은 공개하지 않아요.' : '종료된 경기의 점수와 기록을 확인해 보세요. 체험 결과 확정은 실제 공식 결과 API와 별개예요.'}</p>
          {role !== 'participant' && state.fixtures.filter((f) => f.status === 'review').map((f) => <div className={styles.row} key={f.id}><div className={styles.stack}><h3>{f.label} · {demoTeam(f.home)} {demoScore(f, f.home)} : {demoScore(f, f.away)} {demoTeam(f.away)}</h3><p className={styles.small}>득점 {f.events.filter((e) => e.kind === 'goal').length}건 · 경고 {f.events.filter((e) => e.kind === 'yellow').length}건</p>{demoScore(f, f.home) === demoScore(f, f.away) && <label className={styles.field}>승부차기 승리팀<select className={styles.input} value={fixtureId === f.id ? winner : ''} onChange={(e) => { setFixtureId(f.id); setWinner(e.target.value); }}><option value="">선택해 주세요</option><option value={f.home!}>{demoTeam(f.home)}</option><option value={f.away!}>{demoTeam(f.away)}</option></select></label>}<button className={styles.primary} disabled={!mayChange} onClick={() => execute({ type: 'officialize', fixtureId: f.id, winnerTeamId: fixtureId === f.id ? winner : '' }, '체험 결과를 확정했어요. 결선 자리와 참가자 화면에 반영됐어요.')}>{f.label} 체험 결과 확정</button></div></div>)}
          {official.length === 0 ? <div className={styles.empty}><p className={styles.muted}>아직 확정된 샘플 결과가 없어요.</p>{role === 'director' ? nextStep(3, '경기 기록으로') : <button className={styles.secondary} onClick={() => changeRole('director')}>디렉터 관점으로 체험하기</button>}</div> : official.map((f) => <div className={styles.row} key={f.id}><div><p className={styles.small}>{f.label} · 체험 결과</p><h3>{demoTeam(f.home)} {demoScore(f, f.home)} : {demoScore(f, f.away)} {demoTeam(f.away)}</h3><p className={styles.success}>{demoTeam(f.winner)} 승리{f.id !== 'final' ? ' · 결승 진출' : ' · 샘플 우승'}</p></div></div>)}
          {role === 'director' && official.length > 0 && <form className={styles.form} onSubmit={(e) => { e.preventDefault(); execute({ type: 'award', playerId: award }, '체험 MVP를 저장했어요. 참가자 관점에서도 확인할 수 있어요.'); }}><label className={styles.field}>체험 MVP<select className={styles.input} value={award} onChange={(e) => setAward(e.target.value)}>{DEMO_PLAYERS.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label><div><button className={styles.secondary} disabled={!mayChange}>체험 시상 저장</button></div></form>}
          {state.awardPlayerId && <p className={styles.notice}>체험 MVP · {demoPlayer(state.awardPlayerId)?.name}</p>}
          {role === 'director' && official.length > 0 && <div className={styles.actions}><button className={styles.secondary} onClick={() => changeRole('participant')}>참가자 화면 보기</button>{nextStep(2, '결선 반영 확인')}</div>}
        </>}
      </section>
      <aside className={styles.summary} aria-label="체험 현황과 안내"><section className={styles.panel}><p className={styles.eyebrow}>내 탭의 샘플 대회</p><h3>{state.title}</h3><p className={styles.small}>{state.venue}</p><hr className={styles.divider} /><dl><dt>참가 확정</dt><dd>{state.confirmed.length}/4팀</dd><dt>생성한 대진</dt><dd>{state.fixtures.length}경기</dd><dt>결과 확정</dt><dd>{official.length}경기</dd><dt>현재 관점</dt><dd>{ROLE_LABELS[role]}</dd></dl></section><section className={styles.panel} id="demo-guide"><h3>이 순서로 체험해 보세요</h3><ol className={styles.small}><li>대회명·장소 저장 후 4팀 참가 확정</li><li>대진 생성 후 기록 담당자로 전환</li><li>라인업 준비, 경기 시작, 득점 기록</li><li>종료 후 디렉터로 결과 검토·확정</li><li>결선 반영과 참가자 화면·시상 확인</li></ol><hr className={styles.divider} /><p className={styles.small}>실제 서비스는 배정된 권한과 경기 상태에 따라 동작해요. 이 화면은 주요 흐름을 설명하는 체험 전용 시뮬레이터예요.</p></section></aside></div>
      <section className={`${styles.panel} ${styles.guide}`} aria-labelledby="share-demo-title"><h2 id="share-demo-title">운영팀에 체험 링크 전달하기</h2><p className={styles.muted}>주소만 전달하면 로그인 없이 시작해요. 현재 진행 내용은 공유되지 않으며, 받은 분은 자기 탭에서 별도 체험을 시작해요.</p><label className={`${styles.field} ${styles.form}`}>공유할 체험 주소<input className={styles.input} readOnly value={shareUrl} onFocus={(e) => e.target.select()} /></label><p className={styles.small}>이 탭을 닫으면 체험 저장은 끝나요. 새로고침하면 이어서 진행할 수 있어요. 실제 선수 이름이나 개인정보는 입력하지 마세요.</p></section>
    </main>{ConfirmModal}
  </div>;
}
