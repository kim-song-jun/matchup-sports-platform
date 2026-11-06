import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

/** Drive the real signup wizard to its phone step; callers configure the nickname endpoint. */
export async function advanceSocialSignupToPhone() {
  await screen.findByRole('heading', { name: '어떤 닉네임으로 활동할까요?' });
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText(/^닉네임/), { target: { value: '카카오러너' } });
  await user.click(screen.getByRole('button', { name: '중복 확인' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: '다음' }));
  const female = screen.queryByRole('radio', { name: '여' });
  if (female) {
    await user.click(female);
    await user.click(screen.getByRole('button', { name: '다음' }));
  }
  const name = screen.queryByLabelText(/^이름/);
  if (name) {
    fireEvent.change(name, { target: { value: '김러너' } });
    await user.click(screen.getByRole('button', { name: '다음' }));
  }
  await screen.findByLabelText(/^휴대폰 번호/);
}
