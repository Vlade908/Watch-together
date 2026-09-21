# Runner script for Watch Together ML microservice
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$scriptDir\watch-together-ml"

Write-Host "Iniciando microsservico Watch Together ML (FastAPI + SVD) na porta 8000..." -ForegroundColor Cyan
& ".\.venv\Scripts\uvicorn.exe" src.main:app --host 0.0.0.0 --port 8000 --reload
