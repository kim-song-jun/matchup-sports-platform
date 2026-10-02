# Sign in with Apple — 버튼 마크

Apple 이 그려서 내려주는 공식 아트워크다. 직접 그리거나 자르지 않는다.
받은 곳(Apple 의 버튼 생성기가 "Download" 로 거는 바로 그 URL):

```
https://appleid.cdn-apple.com/appleid/button/logo?size=47&color=black&border=false&scale=2
https://appleid.cdn-apple.com/appleid/button/logo?size=47&color=white&border=false&scale=2
```

`color` 는 **배경색**을 말한다 — `black` 은 검은 바탕에 흰 사과, `white` 는 흰 바탕에
검은 사과다. 그래서 파일 이름을 `on-black` / `on-white` 로 두었다: 버튼 배경과 같은
쪽을 쓰면 사각 바탕이 버튼에 그대로 묻히고 사과만 남는다.

바탕색이 버튼과 어긋날 걱정은 없다 — HIG 가 버튼 배경을 순검정 또는 순흰색으로
못박고 있어(`--static-black` / `--static-white`) 다른 값이 되면 그 자체가 규격 위반이다.

`size=47` 은 버튼 높이와 같다. HIG: "add the logo image, making sure its height matches
the height of the button. Because the logo image includes top and bottom padding,
vertically aligning the title in the button ensures that the title, the logo, and the
button stay properly aligned." — 아트워크가 자체 여백을 갖고 있으므로 버튼의 `gap` 은
0 으로 둔다.

높이를 바꾸면 `size` 를 그 값으로 맞춰 다시 받는다.
