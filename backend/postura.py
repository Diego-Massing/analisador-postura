"""
postura.py
----------
Módulo responsável por toda a lógica de visão computacional do Analisador
Ergonômico de Postura:

1. Detectar a pessoa na foto e extrair os pontos-chave (keypoints) do corpo
   com o modelo pré-treinado YOLO11n-pose (Ultralytics, licença AGPL-3.0).
2. Escolher o lado do corpo que está virado para a câmera (esquerdo ou direito).
3. Calcular os ângulos de inclinação do pescoço e do tronco.
4. Classificar cada ângulo (adequada / atenção / inadequada) e gerar alertas
   e recomendações em linguagem simples.
5. Desenhar o "esqueleto" e os ângulos sobre a imagem.
"""

import math
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

# ---------------------------------------------------------------------------
# Configurações
# ---------------------------------------------------------------------------

# Caminho do modelo. Se o arquivo não existir, a Ultralytics faz o download
# automático na primeira execução (cerca de 6 MB).
CAMINHO_MODELO = Path(__file__).parent / "modelos" / "yolo11n-pose.pt"

# Confiança mínima para considerarmos que um ponto-chave foi realmente visto.
CONFIANCA_MINIMA = 0.5

# Índices dos pontos-chave no padrão COCO (17 pontos) usado pelo YOLO Pose.
# 0 nariz, 1-2 olhos, 3-4 orelhas, 5-6 ombros, 7-8 cotovelos, 9-10 punhos,
# 11-12 quadris, 13-14 joelhos, 15-16 tornozelos (ímpar = esquerdo, par = direito).
PONTOS = {
    "esquerdo": {"orelha": 3, "ombro": 5, "quadril": 11},
    "direito": {"orelha": 4, "ombro": 6, "quadril": 12},
}

# Pares de pontos-chave ligados entre si para desenhar o esqueleto (padrão COCO).
ESQUELETO_COCO = [
    (0, 1), (0, 2), (1, 3), (2, 4),            # rosto
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),   # ombros e braços
    (5, 11), (6, 12), (11, 12),                # tronco
    (11, 13), (13, 15), (12, 14), (14, 16),    # pernas
]

# Limites (em graus) para classificar a postura. Baseados nas faixas do método
# RULA (McAtamney & Corlett, 1993), que pontua a flexão do pescoço e do tronco.
# Ajuste aqui caso o grupo defina outros valores na pesquisa.
LIMITES = {
    # Inclinação do pescoço: ângulo entre a linha ombro→orelha e a vertical.
    "pescoco": {"adequada": 20, "atencao": 40},
    # Inclinação do tronco: ângulo entre a linha quadril→ombro e a vertical.
    "tronco": {"adequada": 10, "atencao": 20},
}

# Cores no formato BGR do OpenCV para cada classificação.
CORES = {
    "adequada": (80, 175, 76),     # verde
    "atencao": (0, 165, 255),      # laranja
    "inadequada": (54, 67, 244),   # vermelho
}

# Textos mostrados ao usuário para cada parte do corpo e classificação.
MENSAGENS = {
    "pescoco": {
        "adequada": "Sua cabeça está bem alinhada com os ombros.",
        "atencao": "Sua cabeça está um pouco projetada para frente.",
        "inadequada": "Sua cabeça está muito projetada para frente, o que sobrecarrega o pescoço.",
    },
    "tronco": {
        "adequada": "Suas costas estão bem alinhadas.",
        "atencao": "Seu tronco está um pouco inclinado.",
        "inadequada": "Seu tronco está muito inclinado, o que sobrecarrega a coluna.",
    },
}

RECOMENDACOES = {
    "pescoco": [
        "Eleve o monitor até que a parte de cima da tela fique na altura dos olhos.",
        "Puxe levemente o queixo para trás, alinhando as orelhas com os ombros.",
        "Se usa notebook, considere um suporte e um teclado externo.",
    ],
    "tronco": [
        "Sente-se no fundo da cadeira e apoie toda a coluna no encosto.",
        "Aproxime a cadeira da mesa para não precisar se inclinar até o teclado.",
        "Mantenha os pés apoiados no chão (ou em um apoio) e os joelhos em cerca de 90 graus.",
    ],
}

# ---------------------------------------------------------------------------
# Carregamento do modelo (feito uma única vez, quando o módulo é importado)
# ---------------------------------------------------------------------------
CAMINHO_MODELO.parent.mkdir(exist_ok=True)
modelo = YOLO(str(CAMINHO_MODELO))


