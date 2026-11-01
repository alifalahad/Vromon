#!/bin/bash
# Input to the USB test phone, sent only when a Vromon app is in front and no call is
# ringing or active. The test phone is the owner's own phone: a tap that lands on a call
# screen can answer or end a real call. Take a screenshot and look before every input.
#
#   scripts/dev/phone.sh shot NAME                   # PNG (and a small copy, NAMEs.png) in $PHONE_SHOTS
#   scripts/dev/phone.sh tap X Y                     # screen pixels (the phone is 1080 x 2400)
#   scripts/dev/phone.sh swipe X1 Y1 X2 Y2 [MS]
#   scripts/dev/phone.sh text STR                    # whole words: the keyboard may rewrite them
#   scripts/dev/phone.sh chars STR                   # one character at a time, checking before each
#                                                    # (letters, digits, spaces, @ . + _ -; others need escaping)
#   scripts/dev/phone.sh key CODE...                 # Android key events (4 = Back)
#   scripts/dev/phone.sh open URL                    # a link, into the dev app only
#
# Stops with exit 3 when something else is in front: an Android autofill popup over a
# sign-in field, for example. Look at the screen before going on.
SHOTS=${PHONE_SHOTS:-${TMPDIR:-/tmp}/vromon-phone}

safe() {  # $1 = launcher: the home screen is fine too (opening an app from it)
  local focus calls
  focus=$(adb shell dumpsys window | grep -m1 mCurrentFocus)
  calls=$(adb shell dumpsys telephony.registry | grep -o 'mCallState=[0-9]*' | grep -v 'mCallState=0$')
  if [[ -n "$calls" ]]; then echo "STOP: a call is ringing or active ($calls)"; exit 4; fi
  # The notification shade over the app doesn't always take the focus (realme, 2026-10-30):
  # swipes meant for the app then pulled it open
  if adb shell dumpsys window windows | grep -A40 "Window{.*NotificationShade}" | grep -m1 -q "isVisible=true"; then
    echo "STOP: the notification shade is open"; exit 3
  fi
  if [[ "$focus" == *com.vromon.app.dev* || "$focus" == *com.vromon.app.preview* ]]; then return; fi
  if [[ "$1" == launcher && "$focus" == *launcher* ]]; then return; fi
  echo "STOP: Vromon is not in front ($focus)"; exit 3
}

cmd=$1; shift
case "$cmd" in
  tap) safe; adb shell input tap "$1" "$2" ;;
  swipe) safe; adb shell input swipe "$1" "$2" "$3" "$4" "${5:-300}" ;;
  text) safe; adb shell input text "$1" ;;
  chars) s="$1"; for ((i = 0; i < ${#s}; i++)); do c="${s:$i:1}"; [[ "$c" == " " ]] && c="%s"; safe; adb shell input text "$c"; done ;;
  key) safe; adb shell input keyevent "$@" ;;
  # -p: the friends' preview app answers the same links, and Android would ask which app to use
  open) safe launcher; adb shell am start -a android.intent.action.VIEW -d "$1" -p com.vromon.app.dev >/dev/null && echo opened ;;
  # On the realme, screencap can return an old frame until something reads the screen's
  # views; a view dump first makes the picture current (2026-10-29, friends-chat step 6)
  shot) mkdir -p "$SHOTS" && adb shell uiautomator dump /sdcard/.vromon-ui.xml >/dev/null 2>&1; sleep 0.3
        adb exec-out screencap -p > "$SHOTS/$1.png" && sips -Z 900 "$SHOTS/$1.png" --out "$SHOTS/${1}s.png" >/dev/null && echo "$SHOTS/$1.png" ;;
  *) sed -n '2,16p' "$0"; exit 2 ;;
esac
