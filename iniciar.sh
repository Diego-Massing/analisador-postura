#!/usr/bin/env bash
# ------------------------------------------------------------------
# iniciar.sh - Inicia o Analisador Ergonômico de Postura (Alinha)
# Funciona no Linux, no macOS e no Windows pelo Git Bash.
# Na primeira execução cria o ambiente virtual e instala as dependências.
# O ambiente virtual fica fora da pasta do projeto (cerca de 1 GB) para não
# ser sincronizado por OneDrive/Google Drive:
#   - Windows (Git Bash): %LOCALAPPDATA%\venvs\analisador-postura (o mesmo do iniciar.bat)
#   - Linux/macOS:        ~/.venvs/analisador-postura
# Uso: bash iniciar.sh   (ou ./iniciar.sh depois de "chmod +x iniciar.sh")
# ------------------------------------------------------------------

# Entra na pasta onde o script está, mesmo que ele seja chamado de outro lugar
cd "$(dirname "$0")" || exit 1

# Define onde fica o ambiente virtual
if [ -n "$LOCALAPPDATA" ]; then
    VENV="$LOCALAPPDATA/venvs/analisador-postura"
else
    VENV="$HOME/.venvs/analisador-postura"
fi

# Caminho do Python dentro do ambiente virtual (bin/ no Linux/macOS, Scripts/ no Windows)
python_do_venv() {
    if [ -x "$VENV/bin/python" ]; then
        echo "$VENV/bin/python"
    elif [ -x "$VENV/Scripts/python.exe" ]; then
        echo "$VENV/Scripts/python.exe"
    fi
}

PY="$(python_do_venv)"

# Cria o ambiente virtual caso ainda não exista
if [ -z "$PY" ]; then
    # Procura o Python: primeiro a versão 3.12 (a usada no projeto), depois o lançador
    # "py" do Windows e, por fim, os comandos genéricos python3/python
    PYTHON=""
    for candidato in python3.12 "py -3.12" python3 python; do
        if $candidato --version > /dev/null 2>&1; then
            PYTHON="$candidato"
            break
        fi
    done
    if [ -z "$PYTHON" ]; then
        echo "Python não encontrado. Instale o Python 3.12:"
        echo "  Ubuntu/Debian: sudo apt install python3 python3-venv python3-pip"
        echo "  macOS:         brew install python@3.12"
        echo "  Windows:       winget install Python.Python.3.12"
        exit 1
    fi
    echo "Usando $($PYTHON --version 2>&1) ($PYTHON)"
    echo "Criando ambiente virtual em $VENV ..."
    mkdir -p "$(dirname "$VENV")"
    if ! $PYTHON -m venv "$VENV"; then
        echo "Não foi possível criar o ambiente virtual."
        echo "No Ubuntu/Debian, instale o pacote: sudo apt install python3-venv"
        exit 1
    fi
    PY="$(python_do_venv)"
    echo "Instalando dependências, isso pode levar alguns minutos..."
    "$PY" -m pip install --upgrade pip
    if ! "$PY" -m pip install -r requirements.txt; then
        # Apaga o ambiente incompleto para a próxima execução tentar de novo do zero
        echo "A instalação falhou. Verifique a internet e rode o script novamente."
        rm -rf "$VENV"
        exit 1
    fi
fi

# Abre o endereço no navegador padrão, conforme o sistema
abrir_navegador() {
    case "$(uname -s)" in
        Darwin) open "$1" ;;                                # macOS
        MINGW*|MSYS*|CYGWIN*) cmd //c start "" "$1" ;;      # Windows (Git Bash)
        *) xdg-open "$1" > /dev/null 2>&1 ;;                # Linux
    esac
}

# Abre o navegador só quando o servidor estiver pronto: em segundo plano, consulta
# /api/saude a cada 1 segundo (por até 2 minutos) usando o próprio Python do ambiente.
# Usa 127.0.0.1 e não "localhost", porque "localhost" pode tentar primeiro o IPv6 (::1),
# onde o servidor não escuta.
(
    for _ in $(seq 1 120); do
        if "$PY" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/saude', timeout=2)" 2> /dev/null; then
            abrir_navegador "http://localhost:8000"
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
