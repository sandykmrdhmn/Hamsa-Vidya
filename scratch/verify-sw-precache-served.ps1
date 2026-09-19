$ProgressPreference = 'SilentlyContinue'
$base = 'http://localhost:3000'
$bad = 0

Write-Host ""
Write-Host "=== sw.js headers ==="
try {
  $r = Invoke-WebRequest -Uri "$base/sw.js" -UseBasicParsing
  Write-Host "  HTTP $($r.StatusCode)"
  Write-Host "  Content-Type : $($r.Headers['Content-Type'])"
  Write-Host "  Cache-Control: $($r.Headers['Cache-Control'])"
  if ($r.Headers['Cache-Control'] -notmatch 'no-cache') {
    Write-Host "  WARN  sw.js should be no-cache so worker updates are picked up"
    $bad++
  }
} catch {
  Write-Host "  FAIL  sw.js not served"
  $bad++
}

Write-Host ""
Write-Host "=== manifest.webmanifest ==="
try {
  $r = Invoke-WebRequest -Uri "$base/manifest.webmanifest" -UseBasicParsing
  Write-Host "  HTTP $($r.StatusCode)  Content-Type: $($r.Headers['Content-Type'])"
} catch { Write-Host "  FAIL  manifest not served"; $bad++ }

Write-Host ""
Write-Host "=== every SHELL_ASSETS entry must be fetchable (this is what install does) ==="
$assets = node -e "const fs=require('fs'),vm=require('vm');const sw=fs.readFileSync('sw.js','utf8');const s=sw.indexOf('const SHELL_ASSETS = [');const e=sw.indexOf('];',s);const arr=vm.runInNewContext(sw.slice(s+'const SHELL_ASSETS = '.length,e+1));console.log(arr.filter(a=>a!=='./').join('\n'));"

foreach ($a in $assets) {
  if (-not $a) { continue }
  try {
    $r = Invoke-WebRequest -Uri "$base/$a" -UseBasicParsing
    if ($r.StatusCode -ne 200) { Write-Host "  FAIL  $a -> HTTP $($r.StatusCode)"; $bad++ }
  } catch { Write-Host "  FAIL  $a -> request error"; $bad++ }
}
Write-Host "  $($assets.Count) precache assets checked"

Write-Host ""
Write-Host "=== lazily-cached vendor bundles must also be fetchable ==="
foreach ($a in @(
  'assets/vendor/pdf.min.js',
  'assets/vendor/pdf.worker.min.js',
  'assets/vendor/pdf-lib.min.js',
  'assets/vendor/jspdf.umd.min.js',
  'assets/vendor/jspdf.plugin.autotable.min.js',
  'assets/vendor/html2pdf.bundle.min.js'
)) {
  try {
    $r = Invoke-WebRequest -Uri "$base/$a" -UseBasicParsing
    if ($r.StatusCode -ne 200) { Write-Host "  FAIL  $a -> HTTP $($r.StatusCode)"; $bad++ }
    else {
      $cc = $r.Headers['Cache-Control']
      if ($cc -notmatch 'immutable') { Write-Host "  WARN  $a Cache-Control=$cc (expected immutable)"; $bad++ }
    }
  } catch { Write-Host "  FAIL  $a -> request error"; $bad++ }
}
Write-Host "  6 vendor bundles checked"

Write-Host ""
Write-Host "=== /api/ must never be cacheable ==="
try {
  $r = Invoke-WebRequest -Uri "$base/api/gemini/status" -UseBasicParsing
  $cc = $r.Headers['Cache-Control']
  if ($cc -match 'no-store') { Write-Host "  OK    /api/gemini/status -> Cache-Control: $cc" }
  else { Write-Host "  FAIL  /api/gemini/status should be no-store, got: $cc"; $bad++ }
} catch { Write-Host "  FAIL  status endpoint unreachable"; $bad++ }

Write-Host ""
if ($bad -eq 0) { Write-Host "RESULT: service worker assets all serve correctly, 0 failed" }
else { Write-Host "RESULT: $bad problem(s) found" }
if ($bad -gt 0) { exit 1 }
