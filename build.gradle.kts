// Wispr by Deepu Gupta. Copyright (c) 2026 Deepu Gupta. All rights reserved.
// Toolchain (checked 29 Sep 2026): AGP 9.4.1 + Gradle 9.6.0 + JDK 21, Kotlin 2.4.10 (built-in Kotlin of AGP 9).
buildscript {
    repositories { google(); mavenCentral() }
    dependencies {
        // AGP 9 compiles Kotlin itself ("built-in Kotlin"). This line only lifts it to the newest stable Kotlin.
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.10")
    }
}

plugins {
    id("com.android.application") version "9.4.1" apply false
}
