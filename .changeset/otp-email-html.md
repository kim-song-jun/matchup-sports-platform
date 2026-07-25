---
"v1_api": minor
---

Send verification emails as a designed HTML message instead of plain text, and deliver the SES settings to the alpha deploy. The one-time code now arrives in a branded card with the code set large and spaced, wrapped in table layout with fully inline styles so it survives Outlook and the clients that strip `<style>`; a plain-text part is always sent alongside it for clients that block HTML, and no images or links are used — images are blocked by default in many clients, and teaching users to click links in verification mail is exactly the habit phishing relies on. Copy varies by purpose so a password-reset code no longer reads as an address-verification code. The alpha workflow now forwards `SES_REGION` and `EMAIL_FROM` to the deploy script, which is what actually makes the repository variables take effect: Compose resolves interpolation from the shell environment ahead of `--env-file`, so this configures the container without touching the host env file.
