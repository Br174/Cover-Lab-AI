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
        versionCode = 10
        versionName = "0.8.0"

        buildConfigField("String", "COVER_LAB_API_BASE", "\"https://DA_CONFIGURARE.workers.dev\"")
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        debug {
            // Ogni LAB appartiene a una famiglia Android separata e puo convivere
            // con le LAB precedenti senza sovrascriverle o contaminarne i dati.
            applicationIdSuffix = ".lab080"
            versionNameSuffix = "-lab"
            buildConfigField(
                "String",
                "COVER_LAB_API_BASE",
                "\"https://lab-archive-diagnostics-080-cover-lab-ai.brunoverlezza.workers.dev\""
            )
        }
        release { isMinifyEnabled = false }
    }
}
