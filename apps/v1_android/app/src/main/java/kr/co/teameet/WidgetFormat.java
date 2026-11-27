package kr.co.teameet;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;

/** 위젯에 나오는 글자 — 시간·날짜·구간 이름. 화면 코드와 떨어뜨려 두고 단위 테스트로 고정한다. */
final class WidgetFormat {
    static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String[] WEEKDAYS = {"월", "화", "수", "목", "금", "토", "일"};

    private WidgetFormat() {}

    /** 「3시간 남았어요」 — 한 시간 아래는 분, 하루 이상은 일. */
    static String remaining(long deadlineMs, long nowMs) {
        long left = deadlineMs - nowMs;
        if (left <= 0) return "마감됐어요";
        long minutes = left / 60_000;
        if (minutes < 60) return Math.max(1, minutes) + "분 남았어요";
        long hours = minutes / 60;
        if (hours < 24) return hours + "시간 남았어요";
        return (hours / 24) + "일 남았어요";
    }

    /** 「오늘」「내일」, 그 밖에는 「11/27(금)」. 서울 날짜 기준. */
    static String dayWord(long startMs, long nowMs) {
        LocalDate day = ZonedDateTime.ofInstant(Instant.ofEpochMilli(startMs), SEOUL).toLocalDate();
        LocalDate today = ZonedDateTime.ofInstant(Instant.ofEpochMilli(nowMs), SEOUL).toLocalDate();
        long diff = ChronoUnit.DAYS.between(today, day);
        if (diff == 0) return "오늘";
        if (diff == 1) return "내일";
        return day.getMonthValue() + "/" + day.getDayOfMonth() + "(" + WEEKDAYS[day.getDayOfWeek().getValue() - 1] + ")";
    }

    /** 「19:00」 */
    static String clock(long startMs) {
        ZonedDateTime t = ZonedDateTime.ofInstant(Instant.ofEpochMilli(startMs), SEOUL);
        return String.format(java.util.Locale.KOREA, "%02d:%02d", t.getHour(), t.getMinute());
    }

    /** 1=전반, 2=후반. 그 밖의 구간은 종목마다 달라서 번호로 둔다(앱이 종목을 알게 되면 바꾼다). */
    static String periodName(int number) {
        if (number == 1) return "전반";
        if (number == 2) return "후반";
        return number + "구간";
    }

    /**
     * 지금 구간에서 흐른 시간(ms). 멈춘 시간과 지금 멈춰 있는 시간은 뺀다.
     * 시작을 모르면 -1.
     */
    static long elapsedMs(WidgetModel.Period period, long nowMs) {
        if (period == null || period.startedAtMs < 0) return -1;
        long pausedNow = period.pausedAtMs >= 0 ? Math.max(0, nowMs - period.pausedAtMs) : 0;
        return Math.max(0, nowMs - period.startedAtMs - period.pausedMs - pausedNow);
    }

    /** 「12'」 — 흐른 분(내림). */
    static String minuteMark(long elapsedMs) {
        return (elapsedMs / 60_000) + "'";
    }

    /** 「8분째 휴식」 */
    static String restFor(long restStartedAtMs, long nowMs) {
        if (restStartedAtMs < 0) return "휴식 중";
        return Math.max(0, (nowMs - restStartedAtMs) / 60_000) + "분째 휴식";
    }

    /** 득점 한 줄 — 「김OO 5'」, 이름을 모르면 「득점 5'」, 자책은 「(자책)」. 분을 모르면 시간은 생략. */
    static String scorerLine(WidgetModel.Scorer scorer) {
        String who = scorer.name == null ? "득점" : scorer.name + (scorer.ownGoal ? " (자책)" : "");
        return scorer.minute < 0 ? who : who + " " + scorer.minute + "'";
    }

    /** 서버가 저장한 상태로 알린다 — 정원이 차면 참석이 아니라 대기로 저장된다. */
    static String savedMessage(String saved) {
        if ("GOING".equals(saved)) return "참석으로 저장했어요";
        if ("NOT_GOING".equals(saved)) return "불참으로 저장했어요";
        if ("WAITLISTED".equals(saved)) return "정원이 차서 대기로 등록했어요";
        return "저장하지 못했어요. 앱에서 응답해 주세요";
    }
}
