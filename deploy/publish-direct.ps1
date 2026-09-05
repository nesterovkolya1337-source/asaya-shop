param(
  [string]$Endpoint = "https://asaya.ru/_asaya_deploy",
  [string]$KeyPath = "$env:USERPROFILE/.ssh/asaya_production_ed25519"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("asaya-deploy-" + [guid]::NewGuid())
$bundlePath = Join-Path $temporaryDirectory "release.bundle"

New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
Push-Location $repoRoot
try {
  $headRevision = (git rev-parse HEAD).Trim()
  $status = Invoke-RestMethod -Uri "$Endpoint/status" -Method Get
  $serverRevision = $status.revision

  if ($serverRevision -eq $headRevision) {
    Write-Output "ASAYA is already deployed at $headRevision"
    exit 0
  }
  if (-not $serverRevision) {
    throw "The production revision is unavailable."
  }

  git merge-base --is-ancestor $serverRevision $headRevision
  if ($LASTEXITCODE -ne 0) {
    throw "Production and local history have diverged."
  }

  git bundle create $bundlePath refs/heads/main "^$serverRevision"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the deployment bundle."
  }

  & ssh-keygen -Y sign -f $KeyPath -n asaya-deploy $bundlePath
  if ($LASTEXITCODE -ne 0) {
    throw "Could not sign the deployment bundle."
  }

  $signature = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$bundlePath.sig"))
  $response = & curl.exe --fail-with-body --show-error --silent --max-time 900 `
    -X POST `
    -H "Content-Type: application/octet-stream" `
    -H "X-Asaya-Signature: $signature" `
    --data-binary "@$bundlePath" `
    "$Endpoint/deploy"
  if ($LASTEXITCODE -ne 0) {
    throw "The production server rejected the deployment."
  }
  Write-Output $response
}
finally {
  Pop-Location
  Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
