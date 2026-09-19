$ProgressPreference = 'SilentlyContinue'
$base = 'http://localhost:3100'

function PostJson($path, $body) {
  try {
    $r = Invoke-WebRequest -Uri "$base$path" -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing
    return @{ status = $r.StatusCode; body = $r.Content; headers = $r.Headers }
  } catch {
    $resp = $_.Exception.Response
    $b = ''
    if ($resp) {
      try { $sr = New-Object IO.StreamReader($resp.GetResponseStream()); $b = $sr.ReadToEnd() } catch {}
      return @{ status = $resp.StatusCode.value__; body = $b; headers = $resp.Headers }
    }
    return @{ status = 0; body = $_.Exception.Message; headers = $null }
  }
}

Write-Host ""
Write-Host "=== status reports configured=true when server key is set ==="
$s = (Invoke-WebRequest -Uri "$base/api/gemini/status" -UseBasicParsing).Content
Write-Host "  $s"
if ($s -match '"configured":true') { Write-Host "  PASS" } else { Write-Host "  FAIL" }

Write-Host ""
Write-Host "=== invalid model identifier rejected (400) ==="
$r = PostJson "/api/gemini/..%2f..%2fbadpath" '{"contents":[]}'
Write-Host "  HTTP $($r.status)  $($r.body)"

Write-Host ""
Write-Host "=== malformed JSON rejected (400) ==="
$r = PostJson "/api/gemini/gemini-2.5-flash" 'not-json-at-all'
Write-Host "  HTTP $($r.status)  $($r.body)"

Write-Host ""
Write-Host "=== oversized body rejected (413) ==="
$big = '{"contents":"' + ('x' * (2.5MB)) + '"}'
$r = PostJson "/api/gemini/gemini-2.5-flash" $big
Write-Host "  HTTP $($r.status)  $($r.body)"

Write-Host ""
Write-Host "=== rate limit fires after 20 requests in 60s ==="
$codes = @{}
for ($i = 1; $i -le 24; $i++) {
  $r = PostJson "/api/gemini/gemini-2.5-flash" '{"contents":[{"parts":[{"text":"hi"}]}]}'
  $codes["$($r.status)"] = $codes["$($r.status)"] + 1
  if ($r.status -eq 429) { $first429 = $i; break }
}
Write-Host "  status counts: $($codes | ConvertTo-Json -Compress)"
if ($first429) { Write-Host "  First 429 at request #$first429 (expected #21)" } else { Write-Host "  No 429 seen" }
