import { createSessionJsonSlot } from './session-json-slot';

const SIGNUP_PHOTO_NOTICE_KEY = 'teameet.v1.signupPhotoNotice';

const slot = createSessionJsonSlot<true>(SIGNUP_PHOTO_NOTICE_KEY, (value) => (value === true ? true : null));

/** 이메일 가입은 끝났는데 프로필 사진만 올리지 못했다는 표시. 가입 완료 화면이 한 번 읽고 안내한다. */
export function markSignupPhotoNotice(): void {
  slot.save(true);
}

/** 표시가 있었는지 돌려주고 지운다 — 새로고침해도 안내가 다시 뜨지 않는다. */
export function consumeSignupPhotoNotice(): boolean {
  const marked = slot.read() === true;
  slot.clear();
  return marked;
}
