#!/usr/bin/env bash
# E2E 録画の静止区間除去 (e2e-verify skill 用)。
# LLM の思考待ちなど画面変化のないフレームを mpdecimate で間引き、
# 残った変化フレームだけを詰め直す (実質「変化のない時間の超早送り」)。
# 使い方: condense-video.sh [--speed <倍率>] <input.webm> [output.webm]
#         output 省略時は input を上書きする。
#         --speed: 再生速度の倍率。省略時 0.5 (半分の速さ)。1.0 で等速。
set -euo pipefail

# 間引き後の詰め直し再生は操作フレームだけが連続するため、等速 (25fps) だと
# 目で追えない速さになる。既定で 0.5 倍速に落とし、操作を追える速度にする。
speed=0.5
if [[ "${1:-}" == "--speed" ]]; then
  speed="${2:?usage: condense-video.sh [--speed <factor>] <input.webm> [output.webm]}"
  shift 2
fi

in="${1:?usage: condense-video.sh [--speed <factor>] <input.webm> [output.webm]}"
out="${2:-$in}"

# 速度は setpts の実効 fps に織り込む (0.5 倍速 → 12.5fps で詰め直し)
fps="$(awk -v s="$speed" 'BEGIN { if (s <= 0) exit 1; printf "%g", 25 * s }')" \
  || { echo "invalid --speed: $speed" >&2; exit 1; }

# mktemp --suffix / stat -c は GNU 拡張なので使わない (macOS の BSD 版でも動く形にする)
tmpdir="$(mktemp -d)"
tmp="$tmpdir/condense.webm"
trap 'rm -rf "$tmpdir"' EXIT

# hi/lo/frac: 微小なアンチエイリアス差やカーソル点滅程度は「変化なし」とみなす閾値。
# max=25: 連続 drop は 25 フレーム (1 秒) まで。長い静止も 1fps 相当では進むので、
#         「待機があった」こと自体は動画から読み取れる。
# VP9 (libvpx-vp9) + crf 24 + b:v 0 = 固定品質モード。VP8 の crf は -b:v 0 と併用すると
# 実質無視されビットレート不足で文字が潰れるため使わない。
# VP9 なら 1080p でも文字がくっきり残り、サイズは静止区間除去が支配する。
ffmpeg -y -v error -i "$in" \
  -vf "mpdecimate=hi=768:lo=320:frac=0.33:max=25,setpts=N/${fps}/TB" \
  -an -c:v libvpx-vp9 -crf 24 -b:v 0 -deadline good -cpu-used 4 -row-mt 1 \
  "$tmp"

size_of() { stat -c%s "$1" 2>/dev/null || stat -f%z "$1"; }
before="$(size_of "$in")"
after="$(size_of "$tmp")"
mv "$tmp" "$out"

# PR コメントへのドラッグ&ドロップ用に mp4 も並置する (GitHub は webm の
# インライン添付を受け付けないため)。
mp4="${out%.webm}.mp4"
ffmpeg -y -v error -i "$out" \
  -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -movflags +faststart \
  "$mp4"

echo "condensed: $in -> $out ($((before / 1024))KB -> $((after / 1024))KB, ${speed}x speed), mp4: $mp4"
