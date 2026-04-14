import { http } from 'msw';
import { success } from './_utils';
import { mockUser } from '../../fixtures/users';

export const authHandlers = [
  http.post('/api/v1/auth/dev-login', () => {
    return success({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', user: mockUser });
  }),

  http.post('/api/v1/auth/login', () => {
    return success({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', user: mockUser });
  }),

  http.post('/api/v1/auth/register', () => {
    return success({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', user: mockUser });
  }),

  http.get('/api/v1/auth/me', () => {
    return success(mockUser);
  }),

  http.post('/api/v1/auth/refresh', () => {
    return success({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' });
  }),

  http.delete('/api/v1/auth/withdraw', () => {
    return success({ message: '회원 탈퇴가 완료되었습니다' });
  }),
];
