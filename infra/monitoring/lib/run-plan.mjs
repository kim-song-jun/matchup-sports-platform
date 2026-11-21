// Prints a plan (dry run) or executes it. `exec` is injected so the apply path is testable without AWS.
import { hasPlaceholder } from './plan.mjs';

const shellQuote = (arg) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`);
export const renderCommand = (args) => ['aws', ...args].map(shellQuote).join(' ');

const TOKEN = /\{\{([\w:-]+)\}\}/g;
const substitute = (args, tokens) => {
  let missing = null;
  const out = args.map((a) => a.replace(TOKEN, (_, k) => {
    if (!tokens[k]) missing = k;
    return tokens[k] ?? '';
  }));
  return { args: out, missing };
};

/** Refuses before the first call when a parameter the plan needs was never supplied. */
export function assertApplicable(steps) {
  const open = steps.filter((s) => s.args?.some(hasPlaceholder)).map((s) => s.id);
  if (open.length) {
    throw new Error(`값이 비어 있어서 만들 수 없어요(--prod-instance-id · --alpha-instance-id · --rds-id 를 주세요): ${open.slice(0, 3).join(', ')} 외`);
  }
}

export async function runPlan(steps, { apply, exec, log, buildZip }) {
  if (apply) assertApplicable(steps.filter((s) => !s.note));
  const tokens = {};
  let n = 0;
  for (const step of steps) {
    n += 1;
    const head = `[${n}/${steps.length}] ${step.title}`;
    if (step.note) {
      log(`${head}\n  (서버 역할에 직접 붙일 정책)\n${indent(JSON.stringify(step.policy, null, 2))}`);
      continue;
    }
    if (!apply) {
      // The policy document is printed once, pretty, instead of as a long one-line argument.
      const shown = step.policy ? step.args.map((a) => (a === JSON.stringify(step.policy) ? '<아래 정책>' : a)) : step.args;
      log(`${head}\n  ${step.local ? '(로컬) lambda-handler.mjs + lib/ 를 zip 으로 묶어요' : renderCommand(shown)}`);
      if (step.policy) log(indent(JSON.stringify(step.policy, null, 2)));
      continue;
    }
    log(head);
    if (step.local === 'package') { tokens.zip = await buildZip(); continue; }
    const { args, missing } = substitute(step.args, tokens);
    if (missing) { log(`  건너뛰어요: ${missing} 대상이 없어요`); continue; }
    try {
      const stdout = await exec(args);
      if (step.capture) tokens[step.capture] = String(stdout).trim();
    } catch (err) {
      const text = `${err.stderr ?? ''}${err.message ?? ''}`;
      if (step.tolerate && text.includes(step.tolerate)) { log('  이미 있어요, 그대로 둬요'); continue; }
      throw new Error(`${step.id} 실패: ${text.split('\n')[0].slice(0, 300)}${step.failHint ? `\n  ${step.failHint}` : ''}`);
    }
  }
}

const indent = (text) => text.split('\n').map((l) => `    ${l}`).join('\n');
