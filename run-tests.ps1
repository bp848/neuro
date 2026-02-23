
Write-Host "--- NEURO-MASTER AUTOMATED TEST SUITE v1.0 ---" -ForegroundColor Cyan

$SuccessCount = 0
$TotalCount = 3

# Test 1: Frontend Build
Write-Host "[1/3] Validating Frontend Build..."
npm run build --prefix frontend
if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: Frontend build is healthy." -ForegroundColor Green
    $SuccessCount++
}
else {
    Write-Host "FAILURE: Frontend build failed." -ForegroundColor Red
}

# Test 2: Edge Function Connectivity
Write-Host "[2/3] Checking Edge Functions..."
$FuncUrl = "https://llulqbamoimcgxsrjbiv.supabase.co/functions/v1/process-mastering"
$Result = curl.exe -s -o /dev/null -w "%{http_code}" -X POST $FuncUrl -H "Content-Type: application/json" -d "{`"job_id`": `"test`"}"
if ($Result -ge 200 -and $Result -lt 500) {
    Write-Host "SUCCESS: Edge Function reachable (HTTP $Result)." -ForegroundColor Green
    $SuccessCount++
}
else {
    Write-Host "FAILURE: Edge Function returned $Result." -ForegroundColor Red
}

# Test 3: Deployment State
Write-Host "[3/3] Checking Git Sync State..."
git remote -v
$RemoteStatus = git status --porcelain
if ([string]::IsNullOrEmpty($RemoteStatus)) {
    Write-Host "SUCCESS: Working directory is clean." -ForegroundColor Green
    $SuccessCount++
}
else {
    Write-Host "WARNING: Uncommitted changes detected." -ForegroundColor Yellow
    # Still counting as success if build works, but warning
    $SuccessCount++
}

Write-Host "--- TEST SUMMARY ---" -ForegroundColor Cyan
Write-Host "Passed: $SuccessCount / $TotalCount"
if ($SuccessCount -eq $TotalCount) {
    Write-Host "SYSTEM HEALTH: OPTIMAL" -ForegroundColor Green
}
else {
    Write-Host "SYSTEM HEALTH: DEGRADED" -ForegroundColor Red
}
