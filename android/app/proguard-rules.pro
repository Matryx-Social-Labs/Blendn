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

# Expo's annotation types. Expo Modules turn every JS object argument into a
# `Record` by reading the `@Field` annotation on each property at runtime
# (RecordTypeConverter; JSTypeConverterHelper on the way back). No class in
# the app implements `Field` -- the runtime hands back a proxy -- so R8's
# optimiser concluded a `Field` value could only ever be null and compiled
# the per-field loop, `descriptor.fieldAnnotation.key`, to `throw null`:
#
#   Call to function 'ExpoSplashScreen.setOptions' has been rejected.
#   → The 1st argument cannot be cast to type ...SplashScreenOptions
#   → java.lang.NullPointerException
#
# That call runs at import time in app/_layout.tsx, so the release build died
# before its first screen, showing only expo-router's "Cannot read property
# 'ErrorBoundary' of undefined". expo/expo#28010 answered it with -dontoptimize
# for the whole app; keeping the annotation types is enough.
-keep @interface expo.modules.** { *; }
