/**
 * The password rule every route that sets a login password shares (signup, adding an email login, resetting one).
 *
 * This file exists twice, byte for byte: apps/v1_api/src/auth/account-password-rules.ts is the one to edit, and
 * apps/v1_web/src/lib/account-password-rules.ts is its copy, so the form hint can never judge a password
 * differently from the server. Each app is built from its own folder, which is why one file cannot be imported by
 * both; apps/v1_web/src/lib/account-password-rules.test.ts fails when the copies differ.
 */

export const ACCOUNT_PASSWORD_MIN_LENGTH = 8;

export const COMMON_PASSWORD_ERROR_CODE = 'PASSWORD_TOO_COMMON';
export const COMMON_PASSWORD_MESSAGE = '너무 흔한 비밀번호예요. 다른 비밀번호를 정해 주세요.';

/**
 * Lowercase, at least ACCOUNT_PASSWORD_MIN_LENGTH characters (a shorter entry could never matter), no duplicates.
 * Matching ignores case, so 'Password1' is covered by 'password1'.
 */
export const COMMON_PASSWORDS: readonly string[] = [
  // Digit runs, repeats, mirrored and keypad patterns, phone-number shapes
  '12345678', '123456789', '1234567890', '87654321', '987654321', '9876543210', '01234567', '012345678',
  '0123456789', '11111111', '22222222', '33333333', '44444444', '55555555', '66666666', '77777777', '88888888',
  '99999999', '00000000', '111111111', '222222222', '333333333', '444444444', '555555555', '666666666', '777777777',
  '888888888', '999999999', '000000000', '1111111111', '0000000000', '9999999999', '5555555555', '11223344',
  '1122334455', '112233445566', '12341234', '123412345', '12345123', '1234512345', '123123123', '12312312',
  '12121212', '12344321', '123454321', '1234554321', '123456654321', '123456123456', '147258369', '741852963',
  '963852741', '369258147', '147852369', '123789456', '789456123', '456789123', '456123789', '1357924680',
  '13579246', '135792468', '24681357', '2468013579', '20202020', '20212021', '20222022', '20232023', '20242024',
  '20252025', '20262026', '01012345678', '01011112222', '01012341234', '01011111111', '01000000000', '01022222222',
  '01033333333', '01044444444', '01055555555', '01066666666', '01077777777', '01088888888', '01099999999',
  // Birthday-shaped YYYY0101
  '19500101', '19510101', '19520101', '19530101', '19540101', '19550101', '19560101', '19570101', '19580101',
  '19590101', '19600101', '19610101', '19620101', '19630101', '19640101', '19650101', '19660101', '19670101',
  '19680101', '19690101', '19700101', '19710101', '19720101', '19730101', '19740101', '19750101', '19760101',
  '19770101', '19780101', '19790101', '19800101', '19810101', '19820101', '19830101', '19840101', '19850101',
  '19860101', '19870101', '19880101', '19890101', '19900101', '19910101', '19920101', '19930101', '19940101',
  '19950101', '19960101', '19970101', '19980101', '19990101', '20000101', '20010101', '20020101', '20030101',
  '20040101', '20050101', '20060101', '20070101', '20080101', '20090101', '20100101', '20110101', '20120101',
  // Single letter repeated
  'aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd', 'eeeeeeee', 'ffffffff', 'gggggggg', 'hhhhhhhh', 'iiiiiiii',
  'jjjjjjjj', 'kkkkkkkk', 'llllllll', 'mmmmmmmm', 'nnnnnnnn', 'oooooooo', 'pppppppp', 'qqqqqqqq', 'rrrrrrrr',
  'ssssssss', 'tttttttt', 'uuuuuuuu', 'vvvvvvvv', 'wwwwwwww', 'xxxxxxxx', 'yyyyyyyy', 'zzzzzzzz',
  // Keyboard walks and letter-digit alternations
  'qwertyui', 'qwertyuiop', 'qwerty12', 'qwerty123', 'qwerty1234', 'qwerty12345', 'qwerty123456', 'qwertyuiop123',
  'qwer1234', 'qwer12345', 'qwerasdf', 'qwerasdfzxcv', 'qwerqwer', 'qweqweqwe', 'qwe12345', 'qwe123qwe', 'qwe123456',
  'qwert12345', 'qwertyqwerty', 'qwertzuiop', 'azertyuiop', 'asdfghjk', 'asdfghjkl', 'asdfghjkl1', 'asdfghjkl123',
  'asdf1234', 'asdf12345', 'asdfasdf', 'asdfqwer', 'asdfzxcv', 'zxcvbnm1', 'zxcvbnm123', 'zxcvbnm12', 'zxcv1234',
  'zxcvzxcv', 'qazwsxedc', 'qazwsxedc123', 'qazwsx12', 'qazwsx123', 'qazwsx1234', '1qaz2wsx', '1qaz2wsx3edc',
  '1qaz2wsx3edc4rfv', '1qazxsw2', '1qaz@wsx', '!qaz2wsx', '!qaz@wsx', '1qaz!qaz', 'q1w2e3r4', 'q1w2e3r4t5',
  'q1w2e3r4t5y6', 'q1w2e3r4!', '1q2w3e4r', '1q2w3e4r5t', '1q2w3e4r5t6y', '1q2w3e4r!', '1q2w3e4r1', 'a1b2c3d4',
  'a1b2c3d4e5', 'a1s2d3f4', 'a1s2d3f4g5', 'z1x2c3v4', 'qweasdzxc', 'qweasdzxc123', 'qweasd123', 'qweasd1234',
  'abcd1234', 'abcd12345', 'abcd123456', 'abcdefgh', 'abcdefghi', 'abcdefghij', 'abcdefg1', 'abcdefg12',
  'abcdefg123', 'abcdef12', 'abcdef123', 'abcdef1234', 'abc12345', 'abc123456', 'abcabcabc', 'abcd@1234',
  'abcd!1234', 'asdf@1234', 'asdf!@#$', 'asdf1234!', 'qwer@1234', 'qwer!@#$', 'qwer!1234', '!@#$%^&*', '!@#$1234',
  '1234!@#$', '!@#$%^&*()', 'a123456!', 'a123456@', 'a1234567', 'a12345678', 'a123456789', 'aa123456', 'aa1234567',
  'aa12345678', 'aaa12345',
  // Common English words and service names
  'password', 'password1', 'password12', 'password123', 'password1234', 'password12345', 'password!', 'password1!',
  'password!@#', 'passw0rd', 'passw0rd1', 'passw0rd!', 'passw0rd123', 'p@ssw0rd', 'p@ssw0rd1', 'p@ssw0rd!',
  'p@ssword', 'p@ssword1', 'p@ssword123', 'pa$$word', 'pa$$w0rd', 'pass1234', 'pass12345', 'pass123456', 'passpass',
  'admin123', 'admin1234', 'admin12345', 'admin123456', 'admin@123', 'admin1111', 'adminadmin', 'administrator',
  'root1234', 'root12345', 'rootroot', 'test1234', 'test12345', 'test123456', 'test1111', 'testtest', 'testing123',
  'testing1', 'tester123', 'guest123', 'guest1234', 'guestguest', 'user1234', 'user12345', 'username', 'userpass',
  'login123', 'login1234', 'secret12', 'secret123', 'welcome1', 'welcome12', 'welcome123', 'welcome1234', 'welcome!',
  'letmein1', 'letmein12', 'letmein123', 'letmein!', 'iloveyou', 'iloveyou1', 'iloveyou12', 'iloveyou123',
  'iloveyou!', 'iloveu123', 'love1234', 'love12345', 'lovelove', 'loveyou123', 'monkey12', 'monkey123', 'dragon12',
  'dragon123', 'football', 'football1', 'football12', 'football123', 'baseball', 'baseball1', 'basketball',
  'basketball1', 'volleyball', 'soccer123', 'soccer1234', 'futsal12', 'futsal123', 'futsal1234', 'running12',
  'running123', 'runner123', 'swimming1', 'swimming123', 'superman', 'superman1', 'batman12', 'batman123',
  'spiderman', 'trustno1', 'master123', 'master1234', 'masterkey', 'mustang1', 'sunshine', 'sunshine1', 'princess',
  'princess1', 'princess123', 'shadow12', 'shadow123', 'michael1', 'michael123', 'jordan23', 'jordan123', 'jennifer',
  'jessica1', 'charlie1', 'charlie123', 'daniel123', 'ashley123', 'thomas123', 'hunter123', 'changeme', 'changeme1',
  'changeme123', 'change123', 'default123', 'default1234', 'hello123', 'hello1234', 'hello12345', 'helloworld',
  'helloworld1', 'internet', 'internet1', 'computer', 'computer1', 'computer123', 'whatever', 'freedom1',
  'freedom123', 'starwars', 'starwars1', 'pokemon1', 'pokemon123', 'google123', 'google1234', 'gmail1234',
  'yahoo123', 'naver123', 'naver1234', 'naver12345', 'daum1234', 'nate1234', 'kakao123', 'kakao1234', 'kakao12345',
  'teameet1', 'teameet12', 'teameet123', 'teameet1234', 'teameet!', 'matchup1', 'matchup123', 'matchup1234',
  // Korean-user habits: romanized words and Korean-layout typing (비밀번호, 사랑해, 안녕)
  'sarang12', 'sarang123', 'sarang1234', 'saranghae', 'saranghae1', 'saranghae12', 'saranghae123', 'saranghae!',
  'saranghaeyo', 'saranghaeyo1', 'hwaiting', 'hwaiting1', 'hwaiting12', 'hwaiting123', 'fighting1', 'fighting123',
  'fighting!', 'chingu123', 'oppa1234', 'annyeong1', 'annyeong123', 'kimchi123', 'korea123', 'korea1234',
  'korea1234!', 'korea!234', 'seoul123', 'seoul1234', 'busan123', 'busan1234', 'daehanminguk', 'daehanminguk1',
  'daehanmin1234', 'dkssud123', 'dkssud1234', 'dkssudgktpdy', 'tkfkdgo123', 'tkfkdgo1234', 'tkfkdgody', 'qlalfqjsgh',
  'qlalfqjsgh1', 'qlalfqjsgh12', 'qlalfqjsgh123', 'qlalfqjsgh1234', 'rkskekfk', 'rkskekfk1', 'rkskekfk123',
];

const COMMON_PASSWORD_SET: ReadonlySet<string> = new Set(COMMON_PASSWORDS);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORD_SET.has(password.toLowerCase());
}

export type AccountPasswordIssue = 'too_short' | 'too_common';

/** Why a password cannot be used, or null when it can. Too short wins when both hold. */
export function accountPasswordIssue(password: string): AccountPasswordIssue | null {
  if (password.length < ACCOUNT_PASSWORD_MIN_LENGTH) return 'too_short';
  return isCommonPassword(password) ? 'too_common' : null;
}
