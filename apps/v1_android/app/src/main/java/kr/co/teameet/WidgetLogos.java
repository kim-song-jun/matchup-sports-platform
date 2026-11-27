package kr.co.teameet;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Shader;
import java.io.File;
import java.io.FileOutputStream;
import java.security.MessageDigest;

/** 팀 마크를 받아 원형으로 잘라 캐시 폴더에 둔다. 위젯은 그림을 직접 못 받으니 갱신하는 동안 미리 받아 둔다. */
final class WidgetLogos {
    private static final int SIZE = 96;

    private WidgetLogos() {}

    /** 이미 받아 둔 마크만(네트워크 없음). 없으면 null. */
    static Bitmap cached(Context context, String url) {
        if (url == null) return null;
        try {
            File file = new File(dir(context), name(url));
            return file.isFile() ? BitmapFactory.decodeFile(file.getAbsolutePath()) : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    /** 실패하면 null — 그 자리는 그림 없이 그린다. */
    static Bitmap load(Context context, String url) {
        if (url == null) return null;
        try {
            File file = new File(dir(context), name(url));
            if (!file.isFile()) {
                byte[] bytes = WidgetApi.logo(url);
                Bitmap decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (decoded == null) return null;
                Bitmap circle = circle(decoded);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    circle.compress(Bitmap.CompressFormat.PNG, 100, out);
                }
                return circle;
            }
            return BitmapFactory.decodeFile(file.getAbsolutePath());
        } catch (Exception ignored) {
            return null;
        }
    }

    private static Bitmap circle(Bitmap source) {
        int side = Math.min(source.getWidth(), source.getHeight());
        Bitmap square = Bitmap.createBitmap(source, (source.getWidth() - side) / 2, (source.getHeight() - side) / 2, side, side);
        Bitmap scaled = Bitmap.createScaledBitmap(square, SIZE, SIZE, true);
        Bitmap output = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        new Canvas(output).drawCircle(SIZE / 2f, SIZE / 2f, SIZE / 2f, paint);
        return output;
    }

    private static File dir(Context context) {
        File dir = new File(context.getCacheDir(), "widget-logos");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    private static String name(String url) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-1").digest(url.getBytes("UTF-8"));
        StringBuilder sb = new StringBuilder();
        for (byte b : hash) sb.append(String.format("%02x", b));
        return sb.append(".png").toString();
    }
}
