#!/usr/bin/env bash
# =============================================================================
# ดึงตัวอย่าง "โค้ดอันตรายจริง" (webshell / ATT&CK / payload) มาชั่วคราว
# เพื่อใช้ประเมิน recall ของกฉตรวจจับ — อ่านเป็นข้อความเท่านั้น
#
#   *** ห้าม execute ไฟล์ที่ดึงมา ***  *** ห้ามวางไว้ใน web root ***
#
# - ดึงลง /tmp (นอก web root) ที่ mount แบบ noexec ถ้าทำได้
# - เลือกไฟล์ตาม "ทั้งโฟลเดอร์ / ทั้ง batch ตามชื่อ" (ดู sources.csv)
#   ไม่ได้คัดด้วยผลของ regex กฎ → ตัวอย่างที่หลบกฉได้จะถูกรวมไว้ด้วย
#   ทำให้ recall ที่วัดได้ไม่สวยเกินจริง
# - ลบทิ้งทันทีหลังใช้:  rm -rf "$GK_MAL_DIR"   (สคริปต์พิมพ์คำสั่งให้ตอนจบ)
#
# ต้องรันด้วย user ธรรมดา (ไม่ต้อง sudo, ไม่ต้อง docker) และควรรันบนเครื่อง
# ที่ไม่ใช่ production ถ้าเป็นไปได้
# =============================================================================
set -euo pipefail

DEST="${GK_MAL_DIR:-/tmp/gk-detect-malicious-$$}"
mkdir -p "$DEST"
chmod 700 "$DEST"

clone_sparse () {  # repo sha  patterns...
  local repo="$1" sha="$2"; shift 2
  local dir="$DEST/$(echo "$repo" | tr / _)"
  if [ ! -d "$dir/.git" ]; then
    git clone -q --filter=blob:none --no-checkout "https://github.com/$repo.git" "$dir"
  fi
  ( cd "$dir"
    git sparse-checkout init --no-cone >/dev/null 2>&1 || true
    git sparse-checkout set --no-cone "$@" >/dev/null
    git checkout -q "$sha" )
  echo "$dir"
}

echo ">> ดึงลง: $DEST"

# --- tennc/webshell : webshell PHP ของจริง (เอาทั้งโฟลเดอร์/ทั้ง batch) --------
clone_sparse tennc/webshell 6b17eae4a0bc792f996a38ce32772e4db9c7c799 \
  '/php/phpspy/**' '/php/wso/**' '/php/wso-ng/**' '/php/b374k/**' \
  '/php/twitter/**' '/php/PHPshell/**' \
  '/php/2020.08.20.*.php' '/php/2022-08-26-*.php' >/dev/null

# --- redcanaryco/atomic-red-team : ATT&CK technique (ทั้งไฟล์) ----------------
clone_sparse redcanaryco/atomic-red-team 388942adbd9641f4dfdcf079d7efe9a75ec0ac43 \
  '/atomics/T1027/T1027.yaml' '/atomics/T1059.001/T1059.001.yaml' \
  '/atomics/T1140/T1140.yaml' '/atomics/T1105/T1105.yaml' \
  '/atomics/T1102.002/T1102.002.yaml' '/atomics/T1059.004/T1059.004.yaml' \
  '/atomics/T1110.001/T1110.001.yaml' >/dev/null

# --- swisskyrepo/PayloadsAllTheThings : XSS payload (ทั้งโฟลเดอร์) ------------
clone_sparse swisskyrepo/PayloadsAllTheThings 3ac27901c711bdf3f5b65a7b1d1820a1f65bd09a \
  '/XSS Injection/**' >/dev/null

# --- สร้าง ground_truth ของกอง malicious (expected=detect) --------------------
# rule_id = "family เป้าหมาย" ของกลุ่มนั้น (ดู sources.csv) — ไฟล์ที่กฉจับไม่ได้
# ยังอยู่ในรายการ = นับเป็น miss (recall ตามจริง)
GT="$DEST/ground_truth.malicious.csv"
echo "filename,target_rule,expected,group_id" > "$GT"
emit () { # dir  target_rule  group_id
  local d="$1" rule="$2" gid="$3"
  [ -d "$d" ] || return 0
  find "$d" -type f ! -path '*/.git/*' -print0 \
    | while IFS= read -r -d '' f; do
        printf '%s,%s,detect,%s\n' "${f#$DEST/}" "$rule" "$gid" >> "$GT"
      done
}
T=$DEST/tennc_webshell/php
emit "$T/phpspy"  PHP-SYSTEM-FROM-REQUEST tennc-phpspy
emit "$T/wso"     PHP-EVAL-BASE64         tennc-wso
emit "$T/wso-ng"  PHP-EVAL-BASE64         tennc-wso
emit "$T/b374k"   DYNAMIC-FUNC-CREATE     tennc-b374k
emit "$T/twitter" PHP-EVAL-BASE64         tennc-twitter
emit "$T/PHPshell" PHP-SYSTEM-FROM-REQUEST tennc-phpshell
# one-liner batches อยู่ปนใน php/ — คัดตาม glob เดียวกับ sources.csv
if [ -d "$T" ]; then
  for f in "$T"/2020.08.20.*.php; do [ -e "$f" ] && printf '%s,PHP-EVAL-BASE64,detect,tennc-oneliners-2020\n' "${f#$DEST/}" >> "$GT"; done
  for f in "$T"/2022-08-26-*.php; do [ -e "$f" ] && printf '%s,PHP-SYSTEM-FROM-REQUEST,detect,tennc-oneliners-2022\n' "${f#$DEST/}" >> "$GT"; done
fi
A=$DEST/redcanaryco_atomic-red-team/atomics
emit "$A/T1027"     WIN-ENCODED-PS          atomic-t1027
emit "$A/T1059.001" WIN-ENCODED-PS          atomic-t1059001
emit "$A/T1140"     CERTUTIL-DECODE         atomic-t1140
emit "$A/T1105"     CERTUTIL-DECODE         atomic-t1105
emit "$A/T1102.002" SUSPICIOUS-CURL-PIPE-SH atomic-t1102002
emit "$A/T1059.004" SUSPICIOUS-CURL-PIPE-SH atomic-t1059004
emit "$A/T1110.001" SUSPICIOUS-CURL-PIPE-SH atomic-t1110001
emit "$DEST/swisskyrepo_PayloadsAllTheThings/XSS Injection" JS-EVAL-ATOB patt-xss

echo ">> ground truth (malicious): $GT"
echo ">> จำนวนไฟล์: $(($(wc -l < "$GT") - 1))"
echo
echo "อ่านไฟล์ได้ (อย่า execute) เช่น:  cat \"$DEST/<path>\""
echo "เมื่อใช้เสร็จ ลบทิ้งด้วย:        rm -rf \"$DEST\""
