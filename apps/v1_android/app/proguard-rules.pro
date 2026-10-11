-keepattributes *Annotation*

# Kakao SDK official rules: Gson reflects over the model fields and type adapters.
-keep class com.kakao.sdk.**.model.* { <fields>; }
-keep class * extends com.google.gson.TypeAdapter

# OkHttp (pulled in by the Kakao SDK) probes these optional TLS providers at runtime; they are not on the classpath.
-dontwarn org.bouncycastle.jsse.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
