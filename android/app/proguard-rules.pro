# API responses are read as kotlinx.serialization JsonElements and mapped by hand, and the stored
# settings and sync payload use @Serializable classes whose generated serializers ship their own
# keep rules. Library consumer rules (AndroidX, Compose, OkHttp, kotlinx.serialization) apply
# automatically.
