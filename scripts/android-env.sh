#!/bin/sh
# Android 빌드 환경 (2026-10-25 "안드로이드 시작해도 될까?"): Java 17(Homebrew openjdk@17, 비밀번호 없이 설치) · SDK · NDK — 그 뒤의 인자를 그대로 실행한다
# 예: scripts/android-env.sh cargo tauri android dev
if [ -z "$JAVA_HOME" ]; then JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || echo /opt/homebrew/opt/openjdk@17)"; export JAVA_HOME; fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
if [ -z "$NDK_HOME" ] && [ -d "$ANDROID_HOME/ndk" ]; then
  NDK_HOME="$ANDROID_HOME/ndk/$(ls "$ANDROID_HOME/ndk" | sort -V | tail -1)"; export NDK_HOME
fi
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
exec "$@"
