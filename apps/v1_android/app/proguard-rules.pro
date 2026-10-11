-keepattributes *Annotation*

# Kakao SDK official rules: Gson reflects over the model fields and type adapters.
-keep class com.kakao.sdk.**.model.* { <fields>; }
-keep class * extends com.google.gson.TypeAdapter
