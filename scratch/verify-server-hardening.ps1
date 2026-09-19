$ProgressPreference = 'SilentlyContinue'
$base = 'http://localhost:3000'
$pass = 0
$fail = 0

function Probe($url) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing
    return @{ status = $r.StatusCode; body = $r.Content }
  } catch {
    return @{ status = $_.Exception.Response.StatusCode.value__; body = '' }
  }
}

function Check($name, $condition, $detail) {
  if ($condition) {
    Write-Host "  PASS  $name"
    $script:pass++
  } else {
    Write-Host "  FAIL  $name  -> $detail"
    $script:fail++
  }
}

Write-Host ""
Write-Host "=== Private files must NOT be served ==="
foreach ($p in @('/server.js', '/package.json', '/package-lock.json', '/live-exams-scraper.js',
                 '/CODE-REVIEW-CHECKLIST.md', '/README.md', '/start-server.bat',
                 '/scratch/verify-server-hardening.ps1', '/assets/icons/hamsa-logo-3d.png.bak')) {
  $r = Probe "$base$p"
  Check "blocked $p" ($r.status -eq 404) "got HTTP $($r.status)"
}

Write-Host ""
Write-Host "=== App files MUST still be served ==="
foreach ($p in @('/index.html', '/css/tokens.css', '/css/components.css', '/js/app.js',
                 '/js/ai-client.js', '/js/db.js', '/js/views/quiz-player.js',
                 '/assets/vendor/marked.min.js', '/assets/icons/hamsa-logo.svg',
                 '/assets/icons/hamsa-logo-3d.png', '/robots.txt')) {
  $r = Probe "$base$p"
  Check "served $p" ($r.status -eq 200) "got HTTP $($r.status)"
}

Write-Host ""
Write-Host "=== SPA deep link still falls back to index.html ==="
$r = Probe "$base/dashboard"
Check "SPA fallback /dashboard" (($r.status -eq 200) -and ($r.body -match 'HAMSA VIDYA')) "got HTTP $($r.status)"

Write-Host ""
Write-Host "=== Traversal ==="
$r = Probe "$base/..%2f..%2fWindows%2fwin.ini"
Check "no win.ini leak" ($r.body -notmatch '16-bit app support') "leaked"

Write-Host ""
Write-Host "=== Proxy status endpoint ==="
$r = Probe "$base/api/gemini/status"
Check "status returns JSON" ($r.body -match '"configured"') "got $($r.body)"

Write-Host ""
Write-Host "RESULT: $pass passed, $fail failed"
if ($fail -gt 0) { exit 1 }
