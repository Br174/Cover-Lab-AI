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
        versionCode = 7
        versionName = "0.7.0"

        // La release stabile non viene collegata automaticamente alla LAB.
        buildConfigField("String", "COVER_LAB_API_BASE", "\"https://DA_CONFIGURARE.workers.dev\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".lab"
            versionNameSuffix = "-lab"
            // Solo l'APK LAB usa l'anteprima Cloudflare della branch di collaudo.
            buildConfigField(
                "String",
                "COVER_LAB_API_BASE",
                "\"https://lab-uab-onboarding-01-cover-lab-ai.brunoverlezza.workers.dev\""
            )
        }
        release {
            isMinifyEnabled = false
        }
    }
}
