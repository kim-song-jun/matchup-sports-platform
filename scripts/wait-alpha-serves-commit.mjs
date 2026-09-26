// alpha 가 특정 커밋(조상 포함)을 서빙할 때까지 대기 — 배포 창 오진 방지용 게이트.
// 사용: node scripts/wait-alpha-serves-commit.mjs <commit> [maxPolls] [intervalMs]
import { execFileSync } from 'node:child_process';

const [target, maxPolls = '15', intervalMs = '90000'] = process.argv.slice(2);
if (!target) throw new Error('usage: wait-alpha-serves-commit.mjs <commit>');

for (let i = 1; i <= Number(maxPolls); i += 1) {
  await new Promise((resolve) => setTimeout(resolve, Number(intervalMs)));
  let serving = '';
  try {
    const res = await fetch('https://alpha.teameet.co.kr/landing', { method: 'HEAD' });
    serving = res.headers.get('x-teameet-commit') ?? '';
  } catch {
    console.log(`poll=${i} fetch failed (deploy window?)`);
    continue;
  }
  try {
    execFileSync('git', ['fetch', 'origin', 'dev', '-q']);
    execFileSync('git', ['merge-base', '--is-ancestor', target, serving]);
    console.log(`poll=${i} serving=${serving} CONTAINS_TARGET`);
    process.exit(0);
  } catch {
    console.log(`poll=${i} serving=${serving.slice(0, 12)} (not yet)`);
  }
}
console.log('TIMEOUT');
process.exit(1);
