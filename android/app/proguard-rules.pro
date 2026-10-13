# API responses are read as kotlinx.serialization JsonElements and mapped by hand, and the stored
# settings and sync payload use @Serializable classes whose generated serializers ship their own
# keep rules. Library consumer rules (AndroidX, Compose, OkHttp, kotlinx.serialization) apply
# automatically.

# Tink (used by security-crypto) refers to Error Prone's compile-time annotations, which are not
# on the runtime classpath now that nothing else brings them in.
-dontwarn com.google.errorprone.annotations.**
