-keepattributes *Annotation*

# Kakao's lifecycle observer calls Retrofit before login. R8 full mode must retain
# generic return types and their endpoints, including retrofit2.Call itself.
# https://developers.kakao.com/docs/ko/android/getting-started#project-settings-proguard
-keepattributes Signature,InnerClasses,EnclosingMethod
-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface <1>
-keep,allowobfuscation interface retrofit2.Call
-keep,allowobfuscation class retrofit2.Response
-keep,allowobfuscation class kotlin.coroutines.Continuation
-if interface * { @retrofit2.http.* public *** *(...); }
-keep,allowoptimization,allowshrinking,allowobfuscation class <3>

# Kakao SDK official rules: Gson reflects over the model fields and type adapters.
-keep class com.kakao.sdk.**.model.* { <fields>; }
-keep class * extends com.google.gson.TypeAdapter

# OkHttp (pulled in by the Kakao SDK) probes these optional TLS providers at runtime; they are not on the classpath.
-dontwarn org.bouncycastle.jsse.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
