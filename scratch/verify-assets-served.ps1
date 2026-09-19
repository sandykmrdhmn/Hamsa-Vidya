$ProgressPreference = 'SilentlyContinue'
$base = 'http://localhost:3000'
$bad = 0
$total = 0

Write-Host ""
Write-Host "=== Every stylesheet linked by index.html must serve 200 ==="
$css = (Select-String -Path index.html -Pattern 'rel="stylesheet" href="([^"]+)"' -AllMatches).Matches | ForEach-Object { $_.Groups[1].Value }
foreach ($h in $css) {
  $total++
  try {
    $r = Invoke-WebRequest -Uri "$base/$h" -UseBasicParsing
    if ($r.StatusCode -ne 200) { Write-Host "  FAIL  $h -> HTTP $($r.StatusCode)"; $bad++ }
  } catch { Write-Host "  FAIL  $h -> request error"; $bad++ }
}
Write-Host "  $($css.Count) stylesheets checked"

Write-Host ""
Write-Host "=== Every script linked by index.html must serve 200 ==="
$js = (Select-String -Path index.html -Pattern '<script src="([^"]+)"' -AllMatches).Matches | ForEach-Object { $_.Groups[1].Value }
foreach ($h in $js) {
  $total++
  try {
    $r = Invoke-WebRequest -Uri "$base/$h" -UseBasicParsing
    if ($r.StatusCode -ne 200) { Write-Host "  FAIL  $h -> HTTP $($r.StatusCode)"; $bad++ }
  } catch { Write-Host "  FAIL  $h -> request error"; $bad++ }
}
Write-Host "  $($js.Count) scripts checked"

Write-Host ""
Write-Host "=== Retired originals must NOT be linked or needed ==="
foreach ($h in @('css/components.css', 'css/ai-teacher.css')) {
  if ($css -contains $h) { Write-Host "  FAIL  $h is still linked"; $bad++ }
  else { Write-Host "  OK    $h not linked" }
}

Write-Host ""
if ($bad -eq 0) { Write-Host "RESULT: all $total assets served, 0 failed" }
else { Write-Host "RESULT: $bad of $total assets FAILED" }
if ($bad -gt 0) { exit 1 }
