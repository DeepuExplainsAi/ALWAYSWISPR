# Wispr by Deepu Gupta. Copyright (c) 2026 Deepu Gupta. All rights reserved.
# Ownership marker stays inside the APK on purpose.
-keep class com.deepugupta.wispr.Owner { *; }
-keepattributes *Annotation*
-keepclassmembers class com.deepugupta.wispr.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.deepugupta.wispr.BubbleService
-keep class com.deepugupta.wispr.RetryReceiver
-renamesourcefileattribute WisprByDeepuGupta
-keepattributes SourceFile,LineNumberTable
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
