import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAlarmNotification, formatDailySummary, formatKst, scrub } from '../lib/format.mjs';

const alarm = (over = {}) => ({
  AlarmName: 'teameet-prod-heap-oom',
  NewStateValue: 'ALARM',
  OldStateValue: 'OK',
  NewStateReason: 'Threshold Crossed: 1 datapoint [1.0 (20/11/26 01:50:00)] was greater than or equal to the threshold (1.0).',
  StateChangeTime: '2026-11-20T01:50:47.803+0000',
  AlarmArn: 'arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:teameet-prod-heap-oom',
  AWSAccountId: '123456789012',
  ...over,
});

test('KST time: 01:50Z is 10:50 on a Friday', () => {
  assert.equal(formatKst('2026-11-20T01:50:47.803+0000'), '11-20(금) 10:50 KST');
  assert.equal(formatKst('2026-11-20T16:00:00Z'), '11-21(토) 01:00 KST');
  assert.throws(() => formatKst('not a time'), /unparseable/);
});

test('alarm message: critical prod heap death, exact text', () => {
  assert.equal(formatAlarmNotification(alarm()), [
    '[긴급][운영] heap 부족으로 프로세스가 죽었어요',
    '• 언제: 11-20(금) 10:50 KST',
    '• 무엇: Threshold Crossed: 1 datapoint [1.0 (20/11/26 01:50:00)] was greater than or equal to the threshold (1.0).',
    '• 한 번 일어난 일이라 회복 알림은 보내지 않아요(최근 10분 중 3분 이상 재시작이 있으면 「재시작 루프」 경보가 따로 와요)',
    '• 먼저 볼 것: <https://github.com/kim-song-jun/matchup-sports-platform/blob/dev/docs/ops/ops-alerts.md#heap-%EB%B6%80%EC%A1%B1|런북>',
    '• 경보 <https://ap-northeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#alarmsV2:alarm/teameet-prod-heap-oom|CloudWatch>',
  ].join('\n'));
});

test('an incident with siblings and repeats says so; a plain alarm does not', () => {
  const text = formatAlarmNotification(alarm({ AlarmName: 'teameet-prod-web-restart' }), {
    alongside: ['teameet-prod-heap-oom'], occurrence: 3, spanMinutes: 4,
  });
  assert.match(text, /• 같이 울린 경보: heap 부족으로 프로세스가 죽었어요\n/);
  assert.match(text, /• 되풀이되고 있어요 — 4분 동안 3번째예요\(알림은 1 · 3 · 6 · 12 · 24 · 48 · 96번째에만 보내요\)/);
  const plain = formatAlarmNotification(alarm({ AlarmName: 'teameet-prod-disk-high' }));
  assert.doesNotMatch(plain, /같이 울린|번째예요|회복 알림은 보내지 않아요/);
});

test('alpha alarms are labelled alpha and demoted to 주의', () => {
  const text = formatAlarmNotification(alarm({ AlarmName: 'teameet-alpha-heap-oom' }));
  assert.match(text.split('\n')[0], /^\[주의\]\[alpha\] /);
});

test('recovery reports the duration when the alarm start is known', () => {
  const text = formatAlarmNotification(
    alarm({ NewStateValue: 'OK', StateChangeTime: '2026-11-20T02:02:47.000+0000' }),
    { alarmedAt: '2026-11-20T01:50:47.000Z' },
  );
  const lines = text.split('\n');
  assert.equal(lines[0], '[회복][운영] heap 부족으로 프로세스가 죽었어요 — 평소로 돌아왔어요');
  assert.equal(lines[1], '• 경보 11-20(금) 10:50 KST → 회복 11-20(금) 11:02 KST (12분)');
  assert.ok(!text.includes('Threshold Crossed'));
});

test('recovery without a known start still reads cleanly', () => {
  const text = formatAlarmNotification(alarm({ NewStateValue: 'OK' }));
  assert.match(text.split('\n')[1], /^• 회복: 11-20\(금\) 10:50 KST$/);
});

test('INSUFFICIENT_DATA is not posted', () => {
  assert.equal(formatAlarmNotification(alarm({ NewStateValue: 'INSUFFICIENT_DATA' })), null);
});

test('an alarm this stack does not know still produces a message from its name', () => {
  const text = formatAlarmNotification(alarm({ AlarmName: 'someone-elses-alarm' }));
  assert.match(text.split('\n')[0], /^\[주의\]\[운영\] someone-elses-alarm$/);
  assert.ok(!text.includes('먼저 볼 것'));
});

