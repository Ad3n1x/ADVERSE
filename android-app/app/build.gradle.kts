plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.ad3n1x.adverse"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ad3n1x.adverse"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }
}
