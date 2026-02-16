# Keep WebView classes and JavaScript interfaces from aggressive shrinking.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep AndroidX WebKit support classes.
-keep class androidx.webkit.** { *; }