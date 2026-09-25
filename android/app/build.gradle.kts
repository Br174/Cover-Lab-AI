plugins {
    id("com.android.application")
}

android {
    namespace = "it.coverlab.ai"
    compileSdk = 36

    defaultConfig {
        applicationId = "it.coverlab.ai"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "COVER_LAB_API_BASE", "\"https://DA_CONFIGURARE.workers.dev\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}
