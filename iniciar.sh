#!/usr/bin/env bash
# ------------------------------------------------------------------
# iniciar.sh - Inicia o Analisador Ergonômico de Postura (Alinha) no Linux
# (no Windows use o iniciar.bat)
# Na primeira execução cria o ambiente virtual e instala as dependências.
# O ambiente virtual fica em ~/.venvs/analisador-postura, fora da pasta do
# projeto, porque ocupa cerca de 1 GB.
# Uso: bash iniciar.sh   (ou ./iniciar.sh depois de "chmod +x iniciar.sh")
# ------------------------------------------------------------------

# Entra na pasta onde o script está, mesmo que ele seja chamado de outro lugar
cd "$(dirname "$0")" || exit 1

VENV="$HOME/.venvs/analisador-postura"
PY="$VENV/bin/python"

# Cria o ambiente virtual caso ainda não exista
if [ ! -x "$PY" ]; then
    # Procura o Python: primeiro a versão 3.12 (a usada no projeto), depois python3
    PYTHON=""
    for candidato in python3.12 python3; do
        if command -v "$candidato" > /dev/null 2>&1; then
            PYTHON="$candidato"
            break
        fi
    done
    if [ -z "$PYTHON" ]; then
        echo "Python não encontrado. Instale com: sudo apt install python3 python3-venv python3-pip"
        exit 1
    fi
    echo "Usando $($PYTHON --version 2>&1) ($PYTHON)"
    echo "Criando ambiente virtual em $VENV ..."
    mkdir -p "$(dirname "$VENV")"
    if ! "$PYTHON" -m venv "$VENV"; then
        echo "Não foi possível criar o ambiente virtual."
        echo "No Ubuntu/Debian, instale o pacote: sudo apt install python3-venv"
        rm -rf "$VENV"
        exit 1
    fi
    echo "Instalando dependências, isso pode levar alguns minutos..."
    "$PY" -m pip install --upgrade pip
    if ! "$PY" -m pip install -r requirements.txt; then
        # Apaga o ambiente incompleto para a próxima execução tentar de novo do zero
        echo "A instalação falhou. Verifique a internet e rode o script novamente."
        rm -rf "$VENV"
        exit 1
    fi
fi

# Abre o navegador só quando o servidor estiver pronto: em segundo plano, consulta
# /api/saude a cada 1 segundo (por até 2 minutos) usando o próprio Python do ambiente.
# Usa 127.0.0.1 e não "localhost", porque "localhost" pode tentar primeiro o IPv6 (::1),
# onde o servidor não escuta.
(
    for _ in $(seq 1 120); do
        if "$PY" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/saude', timeout=2)" 2> /dev/null; then
            xdg-open "http://localhost:8000" > /dev/null 2>&1
            exit 0
        fi
        sleep 1
    done
) &
ESPERA=$!

# Se o usuário fechar com Ctrl+C antes de o servidor ficar pronto, encerra também a espera
trap 'kill $ESPERA 2> /dev/null' EXIT

echo "Iniciando o servidor... o navegador abre sozinho quando estiver pronto."
echo "Para encerrar, aperte Ctrl+C."
cd backend || exit 1
"$PY" -m uvicorn app:app --host 0.0.0.0 --port 8000
