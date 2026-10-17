Set-Location (Join-Path $PSScriptRoot "..")

docker build -t pm-app .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker rm -f pm-app 2>&1 | Out-Null

$envArgs = @()
if (Test-Path .env) { $envArgs = @("--env-file", ".env") }

docker run -d --name pm-app -p 8000:8000 -v pm-data:/app/backend/data @envArgs pm-app
Write-Host "Running at http://localhost:8000"