class ErroAnalise(Exception):
    """Erro com mensagem amigável, exibida diretamente para o usuário."""


# ---------------------------------------------------------------------------
# Funções auxiliares
# ---------------------------------------------------------------------------

def angulo_com_vertical(ponto_baixo, ponto_cima):
    """
    Calcula o ângulo (em graus) entre o segmento ponto_baixo→ponto_cima e a
    linha vertical. 0° significa perfeitamente "em pé"; quanto maior, mais
    inclinado. Lembrando que no sistema de coordenadas da imagem o eixo Y
    cresce para baixo.
    """
    dx = ponto_cima[0] - ponto_baixo[0]
    dy = ponto_baixo[1] - ponto_cima[1]  # invertido para Y apontar para cima
    return abs(math.degrees(math.atan2(dx, dy)))


def classificar(parte, angulo):
    """Retorna 'adequada', 'atencao' ou 'inadequada' conforme os LIMITES."""
    limites = LIMITES[parte]
    if angulo <= limites["adequada"]:
        return "adequada"
    if angulo <= limites["atencao"]:
        return "atencao"
    return "inadequada"


def escolher_lado(pontos, confiancas):
    """
    Em uma foto de perfil, um dos lados do corpo fica escondido. Escolhemos o
    lado cuja soma de confiança de orelha, ombro e quadril é maior.
    Retorna o nome do lado ou None se nenhum lado tiver os três pontos visíveis.
    """
    melhor_lado, melhor_soma = None, 0.0
    for lado, idx in PONTOS.items():
        conf = [confiancas[i] for i in idx.values()]
        if min(conf) >= CONFIANCA_MINIMA and sum(conf) > melhor_soma:
            melhor_lado, melhor_soma = lado, sum(conf)
    return melhor_lado


