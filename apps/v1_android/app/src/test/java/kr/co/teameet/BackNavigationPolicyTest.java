package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public final class BackNavigationPolicyTest {
    @Test public void goesBackWheneverWebViewHistoryExists() {
        assertEquals(BackNavigationPolicy.Action.GO_BACK,
            BackNavigationPolicy.decide(true, "https://alpha.teameet.co.kr/home", 0L, 1_000L));
        assertEquals(BackNavigationPolicy.Action.GO_BACK,
            BackNavigationPolicy.decide(true, "https://kauth.kakao.com/oauth/authorize", 0L, 1_000L));
        assertEquals(BackNavigationPolicy.Action.GO_BACK,
            BackNavigationPolicy.decide(true, null, 0L, 1_000L));
    }

    @Test public void navigatesHomeWhenNoHistoryAndNotOnTheHomeRoute() {
        assertEquals(BackNavigationPolicy.Action.NAVIGATE_HOME,
            BackNavigationPolicy.decide(false, "https://alpha.teameet.co.kr/matches/42", 0L, 1_000L));
        assertEquals(BackNavigationPolicy.Action.NAVIGATE_HOME,
            BackNavigationPolicy.decide(false, "/notifications", 0L, 1_000L));
        assertEquals(BackNavigationPolicy.Action.NAVIGATE_HOME,
            BackNavigationPolicy.decide(false, "https://alpha.teameet.co.kr/home/", 0L, 1_000L));
    }

    @Test public void navigatesHomeWhenNoHistoryAndUrlIsUnknownOrBlank() {
        assertEquals(BackNavigationPolicy.Action.NAVIGATE_HOME,
            BackNavigationPolicy.decide(false, null, 0L, 1_000L));
        assertEquals(BackNavigationPolicy.Action.NAVIGATE_HOME,
            BackNavigationPolicy.decide(false, "", 0L, 1_000L));
        assertEquals(BackNavigationPolicy.Action.NAVIGATE_HOME,
            BackNavigationPolicy.decide(false, "about:blank", 0L, 1_000L));
    }

    @Test public void navigatesHomeWhenNoHistoryDuringKakaoOAuthOnAnotherHost() {
        assertEquals(BackNavigationPolicy.Action.NAVIGATE_HOME,
            BackNavigationPolicy.decide(false, "https://kauth.kakao.com/oauth/authorize?client_id=1", 0L, 1_000L));
        assertEquals(BackNavigationPolicy.Action.NAVIGATE_HOME,
            BackNavigationPolicy.decide(false, "https://accounts.kakao.com/login", 0L, 1_000L));
    }

    @Test public void showsExitHintOnFirstBackPressAtHome() {
        assertEquals(BackNavigationPolicy.Action.SHOW_EXIT_HINT,
            BackNavigationPolicy.decide(false, "https://alpha.teameet.co.kr/home",
                BackNavigationPolicy.NO_PREVIOUS_PRESS_MILLIS, 1_000L));
    }

    @Test public void exitsOnlyWhenSecondBackPressAtHomeArrivesWithinTwoSeconds() {
        long firstPress = 10_000L;
        assertEquals(BackNavigationPolicy.Action.EXIT,
            BackNavigationPolicy.decide(false, "/home", firstPress, firstPress + 1_999L));
        assertEquals(BackNavigationPolicy.Action.EXIT,
            BackNavigationPolicy.decide(false, "/home", firstPress,
                firstPress + BackNavigationPolicy.EXIT_CONFIRMATION_WINDOW_MILLIS));
        assertEquals(BackNavigationPolicy.Action.SHOW_EXIT_HINT,
            BackNavigationPolicy.decide(false, "/home", firstPress,
                firstPress + BackNavigationPolicy.EXIT_CONFIRMATION_WINDOW_MILLIS + 1L));
    }
}
