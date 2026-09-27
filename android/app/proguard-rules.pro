# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# Expo Modules convert every JS object argument into a `Record` through
# kotlin-reflect (`RecordTypeConverter`: memberProperties, then
# `property.javaField!!`). R8's optimiser rewrites kotlin-reflect's own
# internals, `javaField` comes back null, and the call is rejected:
#
#   Call to function 'ExpoSplashScreen.setOptions' has been rejected.
#   → The 1st argument cannot be cast to type ...SplashScreenOptions
#   → java.lang.NullPointerException
#
# That one runs at import time in app/_layout.tsx, so the release build died
# before its first screen. Same failure as expo/expo#28010, whose answer was
# `-dontoptimize` for the whole app. This keeps the optimiser off kotlin-reflect
# only; it is still shrunk and obfuscated, and everything else is optimised.
-keep,allowshrinking,allowobfuscation class kotlin.reflect.jvm.internal.** { *; }
-keep,allowshrinking,allowobfuscation class kotlin.jvm.internal.** { *; }
