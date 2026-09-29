// Wispr by Deepu Gupta. Copyright (c) 2026 Deepu Gupta. All rights reserved.
// AGP 9: Kotlin is built in, so there is no "org.jetbrains.kotlin.android" plugin and no kotlinOptions block.
plugins {
    id("com.android.application")
}

// Release signing comes from environment variables (GitHub Secrets). Never commit the keystore.
val ksFile: File? = System.getenv("WISPR_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }

android {
    namespace = "com.deepugupta.wispr"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.deepugupta.wispr"
        minSdk = 26
        targetSdk = 36
        versionCode = (System.getenv("WISPR_VERSION_CODE") ?: "300").toInt()
        versionName = System.getenv("WISPR_VERSION_NAME") ?: "3.0.0"
        buildConfigField("String", "OWNER", "\"Deepu Gupta\"")
        buildConfigField("String", "COPYRIGHT", "\"Copyright (c) 2026 Deepu Gupta. All rights reserved.\"")
    }

    signingConfigs {
        if (ksFile != null) {
            create("release") {
                storeFile = ksFile
                storePassword = System.getenv("WISPR_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("WISPR_KEY_ALIAS")
                keyPassword = System.getenv("WISPR_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (ksFile != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { buildConfig = true }
    packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.17.1")
    implementation("com.squareup.okhttp3:okhttp:5.5.0")
}
