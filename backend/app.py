"""
app.py
------
Servidor web (back-end) do Analisador Ergonômico de Postura, feito com FastAPI.

Rotas:
    GET  /               -> entrega a interface web (pasta ../frontend)
    GET  /api/saude      -> verifica se o servidor está no ar
    POST /api/analisar   -> recebe uma foto, analisa a postura e devolve o
                            resultado em JSON junto com a imagem anotada

Para executar (com o ambiente virtual ativado, dentro da pasta backend):
    uvicorn app:app --reload
"""

import base64
from pathlib import Path

import cv2
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from postura import ErroAnalise, analisar_imagem

# Pasta onde ficam os arquivos do front-end (HTML, CSS e JavaScript)
PASTA_FRONTEND = Path(__file__).parent.parent / "frontend"

# Tamanho máximo aceito para a foto enviada (10 MB)
TAMANHO_MAXIMO = 10 * 1024 * 1024

# Tipos de arquivo aceitos
TIPOS_ACEITOS = {"image/jpeg", "image/png", "image/webp"}

app = FastAPI(
    title="Analisador Ergonômico de Postura",
    description="API que analisa a postura sentada a partir de uma foto de perfil usando YOLO Pose.",
    version="1.0.0",
)


@app.middleware("http")
async def sem_cache(request, call_next):
    """
    Pede ao navegador que sempre confira se há uma versão nova dos arquivos do
    front-end (HTML, CSS e JS). Sem isso, após uma atualização o navegador pode
    continuar mostrando o layout antigo guardado em cache.
    """
    resposta = await call_next(request)
    resposta.headers["Cache-Control"] = "no-cache"
    return resposta


@app.get("/api/saude")
def saude():
    """Rota simples para testar se o back-end está funcionando."""
    return {"status": "ok"}


@app.post("/api/analisar")
async def analisar(foto: UploadFile = File(...)):
    """
    Recebe a foto enviada pelo formulário (campo 'foto'), executa a análise
    e devolve:
        - resultado: ângulos, classificações, mensagens e recomendações
        - imagem: a foto com o esqueleto desenhado, em base64 (JPEG)
    """
    # Valida o tipo do arquivo
    if foto.content_type not in TIPOS_ACEITOS:
        raise HTTPException(400, "Formato não suportado. Envie uma foto JPG, PNG ou WEBP.")

    # Lê o conteúdo e valida o tamanho
    dados = await foto.read()
    if len(dados) > TAMANHO_MAXIMO:
        raise HTTPException(400, "A foto é muito grande. O limite é 10 MB.")

    # Executa a análise de visão computacional (módulo postura.py)
    try:
        resultado, imagem_anotada = analisar_imagem(dados)
    except ErroAnalise as erro:
        # Erros "esperados" (sem pessoa, foto de frente etc.) voltam como 422
        raise HTTPException(422, str(erro))

    # Converte a imagem anotada para JPEG e depois para texto base64,
    # para que o front-end possa exibi-la diretamente em uma tag <img>
    ok, jpeg = cv2.imencode(".jpg", imagem_anotada, [cv2.IMWRITE_JPEG_QUALITY, 90])
    imagem_b64 = base64.b64encode(jpeg.tobytes()).decode("ascii")

    return {"resultado": resultado, "imagem": f"data:image/jpeg;base64,{imagem_b64}"}


@app.get("/")
def pagina_inicial():
    """Entrega a página principal do front-end."""
    return FileResponse(PASTA_FRONTEND / "index.html")


# Serve os demais arquivos do front-end (style.css, app.js, imagens)
app.mount("/", StaticFiles(directory=PASTA_FRONTEND), name="frontend")
