@echo off
echo Iniciando microsservico Watch Together ML na porta 8000...
cd /d "%~dp0watch-together-ml"
.\.venv\Scripts\uvicorn.exe src.main:app --host 0.0.0.0 --port 8000 --reload
