package kr.co.teameet;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.os.Bundle;

/** 중간 크기(4×2) 위젯 — 경기 중이면 경기, 그다음 응답 대기, 일정 순. */
public final class TeameetWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        BroadcastReceiver.PendingResult pending = goAsync();
        WidgetUpdater.refresh(context, pending::finish);
    }

    @Override public void onEnabled(Context context) {
        BroadcastReceiver.PendingResult pending = goAsync();
        WidgetUpdater.refresh(context, pending::finish);
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        BroadcastReceiver.PendingResult pending = goAsync();
        WidgetUpdater.renderCached(context, pending::finish);
    }
}