def desenhar_esqueleto(imagem, pontos, confiancas, espessura):
    """
    Desenha o esqueleto completo (todas as ligações do padrão COCO) da pessoa
    analisada, em branco, ignorando pontos com confiança baixa.
    """
    for a, b in ESQUELETO_COCO:
        if confiancas[a] >= CONFIANCA_MINIMA and confiancas[b] >= CONFIANCA_MINIMA:
            pa = tuple(int(v) for v in pontos[a])
            pb = tuple(int(v) for v in pontos[b])
            cv2.line(imagem, pa, pb, (255, 255, 255), max(1, espessura // 2), cv2.LINE_AA)
    for ponto, conf in zip(pontos, confiancas):
        if conf >= CONFIANCA_MINIMA:
            cv2.circle(imagem, tuple(int(v) for v in ponto), espessura, (255, 255, 255), -1, cv2.LINE_AA)


def desenhar(imagem, pontos, confiancas, p, resultado):
    """
    Desenha sobre a imagem:
      - o esqueleto da pessoa (branco);
      - as linhas quadril→ombro (tronco) e ombro→orelha (pescoço), coloridas
        conforme a classificação, com uma vertical tracejada de referência;
      - um painel no canto superior esquerdo com o valor de cada ângulo.
    """
    espessura = max(2, imagem.shape[1] // 250)
    raio = espessura * 3
    escala_fonte = max(0.6, imagem.shape[1] / 1100)

    desenhar_esqueleto(imagem, pontos, confiancas, espessura)

    segmentos = {"pescoco": ("ombro", "orelha"), "tronco": ("quadril", "ombro")}
    for parte, (baixo, cima) in segmentos.items():
        cor = CORES[resultado[parte]["classificacao"]]
        a, b = p[baixo], p[cima]
        # Linha vertical tracejada de referência (para onde o segmento "deveria" apontar)
        comprimento = int(math.dist(a, b))
        for y in range(0, comprimento, 14):
            cv2.line(imagem, (a[0], a[1] - y), (a[0], a[1] - min(y + 7, comprimento)), (255, 255, 255), max(1, espessura // 2))
        # Segmento do corpo, com contorno escuro para destacar em qualquer fundo
        cv2.line(imagem, a, b, (30, 30, 30), espessura * 2 + 2, cv2.LINE_AA)
        cv2.line(imagem, a, b, cor, espessura * 2, cv2.LINE_AA)

    # Círculos nas articulações usadas no cálculo
    for ponto in p.values():
        cv2.circle(imagem, ponto, raio, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(imagem, ponto, raio, (30, 30, 30), 2, cv2.LINE_AA)

    # Painel com os ângulos (sem acentos, pois as fontes do OpenCV não têm acentos)
    linhas = [
        (f"Pescoco: {resultado['pescoco']['angulo']:.0f} graus", CORES[resultado["pescoco"]["classificacao"]]),
        (f"Tronco:  {resultado['tronco']['angulo']:.0f} graus", CORES[resultado["tronco"]["classificacao"]]),
    ]
    altura_linha = int(40 * escala_fonte)
    margem = int(12 * escala_fonte)
    largura_painel = int(300 * escala_fonte)
    sobreposicao = imagem.copy()
    cv2.rectangle(sobreposicao, (0, 0), (largura_painel, altura_linha * len(linhas) + margem * 2), (20, 20, 20), -1)
    cv2.addWeighted(sobreposicao, 0.65, imagem, 0.35, 0, imagem)  # fundo semitransparente
    for k, (texto, cor) in enumerate(linhas):
        y = margem + altura_linha * (k + 1) - int(10 * escala_fonte)
        cv2.circle(imagem, (margem + raio, y - raio), raio, cor, -1, cv2.LINE_AA)
        cv2.putText(imagem, texto, (margem + raio * 3, y), cv2.FONT_HERSHEY_SIMPLEX, escala_fonte, (255, 255, 255), max(1, espessura // 2 + 1), cv2.LINE_AA)
    return imagem


# ---------------------------------------------------------------------------
# Função principal
# ---------------------------------------------------------------------------

def analisar_imagem(dados_imagem: bytes):
    """
    Recebe os bytes de uma imagem (JPG/PNG), executa a análise e retorna uma
    tupla (resultado: dict, imagem_anotada: np.ndarray BGR).
    Lança ErroAnalise com uma mensagem amigável se algo impedir a análise.
    """
    # 1. Decodifica os bytes em uma imagem OpenCV
    imagem = cv2.imdecode(np.frombuffer(dados_imagem, np.uint8), cv2.IMREAD_COLOR)
    if imagem is None:
        raise ErroAnalise("Não foi possível abrir a imagem. Envie um arquivo JPG ou PNG.")

    # 2. Executa o modelo YOLO Pose
    deteccoes = modelo.predict(imagem, verbose=False)[0]
    if deteccoes.keypoints is None or len(deteccoes.boxes) == 0:
        raise ErroAnalise("Nenhuma pessoa foi encontrada na foto. Tente uma foto com mais luz e o corpo visível.")

    # 3. Se houver mais de uma pessoa, usa a de maior área (a mais próxima da câmera)
    caixas = deteccoes.boxes.xyxy.cpu().numpy()
    areas = (caixas[:, 2] - caixas[:, 0]) * (caixas[:, 3] - caixas[:, 1])
    i = int(np.argmax(areas))
    pontos = deteccoes.keypoints.xy[i].cpu().numpy()
    confiancas = deteccoes.keypoints.conf[i].cpu().numpy()

    # 4. Escolhe o lado do corpo visível
    lado = escolher_lado(pontos, confiancas)
    if lado is None:
        raise ErroAnalise(
            "Não conseguimos ver orelha, ombro e quadril ao mesmo tempo. "
            "Tire a foto de lado (perfil), mostrando da cabeça até o quadril."
        )
    p = {nome: tuple(int(v) for v in pontos[idx]) for nome, idx in PONTOS[lado].items()}

    # 5. Calcula e classifica os ângulos
    angulos = {
        "pescoco": angulo_com_vertical(p["ombro"], p["orelha"]),
        "tronco": angulo_com_vertical(p["quadril"], p["ombro"]),
    }
    resultado = {}
    for parte, angulo in angulos.items():
        classe = classificar(parte, angulo)
        resultado[parte] = {
            "angulo": round(angulo, 1),
            "classificacao": classe,
            "mensagem": MENSAGENS[parte][classe],
            "recomendacoes": RECOMENDACOES[parte] if classe != "adequada" else [],
        }

    # 6. Classificação geral = a pior entre pescoço e tronco
    ordem = ["adequada", "atencao", "inadequada"]
    geral = max((r["classificacao"] for r in resultado.values()), key=ordem.index)

    # 7. Desenha o esqueleto, as linhas de análise e o painel de ângulos
    anotada = desenhar(imagem.copy(), pontos, confiancas, p, resultado)

    return {"geral": geral, "lado": lado, "limites": LIMITES, **resultado}, anotada
