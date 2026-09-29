import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostingInquiryForm } from './hosting-inquiry-form';

const RETENTION = '문의 처리 완료 후 1년';
const EMAIL = 'help@example.com';

type Reply = { status: number; body: unknown };
type User = ReturnType<typeof userEvent.setup>;
let reply: () => Promise<Reply>;
const inquiryCalls: { method: string; body: Record<string, unknown> }[] = [];

function json(status: number, body: unknown): Reply {
  return { status, body };
}

beforeEach(() => {
  inquiryCalls.length = 0;
  reply = async () => json(200, { status: 'success', data: { received: true }, timestamp: '' });
  // 브라우저 fetch 만 바꾼다 — 요청 조립·에러 해석은 실제 api-client 가 한다.
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (!String(url).endsWith('/public/inquiries')) return new Response('{}', { status: 200 });
    inquiryCalls.push({ method: String(init.method), body: JSON.parse(String(init.body)) });
    const { status, body } = await reply();
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderForm() {
  const user = userEvent.setup();
  render(<HostingInquiryForm retention={RETENTION} contactEmail={EMAIL} />);
  return user;
}

const next = (user: User) => user.click(screen.getByRole('button', { name: '다음' }));
const consentBox = () => screen.getByRole('checkbox', { name: /개인정보 수집·이용에 동의해요/ });

async function fillContact(user: User) {
  await user.type(screen.getByLabelText(/담당자 이름/), '  김가상  ');
  await user.type(screen.getByLabelText(/답변 받을 이메일/), 'host@example.com');
}

/** 1·2단계를 채워 넘기고 3단계(내용·동의)에 선다. */
async function toLastStep(user: User) {
  await fillContact(user);
  await next(user);
  await next(user);
  await screen.findByRole('heading', { name: '3단계 · 내용·동의' });
}

async function submitValid(user: User) {
  await toLastStep(user);
  await user.type(screen.getByLabelText(/문의 내용/), '가상 리그를 열고 싶어요.');
  await user.click(consentBox());
  await user.click(screen.getByRole('button', { name: '문의 보내기' }));
}

function currentStep(): string {
  const stepper = screen.getByRole('list', { name: '문의 단계' });
  return within(stepper).getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step')!.textContent ?? '';
}

describe('대회 개설·제휴 문의 폼 — 단계 이동', () => {
  it('1단계에서 다음을 누르면 이 단계 칸만 검사한다 — 뒤 단계 필수 칸(내용·동의)은 아직 오류가 아니다', async () => {
    const user = renderForm();
    await next(user);

    const summary = await screen.findByRole('alert');
    expect(within(summary).getByText('입력한 내용을 2군데 확인해 주세요')).toBeInTheDocument();
    expect(within(summary).getAllByRole('link').map((link) => link.textContent)).toEqual([
      '담당자 이름을 적어 주세요.',
      '답변 받을 이메일을 적어 주세요.',
    ]);
    await waitFor(() => expect(screen.getByLabelText(/담당자 이름/)).toHaveFocus());
    expect(screen.getByLabelText(/담당자 이름/)).toHaveAttribute('aria-invalid', 'true');
    expect(currentStep()).toContain('유형·연락처');
    expect(inquiryCalls).toHaveLength(0);
  });

  it('이메일 형식이 틀리면 1단계에 머문다', async () => {
    const user = renderForm();
    await user.type(screen.getByLabelText(/담당자 이름/), '김가상');
    await user.type(screen.getByLabelText(/답변 받을 이메일/), 'host@');
    await next(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('이메일 형식을 확인해 주세요.');
    expect(currentStep()).toContain('유형·연락처');
  });

  it('칸을 채우면 다음 단계로 넘어가 단계 제목에 초점을 두고, 이전으로 돌아가도 입력값이 남는다', async () => {
    const user = renderForm();
    await fillContact(user);
    await next(user);

    const second = await screen.findByRole('heading', { name: '2단계 · 대회 정보' });
    await waitFor(() => expect(second).toHaveFocus());
    expect(currentStep()).toContain('대회 정보');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('textbox', { name: /담당자 이름/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: '이전' }));
    const first = await screen.findByRole('heading', { name: '1단계 · 유형·연락처' });
    await waitFor(() => expect(first).toHaveFocus());
    expect(screen.getByRole('textbox', { name: /담당자 이름/ })).toHaveValue('  김가상  ');
    expect(screen.queryByRole('button', { name: '이전' })).toBeNull();
  });

  it('선택 칸뿐인 2단계는 비워도 넘어가고, 3단계에서는 내용·동의가 비면 보내지 않는다', async () => {
    const user = renderForm();
    await toLastStep(user);
    await user.click(screen.getByRole('button', { name: '문의 보내기' }));

    const summary = await screen.findByRole('alert');
    expect(within(summary).getAllByRole('link').map((link) => link.textContent)).toEqual([
      '문의 내용을 적어 주세요.',
      '개인정보 수집·이용에 동의해 주세요.',
    ]);
    await waitFor(() => expect(screen.getByLabelText(/문의 내용/)).toHaveFocus());
    expect(inquiryCalls).toHaveLength(0);
  });

  it('다른 칸을 다 채워도 개인정보 동의 없이는 보내지 않는다', async () => {
    const user = renderForm();
    await toLastStep(user);
    await user.type(screen.getByLabelText(/문의 내용/), '가상 리그를 열고 싶어요.');
    await user.click(screen.getByRole('button', { name: '문의 보내기' }));

    await waitFor(() => expect(consentBox()).toHaveFocus());
    expect(consentBox()).toHaveAccessibleDescription('개인정보 수집·이용에 동의해 주세요.');
    expect(inquiryCalls).toHaveLength(0);
  });

  it('동의 안내에 수집 항목·목적·보관 기간(사이트 정보 값)을 보여 준다', async () => {
    const user = renderForm();
    await toLastStep(user);
    const terms = screen.getAllByRole('term').map((node) => node.textContent);
    expect(terms).toEqual(['수집 항목', '이용 목적', '보관 기간']);
    // 서버가 저장하는 선택 항목도 수집 항목에 적혀 있어야 동의 범위가 맞다.
    expect(screen.getByText(/종목·희망 시기\(선택\)/)).toBeInTheDocument();
    expect(screen.getByText(RETENTION)).toBeInTheDocument();
  });
});

describe('대회 개설·제휴 문의 폼 — 보내기', () => {
  it('보내는 동안 버튼을 잠그고, 접수되면 입력한 이메일로 완료 화면을 그린다', async () => {
    let release!: (value: Reply) => void;
    reply = () => new Promise((resolve) => { release = resolve; });
    const user = renderForm();
    await user.click(screen.getByRole('radio', { name: '제휴 문의' }));
    await fillContact(user);
    await next(user);
    await user.selectOptions(await screen.findByLabelText(/종목/), 'futsal');
    await next(user);
    await user.type(await screen.findByLabelText(/문의 내용/), '가상 리그를 열고 싶어요.');
    await user.click(consentBox());
    await user.click(screen.getByRole('button', { name: '문의 보내기' }));

    expect(await screen.findByRole('button', { name: '보내는 중이에요' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(inquiryCalls).toHaveLength(1);
    expect(inquiryCalls[0].method).toBe('POST');
    expect(inquiryCalls[0].body).toMatchObject({
      category: 'partnership',
      name: '김가상',
      email: 'host@example.com',
      message: '가상 리그를 열고 싶어요.',
      sportType: 'futsal',
      organization: '',
      consent: true,
      website: '',
    });
    expect(inquiryCalls[0].body.formStartedAt).toEqual(expect.any(Number));
    expect(inquiryCalls[0].body.formStartedAt).toBeGreaterThan(0);

    release(json(200, { status: 'success', data: { received: true }, timestamp: '' }));
    const done = await screen.findByRole('status');
    expect(within(done).getByRole('heading', { name: '제휴 문의가 접수됐어요' })).toBeInTheDocument();
    expect(done).toHaveTextContent('host@example.com');
    await waitFor(() => expect(done).toHaveFocus());

    await user.click(screen.getByRole('button', { name: '다른 문의 보내기' }));
    expect(screen.getByRole('textbox', { name: /담당자 이름/ })).toHaveValue('');
    expect(currentStep()).toContain('유형·연락처');
  });

  it('숨긴 칸(honeypot)은 탭 순서·보조기기에서 빠지고, 값은 그대로 서버로 간다', async () => {
    const user = renderForm();
    const trap = screen.getByLabelText('웹사이트(비워 두세요)');
    expect(trap).toHaveAttribute('tabindex', '-1');
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(trap).not.toHaveAttribute('name', 'website');

    await user.type(trap, 'http://spam.example');
    await submitValid(user);
    await screen.findByRole('status');
    expect(inquiryCalls[0].body.website).toBe('http://spam.example');
  });

  it('서버가 실패하면 입력을 지키고 이메일 창구를 안내하며, 다시 보낼 수 있다', async () => {
    reply = async () => json(500, { status: 'error', statusCode: 500, code: 'INTERNAL_ERROR', message: 'x', timestamp: '' });
    const user = renderForm();
    await submitValid(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`문의를 보내지 못했어요. 잠시 뒤 다시 보내거나 ${EMAIL} 로 이메일을 보내 주세요.`);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText(/문의 내용/)).toHaveValue('가상 리그를 열고 싶어요.');

    reply = async () => json(200, { status: 'success', data: { received: true }, timestamp: '' });
    await user.click(screen.getByRole('button', { name: '다시 보내기' }));
    expect(await screen.findByRole('heading', { name: '대회 개설 문의가 접수됐어요' })).toBeInTheDocument();
    expect(inquiryCalls).toHaveLength(2);
  });

  it('요청 제한(429)과 중복 접수(409)는 각각의 이유를 알려 준다', async () => {
    reply = async () => json(429, { status: 'error', statusCode: 429, code: 'INTERNAL_ERROR', message: 'Too Many Requests', timestamp: '' });
    const user = renderForm();
    await submitValid(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('짧은 시간에 여러 번 보내서 잠시 막혔어요.');

    reply = async () => json(409, { status: 'error', statusCode: 409, code: 'INQUIRY_DUPLICATE', message: 'dup', timestamp: '' });
    await user.click(screen.getByRole('button', { name: '다시 보내기' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('같은 내용의 문의가 이미 접수됐어요.'));
  });

  it('서버가 앞 단계 칸(이메일)을 거절하면 그 단계로 돌아가 칸 아래 화면 문구와 함께 초점을 둔다', async () => {
    reply = async () => json(400, {
      status: 'error', statusCode: 400, code: 'VALIDATION_ERROR', message: '입력값을 다시 확인해 주세요.', timestamp: '',
      details: [{ field: 'email', messages: ['email must be an email'] }, { field: 'formStartedAt', messages: ['x'] }],
    });
    const user = renderForm();
    await submitValid(user);

    const email = await screen.findByRole('textbox', { name: /답변 받을 이메일/ });
    await waitFor(() => expect(email).toHaveFocus());
    expect(currentStep()).toContain('유형·연락처');
    expect(email).toHaveAccessibleDescription('이메일 형식을 확인해 주세요.');
    expect(screen.queryByText('email must be an email')).toBeNull();
  });
});
