'use client';

import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { useV1LineupTodos } from '@/hooks/use-v1-api';
import { formatMonthDay } from '@/lib/date-utils';

/**
 * "아직 라인업을 넣지 않은 다가오는 경기" 카드.
 *
 * 알림(푸시·인앱)과 짝을 이루되 성격이 다르다. 알림은 한 번 지나가면 끝이고 꺼둘 수도
 * 있지만, 이 카드는 볼 때마다 서버에서 다시 계산해 온다 — 알림을 놓쳤어도, 껐어도,
 * 앱을 며칠 만에 열었어도 남아 있다.
 *
 * 할 일이 없으면 아무것도 그리지 않는다. 빈 상태를 "지금 할 일이 없어요" 같은 카드로
 * 채우면 홈 화면에서 아무 일도 하지 않는 자리가 늘 한 칸 잡힌다.
 *
 * 실패는 다르다. 조회가 실패했는데 카드가 그냥 사라지면 "할 일이 없는 것"과 구별되지 않아,
 * 경기 당일까지 라인업을 안 넣은 채로 지나갈 수 있다(웨이브 8 감사). 훅이 retry: false 라
 * 자동 재시도도 없으므로 실패는 재시도 버튼과 함께 드러낸다.
 */
export function LineupTodoCard({ enabled = true }: { enabled?: boolean }) {
  const query = useV1LineupTodos({ enabled });
  const items = query.data?.items ?? [];

  if (query.isError) {
    return (
      <section aria-labelledby="lineup-todo-heading">
        <Card pad={16}>
          <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 id="lineup-todo-heading" className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
                라인업을 기다리는 경기
              </h2>
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>
                목록을 불러오지 못했어요. 할 일이 남아 있을 수 있어요.
              </p>
            </div>
            <button className="tm-btn tm-btn-sm tm-btn-outline" type="button" onClick={() => void query.refetch()}>
              다시 불러오기
            </button>
          </div>
        </Card>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="lineup-todo-heading">
      <Card pad={16}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <h2 id="lineup-todo-heading" className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
            라인업을 기다리는 경기
          </h2>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            {items.length}건
          </span>
        </div>

        <ul style={{ display: 'grid', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
          {items.slice(0, 5).map((todo) => (
            <li key={`${todo.gameId}:${todo.teamId}`}>
              <Link
                href={todo.deepLink}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 44,
                  padding: '12px 12px',
                  borderRadius: 'var(--radius-control)',
                  border: '1px solid var(--border)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span style={{ flex: 1, display: 'grid', gap: 2 }}>
                  {/* title 에는 이미 "어느 대회·리그의 몇 번째 경기인지"가 들어 있다 —
                      대회는 "대회명 · 8강", 리그 대진은 "리그명 N주차", 리그가 없는 친선
                      팀매치만 '팀 매치'다(서버 lineup-todo.service.ts). 여러 리그를 동시에
                      뛰는 팀장이 목록만 보고 경기를 고를 수 있어야 하므로, 여기서 제목을
                      잘라내거나 고정 라벨로 바꾸지 않는다. 주차는 서버가 킥오프 시각에서
                      매번 파생하므로(재일정돼도 다른 리그 화면과 어긋나지 않는다) 여기서
                      다시 계산하지도 않는다. */}
                  <span className="tm-text-label" style={{ fontWeight: 700 }}>
                    {todo.title}
                  </span>
                  <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                    {[
                      todo.teamName,
                      todo.opponentName !== null ? `vs ${todo.opponentName}` : null,
                      formatMonthDay(todo.scheduledAt),
                    ]
                      .filter((part): part is string => part !== null && part !== undefined)
                      .join(' · ')}
                  </span>
                </span>
                {/* 상태는 색이 아니라 문구로 구분한다 — 색만으로 뜻을 전하지 않는다. */}
                <span
                  className="tm-text-micro"
                  style={{
                    flexShrink: 0,
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-pill)',
                    fontWeight: 700,
                    border: '1px solid var(--orange700)',
                    color: 'var(--orange700)',
                    background: 'var(--orange50)',
                  }}
                >
                  {todo.state === 'MISSING' ? '미작성' : '제출 전'}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {items.length > 5 ? (
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: '8px 0 0' }}>
            외 {items.length - 5}건이 더 있어요.
          </p>
        ) : null}
      </Card>
    </section>
  );
}
