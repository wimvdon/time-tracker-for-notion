# Gson reads the sync payload (data.models.SyncPayload and the classes it holds) by reflection,
# so keep the model classes with their field names and generic signatures.
# Library consumer rules (AndroidX, Compose, OkHttp, Gson, kotlinx.serialization) apply automatically.
-keep class com.impca201.notiontimetracker.data.models.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
