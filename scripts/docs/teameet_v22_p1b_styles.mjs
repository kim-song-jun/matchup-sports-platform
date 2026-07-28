export function css() {
  return `
    :root {
      --blue50:#e8f3ff; --blue100:#d6e7ff; --blue500:#3182f6; --blue600:#2272eb;
      --green50:#e3f8ef; --green500:#03b26c; --orange50:#fff3e0; --orange500:#fe9800;
      --red50:#feebec; --red500:#f04452; --grey50:#f9fafb; --grey100:#f2f4f6;
      --grey150:#eaedf0; --grey200:#e5e8eb; --grey300:#d1d6db; --grey500:#8b95a1;
      --grey600:#6b7684; --grey700:#4e5968; --grey800:#333d4b; --grey900:#191f28;
      --surface:#fff; --shadow-1:0 1px 2px rgba(15,23,42,.05);
      --font:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif;
    }
    * { box-sizing:border-box; }
    body { margin:0; background:#eef1f5; color:var(--grey900); font-family:var(--font); -webkit-font-smoothing:antialiased; }
    .screen { width:390px; min-height:1180px; margin:0 auto; background:var(--grey50); overflow:hidden; position:relative; }
    .topbar { position:sticky; top:0; z-index:2; height:58px; padding:0 18px; display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,.96); border-bottom:1px solid var(--grey100); }
    .topbar strong { font-size:16px; letter-spacing:0; }
    .iconbtn { width:34px; height:34px; border-radius:50%; display:grid; place-items:center; border:1px solid var(--grey100); background:#fff; color:var(--grey700); font-size:15px; font-weight:800; }
    .body { padding:18px 20px 42px; }
    .progress { margin-bottom:22px; }
    .progress-line { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .bars { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; margin-top:10px; }
    .bars i { height:4px; border-radius:99px; background:var(--grey200); }
    .bars i.on { background:var(--blue500); }
    .eyebrow { font-size:12px; color:var(--blue600); font-weight:800; margin-bottom:7px; }
    h1 { margin:0; font-size:25px; line-height:1.22; letter-spacing:0; }
    .sub { margin:8px 0 0; color:var(--grey600); font-size:13px; line-height:1.5; }
    .section { margin-top:27px; }
    .section-head { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .section h2 { margin:0; font-size:16px; line-height:1.25; letter-spacing:0; }
    .section-note { color:var(--grey600); font-size:12px; font-weight:700; white-space:nowrap; }
    .card { background:#fff; border:1px solid var(--grey100); border-radius:18px; box-shadow:var(--shadow-1); padding:18px; }
    .row { display:flex; align-items:center; justify-content:space-between; min-height:50px; gap:14px; border-bottom:1px solid var(--grey100); }
    .row:last-child { border-bottom:0; }
    .row-main { min-width:0; }
    .row-title { font-size:14px; font-weight:800; line-height:1.32; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .row-sub { margin-top:4px; color:var(--grey600); font-size:12px; line-height:1.38; }
    .link { color:var(--blue600); font-size:13px; font-weight:800; white-space:nowrap; }
    .badge { display:inline-flex; align-items:center; justify-content:center; min-height:24px; padding:0 9px; border-radius:999px; background:var(--grey100); color:var(--grey700); font-size:11px; font-weight:800; white-space:nowrap; }
    .badge.blue { background:var(--blue50); color:var(--blue600); }
    .badge.green { background:var(--green50); color:var(--green500); }
    .badge.orange { background:var(--orange50); color:var(--orange500); }
    .badge.red { background:var(--red50); color:var(--red500); }
    .sport-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .sport { min-height:88px; border:1px solid var(--grey100); border-radius:18px; background:#fff; padding:14px; text-align:left; display:flex; flex-direction:column; justify-content:space-between; }
    .sport strong { font-size:16px; }
    .sport span { color:var(--grey600); font-size:12px; font-weight:700; }
    .sport.active { border-color:rgba(49,130,246,.24); background:var(--blue50); }
    .field { margin-top:12px; }
    .label { margin-bottom:7px; color:var(--grey800); font-size:13px; font-weight:800; }
    .input { min-height:48px; border:1px solid var(--grey200); border-radius:14px; background:#fff; padding:13px 14px; color:var(--grey900); font-size:14px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .helper { margin-top:7px; color:var(--grey600); font-size:12px; line-height:1.45; }
    .two { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .notice { margin-top:14px; padding:12px 14px; border-radius:14px; background:var(--blue50); color:var(--blue600); font-size:12px; font-weight:800; line-height:1.45; }
    .notice.orange { background:var(--orange50); color:var(--orange500); }
    .notice.red { background:var(--red50); color:var(--red500); }
    .cta { margin-top:16px; display:grid; grid-template-columns:1fr 2fr; gap:8px; }
    .btn { min-height:48px; border:0; border-radius:14px; font-size:15px; font-weight:900; }
    .btn.primary { background:var(--blue500); color:#fff; }
    .btn.secondary { background:#fff; color:var(--grey800); border:1px solid var(--grey200); }
    .media { height:118px; border-radius:18px; overflow:hidden; margin-top:16px; background:#dfe6ef; position:relative; }
    .media img { width:100%; height:100%; object-fit:cover; display:block; }
    .media:after { content:""; position:absolute; inset:0; background:linear-gradient(180deg,rgba(25,31,40,0),rgba(25,31,40,.48)); }
    .media-label { position:absolute; left:14px; bottom:12px; z-index:1; color:#fff; font-size:13px; font-weight:900; }
    .summary { padding:0; overflow:hidden; }
    .summary-media { height:142px; background-size:cover; background-position:center; position:relative; }
    .summary-media:after { content:""; position:absolute; inset:0; background:linear-gradient(180deg,rgba(25,31,40,0),rgba(25,31,40,.44)); }
    .summary-body { padding:16px; }
    .summary-title { margin-top:10px; font-size:18px; font-weight:900; line-height:1.32; }
    .chip-row { display:flex; flex-wrap:wrap; gap:6px; }
    .rule-list { display:grid; gap:10px; }
    .rule { min-height:42px; display:flex; align-items:center; gap:10px; border-bottom:1px solid var(--grey100); color:var(--grey800); font-size:14px; font-weight:800; }
    .rule:last-child { border-bottom:0; }
    .check { width:22px; height:22px; border-radius:50%; display:grid; place-items:center; background:var(--blue50); color:var(--blue600); font-size:13px; flex:0 0 auto; }
    .photo-accent .hero-photo { display:block; }
    .toss-clean .hero-photo, .compact-utility .hero-photo, .rounded-community .hero-photo { display:none; }
    .compact-utility .body { padding-left:16px; padding-right:16px; }
    .compact-utility .section { margin-top:21px; }
    .compact-utility .card { padding:14px; border-radius:16px; }
    .compact-utility .row { min-height:44px; }
    .compact-utility .sport { min-height:76px; border-radius:16px; }
    .compact-utility h1 { font-size:23px; }
    .rounded-community .card, .rounded-community .sport { border-radius:24px; background:linear-gradient(180deg,#fff,#fbfcff); }
    .rounded-community .input, .rounded-community .btn { border-radius:18px; }
    .rounded-community .notice { border-radius:18px; }
  `;
}
