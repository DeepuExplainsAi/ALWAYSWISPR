// Wispr by Deepu Gupta. Copyright (c) 2026 Deepu Gupta. All rights reserved.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing comes from environment variables (GitHub Secrets). Never commit the keystore.
val ksFile: File? = System.getenv("WISPR_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }

android {
    namespace = "com.deepugupta.wispr"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.deepugupta.wispr"
        minSdk = 26
        targetSdk = 34
        versionCode = (System.getenv("WISPR_VERSION_CODE") ?: "310").toInt()
        versionName = System.getenv("WISPR_VERSION_NAME") ?: "3.1.0"
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
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
    packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