test('account numbers, ARNs, IPs and webhook URLs never reach Slack', () => {
  const text = formatAlarmNotification(alarm({
    NewStateReason: 'from 203.0.113.7 in arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:x account 123456789012 via https://hooks.slack.com/services/T0/B0/XXXX',
  }));
  assert.ok(!/123456789012/.test(text));
  assert.ok(!text.includes('203.0.113.7'));
  assert.doesNotMatch(text, /hooks\.slack\.com/);
  assert.doesNotMatch(text, /services\/T0\/B0\/XXXX/);
  assert.ok(!text.includes('arn:aws'));
  assert.equal(scrub('acct 123456789012 ok'), 'acct ok');
});

test('Slack control characters in a reason are escaped', () => {
  const text = formatAlarmNotification(alarm({ NewStateReason: '<!channel> a & b' }));
  assert.ok(text.includes('&lt;!channel&gt; a &amp; b'));
});

test('the region in the console link follows the alarm ARN (us-east-1 health checks)', () => {
  const text = formatAlarmNotification(alarm({
    AlarmName: 'teameet-prod-health-web',
    AlarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:teameet-prod-health-web',
  }));
  assert.ok(text.includes('https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#alarmsV2:alarm/teameet-prod-health-web'));
});

const summary = {
  env: 'prod', date: '2026-11-20', requests: 214_000, requestsAvg7d: 198_000,
  bots: 102_700, botsByName: { GPTBot: 98_000, Googlebot: 6_000, ClaudeBot: 10 },
  errors5xx: 486, errors5xxOutsideDeploy: 452,
  restarts: { web: 5, api: 0, worker: 0, nginx: 0 }, heapOom: 5,
  webMemPctMax: 99, memAvailableMinMB: 277, swapMaxMB: 432, diskUsedPct: 56,
  rdsFreeMemMinMB: 51, rdsFreeStorageGB: 16.9, healthFailures: 4,
  cost: { confirmedDate: '11-19', confirmedDay: 4.71, monthToDate: 96.04, forecast: 144, lastMonth: 147.42 },
  alarmsFired: 7, alarmsOpen: 0,
};

test('daily summary: exact text for the 11-20 numbers', () => {
  assert.equal(formatDailySummary(summary), [
    '[하루 요약][운영] 11-20(금)',
    '• 요청 21.4만건(7일 평균보다 +8%) · 봇 48%(GPTBot 9.8만 · Googlebot 6,000)',
    '• 5xx 486건(배포 창 밖 452) · 재시작 web 5번 · heap 부족 5번',
    '• 메모리: web 최고 99% · 서버 사용 가능 최저 277MB · swap 최고 432MB',
    '• 디스크 56% · RDS 남는 메모리 최저 51MB · RDS 저장 16.9GB 남음',
    '• 외부 헬스 실패 4번',
    '• 비용: 11-19 확정 $4.71 · 이번 달 $96.04(한 달 예상 $144.00) · 지난달 $147.42',
    '• 어제 울린 경보 7개 · 지금 열린 경보 0개 <https://ap-northeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#alarmsV2:|경보 목록>',
  ].join('\n'));
});

test('daily summary shows rate-limit rejections apart from 5xx, only when there were some', () => {
  assert.ok(formatDailySummary({ ...summary, rateLimited: 1200 }).includes('5xx 486건(배포 창 밖 452) · 요청 제한 거절 1,200건 · 재시작'));
  assert.ok(!formatDailySummary({ ...summary, rateLimited: 0 }).includes('요청 제한'));
});

test('daily summary leaves out what it could not read instead of printing zero', () => {
  const text = formatDailySummary({ env: 'prod', date: '2026-11-20', requests: 1000, requestsAvg7d: null, bots: null,
    errors5xx: null, restarts: null, heapOom: null, cost: null, alarmsFired: null, alarmsOpen: null });
  assert.equal(text, '[하루 요약][운영] 11-20(금)\n• 요청 1,000건');
});

test('a quiet day says 0 restarts, not nothing', () => {
  const text = formatDailySummary({ ...summary, restarts: { web: 0, api: 0 }, heapOom: 0, errors5xx: 0, errors5xxOutsideDeploy: 0 });
  assert.ok(text.includes('5xx 0건(배포 창 밖 0) · 재시작 0번 · heap 부족 0번'));
});
