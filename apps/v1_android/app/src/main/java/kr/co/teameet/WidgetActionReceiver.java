package kr.co.teameet;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** 위젯 안에서 일어나는 일: 참석·불참 버튼, 경기 중 1분 갱신. 앱을 열지 않고 처리한다. */
public final class WidgetActionReceiver extends BroadcastReceiver {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        PendingResult pending = goAsync();
        if (WidgetUpdater.ACTION_REFRESH.equals(action)) {
            WidgetUpdater.refresh(context, pending::finish);
            return;
        }
        if (WidgetRenderer.ACTION_RESPOND.equals(action)) {
            String scheduleId = intent.getStringExtra(WidgetRenderer.EXTRA_SCHEDULE_ID);
            String status = intent.getStringExtra(WidgetRenderer.EXTRA_STATUS);
            Context app = context.getApplicationContext();
            EXECUTOR.execute(() -> {
                try {
                    respond(app, scheduleId, status);
                } finally {
                    pending.finish();
                }
            });
            return;
        }
        pending.finish();
    }

    private static void respond(Context context, String scheduleId, String status) {
        String token = WidgetTokenStore.token(context);
        boolean saved = false;
        if (token != null && scheduleId != null && ("GOING".equals(status) || "NOT_GOING".equals(status))) {
            try {
                saved = WidgetApi.respond(token, scheduleId, status);
            } catch (WidgetApi.Unauthorized e) {
                WidgetTokenStore.clear(context);
            } catch (Exception ignored) {
                // 네트워크가 안 되면 저장 실패로 알린다.
            }
        }
        String message = saved ? ("GOING".equals(status) ? "참석으로 저장했어요" : "불참으로 저장했어요") : "저장하지 못했어요. 앱에서 응답해 주세요";
        new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(context, message, Toast.LENGTH_SHORT).show());
        WidgetUpdater.refresh(context, null);
    }
}
