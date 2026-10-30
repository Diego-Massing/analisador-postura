@echo off
REM ------------------------------------------------------------------
REM iniciar.bat - Inicia o Analisador Ergonomico de Postura no Windows
REM Na primeira execucao cria o ambiente virtual e instala as dependencias.
REM O ambiente virtual fica em %LOCALAPPDATA%\venvs (fora da pasta do projeto)
REM para nao ser sincronizado por OneDrive/Google Drive (ele tem cerca de 1 GB).
REM ------------------------------------------------------------------
chcp 65001 > nul
cd /d "%~dp0"
set "VENV=%LOCALAPPDATA%\venvs\analisador-postura"

REM Cria o ambiente virtual caso ainda nao exista
if not exist "%VENV%\Scripts\python.exe" (
    REM Procura o Python 3.12: pasta padrao de instalacao, lancador "py" e por fim o comando "python"
    set "PYTHON="
    if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PYTHON="%LOCALAPPDATA%\Programs\Python\Python312\python.exe""
    if not defined PYTHON py -3.12 --version > nul 2>&1 && set "PYTHON=py -3.12"
    if not defined PYTHON python --version > nul 2>&1 && set "PYTHON=python"
    if not defined PYTHON (
        echo Python 3.12 nao encontrado. Instale com: winget install Python.Python.3.12
        pause
        exit /b 1
    )
    echo Criando ambiente virtual em %VENV% ...
    call %%PYTHON%% -m venv "%VENV%"
    echo Instalando dependencias, isso pode levar alguns minutos...
    "%VENV%\Scripts\python.exe" -m pip install --upgrade pip
    "%VENV%\Scripts\python.exe" -m pip install -r requirements.txt
)

REM Abre o navegador so quando o servidor estiver pronto: um PowerShell em segundo plano
REM consulta /api/saude a cada 1 segundo (por ate 2 minutos) e, quando responder, abre a pagina.
REM Usa 127.0.0.1 e nao "localhost": no Windows "localhost" tenta primeiro o IPv6 (::1),
REM onde o servidor nao escuta, e a consulta esgotaria o tempo.
echo Iniciando o servidor... o navegador abre sozinho quando estiver pronto.
start "" /b powershell -NoProfile -Command "for ($i = 0; $i -lt 120; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8000/api/saude | Out-Null; Start-Process 'http://localhost:8000'; break } catch { Start-Sleep -Seconds 1 } }"

REM Sobe o servidor (fica rodando nesta janela)
cd backend
"%VENV%\Scripts\python.exe" -m uvicorn app:app --host 0.0.0.0 --port 8000
pause
