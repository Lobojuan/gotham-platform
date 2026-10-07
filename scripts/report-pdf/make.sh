#!/bin/bash
# New PDF edition of the Ghana Investment Report: branded cover + the report page with header and footer, compressed.
#   bash scripts/report-pdf/make.sh http://127.0.0.1:4100/ghana-investment-report
# Needs python3 with playwright (+ Pillow), qpdf and ghostscript. Set CHROMIUM to a Chromium binary if Playwright has none.
# Then update "edition" in apps/crm/report.json and replace the file in apps/crm/report-files/.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd); T=$(mktemp -d)
python3 "$ROOT/scripts/report-pdf/pdf_cover.py" "$ROOT" "$T/cover.pdf"
python3 "$ROOT/scripts/report-pdf/pdf.py" "$1" "$T/body.pdf" "$ROOT/apps/site/public/img/brand/icon-64.png"
qpdf --empty --pages "$T/cover.pdf" "$T/body.pdf" -- "$T/full.pdf"
gs -q -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dCompatibilityLevel=1.6 -dPDFSETTINGS=/ebook -dColorImageResolution=170 -dDownsampleColorImages=true -sOutputFile="$T/report.pdf" "$T/full.pdf"
echo "$T/report.pdf"
