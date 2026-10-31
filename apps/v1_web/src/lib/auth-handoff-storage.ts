import { clearPendingSocialLink } from './pending-social-link';
import { clearWithdrawalCancel } from './withdrawal-cancel-storage';

/**
 * 로그인 사이로 토큰을 넘기려고 sessionStorage 에 맡겨 둔 값을 전부 지운다. 사용자가 직접 로그아웃(또는 가입 취소·탈퇴)할 때만 부른다.
 * 같은 탭에서 다른 사람이 이어서 로그인하면 앞사람이 받은 연결·철회 토큰을 쓰게 되기 때문이다.
 *
 * `clearStoredV1Session` 에 넣지 않는다 — 그 함수는 로그인 화면이 비로그인 방문자의 401 을 만났을 때도 불리므로,
 * 거기서 지우면 충돌 409 직후 원래 계정으로 로그인하기도 전에 자동 연결 토큰이 사라진다.
 * 가입 중인 계정이 "기존 계정으로 로그인"을 누르면 화면이 로그아웃 뒤에 연결 토큰을 저장하므로, 이 함수가 먼저 지워도 된다.
 * 새 보관 칸을 만들면 여기에 더한다.
 */
export function clearAuthHandoffStorage() {
  clearPendingSocialLink();
  clearWithdrawalCancel();
}
