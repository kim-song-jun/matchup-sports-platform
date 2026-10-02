# Play reviewer access instructions

Do not store reviewer credentials in this repository. Put the active test account and password only in
Play Console's **App access** form and assign an owner who will keep the account valid during review.

Reviewer path:

1. Launch Teameet and sign in with the Play Console reviewer account.
2. The home screen opens after authentication; use the bottom navigation to reach matches, teams, chat,
   notifications, and My.
3. Notification permission is optional. Open **My → Settings → Notifications**, enable app notifications,
   then accept or deny the Android prompt. Denial must not block any other screen.
4. Location is optional. Use the current-location action on Home to trigger the coarse-location prompt.
   Denial must leave manual region and the rest of the service usable.
5. Account deletion is available at **My → Settings → Withdrawal**. The public alternative is
   `https://teameet.co.kr/account-deletion`.
6. Privacy policy is available at `https://teameet.co.kr/terms?document=privacy` without authentication.

Before submitting, verify the reviewer account is not an administrator, contains no real personal data,
does not require OTP controlled by one employee, and can reach every login-gated feature described in the
store listing. Record the verification date and owner in the private release record.
