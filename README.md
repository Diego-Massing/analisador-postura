# Analisador Ergonômico de Postura

Aplicação web que analisa a **postura sentada** a partir de uma **foto de perfil** usando visão computacional.
O sistema detecta as articulações do corpo com o modelo **YOLO11-pose (Ultralytics)**, calcula os ângulos
do **pescoço** e do **tronco**, desenha o "esqueleto" sobre a foto e mostra alertas visuais e recomendações
de correção em linguagem simples.

> Projeto Extensionista · Disciplina de Processamento de Imagens · FSG · 2026/2
> Prof. Vinícius Colombo Sonda
> Núcleo: Saúde e Bem-Estar · ODS 3: Saúde e Bem-Estar

**Integrantes:** Mateus Romanzini · Diego Massing Schwantes · Lorenzo Carniel · Heryck Marcante

---

## Sumário
1. [Público-alvo e problema](#1-público-alvo-e-problema)
2. [Tecnologias e versões](#2-tecnologias-e-versões)
3. [Estrutura do projeto](#3-estrutura-do-projeto)
4. [Instalação e configuração passo a passo](#4-instalação-e-configuração-passo-a-passo)
5. [Como usar](#5-como-usar)
6. [Funcionamento do back-end](#6-funcionamento-do-back-end)
7. [Funcionamento do front-end](#7-funcionamento-do-front-end)
8. [Critérios de avaliação da postura](#8-critérios-de-avaliação-da-postura)
9. [Limitações](#9-limitações)
10. [Referências](#10-referências)

---

## 1. Público-alvo e problema

| Pergunta | Resposta |
|---|---|
| **Quem será beneficiado?** | Estudantes e trabalhadores que passam longas horas em frente ao computador. |
| **Qual problema enfrentam?** | Dores crônicas e lesões por esforço repetitivo (LER/DORT) causadas por má postura não percebida durante o expediente. |
| **Como a visão computacional ajuda?** | Um modelo de estimativa de pose localiza orelha, ombro e quadril na foto; a partir dessas coordenadas calculamos os ângulos do pescoço e da coluna. |
| **Como usarão no dia a dia?** | O usuário tira uma foto de perfil sentado à mesa, envia pela página web e recebe a imagem com o esqueleto desenhado, os ângulos e alertas caso a postura seja prejudicial. |

---

## 2. Tecnologias e versões

| Camada | Tecnologia | Versão | Para que serve |
|---|---|---|---|
| Linguagem (back-end) | Python | 3.12.10 | Linguagem do servidor e da análise |
| Framework web | FastAPI | 0.143.0 | Cria a API HTTP (`/api/analisar`) e serve o front-end |
| Servidor | Uvicorn | 0.54.0 | Executa a aplicação FastAPI |
| Upload | python-multipart | 0.0.32 | Permite receber arquivos enviados por formulário |
| Visão computacional | Ultralytics (YOLO) | 8.4.175 | Executa o modelo de estimativa de pose |
| Modelo | YOLO11n-pose | — | Modelo pré-treinado (COCO-Pose, 17 pontos-chave) |
| Deep learning | PyTorch (CPU) | 2.14.1 | Motor usado internamente pelo Ultralytics |
| Processamento de imagem | OpenCV | 5.0.0 | Leitura da imagem e desenho do esqueleto/ângulos |
| Cálculo numérico | NumPy | 2.5.3 | Manipulação dos vetores de coordenadas |
| Front-end | HTML5, CSS3, JavaScript (puro) | — | Interface web, sem frameworks, roda em qualquer navegador |

**Modelo pré-treinado utilizado:** YOLO11n-pose, da Ultralytics, licença open source **AGPL-3.0**.
Repositório: <https://github.com/ultralytics/ultralytics> · Documentação: <https://docs.ultralytics.com/tasks/pose/>.
O arquivo `yolo11n-pose.pt` (≈ 6 MB) é baixado automaticamente na primeira execução.

---

## 3. Estrutura do projeto

```
analisador-postura/
├── backend/
│   ├── app.py          # Servidor FastAPI: rotas da API e entrega do front-end
│   ├── postura.py      # Visão computacional: YOLO Pose, cálculo de ângulos, desenho
│   └── modelos/        # Modelo yolo11n-pose.pt (baixado automaticamente)
├── frontend/
│   ├── index.html      # Estrutura da página
│   ├── style.css       # Visual (cores por classificação, layout responsivo)
│   └── app.js          # Envio da foto e exibição do resultado
├── requirements.txt    # Dependências Python com versões fixas
├── iniciar.bat         # Atalho para instalar e iniciar no Windows
└── README.md           # Esta documentação
```

---

## 4. Instalação e configuração passo a passo

### Pré-requisitos
- **Python 3.12** — <https://www.python.org/downloads/>
  Na instalação, marque **"Add python.exe to PATH"**.
  (No Windows também é possível instalar pelo terminal: `winget install Python.Python.3.12`.
  O `iniciar.bat` encontra o Python mesmo que ele não esteja no PATH.)
- **Git** (para clonar o repositório) — <https://git-scm.com/>
- Conexão com a internet na primeira execução (download das bibliotecas e do modelo).

### Opção A — automática (Windows)
1. Clone ou baixe o repositório.
2. Dê dois cliques em **`iniciar.bat`**.
   Na primeira vez ele cria o ambiente virtual e instala tudo (pode levar alguns minutos, o PyTorch é grande).
   O ambiente fica em `%LOCALAPPDATA%\venvs\analisador-postura`, fora da pasta do projeto, para não ser
   sincronizado por OneDrive/Google Drive.
3. O navegador abre em <http://localhost:8000>. Se a página não carregar de primeira, aguarde alguns segundos e atualize.

### Opção B — manual (Windows, Linux ou macOS)
```bash
# 1. Clonar o repositório
git clone <URL-DO-REPOSITORIO>
cd analisador-postura

# 2. Criar o ambiente virtual
python -m venv .venv

# 3. Ativar o ambiente virtual
#    Windows (PowerShell):
.venv\Scripts\Activate.ps1
#    Windows (cmd):
.venv\Scripts\activate.bat
#    Linux/macOS:
source .venv/bin/activate

# 4. Instalar as dependências
pip install -r requirements.txt

# 5. Iniciar o servidor (dentro da pasta backend)
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000
```
6. Abra <http://localhost:8000> no navegador.

> **Dica:** no PowerShell, se a ativação for bloqueada, execute uma vez
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

> **Usar pelo celular:** com o servidor iniciado usando `--host 0.0.0.0`, acesse `http://IP-DO-COMPUTADOR:8000`
> pelo celular conectado à mesma rede Wi-Fi.

A documentação interativa da API (gerada pelo FastAPI) fica em <http://localhost:8000/docs>.

---

## 5. Como usar
1. Peça para alguém tirar uma foto sua **de lado**, sentado na posição em que você costuma trabalhar,
   mostrando **da cabeça até o quadril**.
2. Na página, clique na área de envio (ou arraste a foto) e depois em **"Analisar minha postura"**.
3. Veja o resultado:
   - a foto com o esqueleto e as linhas do pescoço e do tronco coloridas
     (🟢 adequada · 🟠 atenção · 🔴 inadequada);
   - o ângulo medido de cada parte e o valor ideal;
   - recomendações para corrigir a postura.

---

## 6. Funcionamento do back-end

O back-end é uma API em **FastAPI** (`backend/app.py`) que usa o módulo de visão computacional
`backend/postura.py`.

### Rotas
| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Entrega a página `frontend/index.html` |
| GET | `/api/saude` | Retorna `{"status": "ok"}` para testar se o servidor está no ar |
| POST | `/api/analisar` | Recebe a foto (campo `foto`, multipart/form-data) e devolve a análise |

### Fluxo do processamento (`analisar_imagem`)
1. **Validação** (`app.py`): aceita apenas JPG/PNG/WEBP de até 10 MB.
2. **Decodificação**: os bytes são convertidos em imagem com `cv2.imdecode`.
3. **Estimativa de pose**: o modelo `YOLO11n-pose` detecta as pessoas e devolve, para cada uma,
   17 pontos-chave (padrão COCO) com coordenadas (x, y) e confiança.
4. **Seleção da pessoa**: se houver mais de uma, usa a de maior caixa (mais próxima da câmera).
5. **Escolha do lado**: em uma foto de perfil, um lado do corpo fica escondido. É escolhido o lado
   (esquerdo ou direito) em que **orelha, ombro e quadril** têm confiança ≥ 0,5 e maior soma de confiança.
6. **Cálculo dos ângulos** (função `angulo_com_vertical`):
   - **Pescoço:** ângulo entre o segmento *ombro → orelha* e a vertical.
   - **Tronco:** ângulo entre o segmento *quadril → ombro* e a vertical.

   ```
   ângulo = | atan2(Δx, Δy) |   (com Δy invertido, pois na imagem o eixo Y cresce para baixo)
   ```
   0° significa alinhado na vertical; quanto maior o valor, mais inclinado.
7. **Classificação** de cada ângulo em *adequada*, *atenção* ou *inadequada* (ver seção 8).
   A classificação geral é a pior entre as duas.
8. **Desenho**: o esqueleto da pessoa é desenhado em branco; os segmentos do pescoço e do tronco
   em verde/laranja/vermelho, com uma vertical tracejada de referência, e um painel com os ângulos.
9. **Resposta**: a imagem anotada é codificada em JPEG/base64 e devolvida junto com os dados.

### Exemplo de resposta de `/api/analisar`
```json
{
  "resultado": {
    "geral": "atencao",
    "lado": "direito",
    "limites": {"pescoco": {"adequada": 20, "atencao": 40}, "tronco": {"adequada": 10, "atencao": 20}},
    "pescoco": {
      "angulo": 31.2,
      "classificacao": "atencao",
      "mensagem": "Sua cabeça está um pouco projetada para frente.",
      "recomendacoes": ["Eleve o monitor até que a parte de cima da tela fique na altura dos olhos.", "..."]
    },
    "tronco": {"angulo": 6.4, "classificacao": "adequada", "mensagem": "Suas costas estão bem alinhadas.", "recomendacoes": []}
  },
  "imagem": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

### Erros tratados
| Situação | Código | Mensagem ao usuário |
|---|---|---|
| Arquivo que não é imagem | 400 | "Formato não suportado..." |
| Foto maior que 10 MB | 400 | "A foto é muito grande..." |
| Imagem corrompida | 422 | "Não foi possível abrir a imagem..." |
| Nenhuma pessoa encontrada | 422 | "Nenhuma pessoa foi encontrada na foto..." |
| Orelha/ombro/quadril não visíveis | 422 | "Tire a foto de lado (perfil)..." |

---

## 7. Funcionamento do front-end

Interface em HTML, CSS e JavaScript puros (`frontend/`), servida pelo próprio back-end,
pensada para **usuários leigos**:

- **Barra de etapas** (*Foto → Análise → Resultado*): mostra em que ponto do processo o usuário está
  (função `definirEtapa` em `app.js`).
- **Passo 1 — envio:** quatro cartões com dicas de como tirar a foto, área para clicar ou arrastar a imagem,
  prévia da foto (com o selo "Trocar foto") e botão "Analisar minha postura" (fica desabilitado até uma foto
  ser escolhida).
- **Envio:** `app.js` monta um `FormData` com o campo `foto` e faz `fetch("POST /api/analisar")`.
  Enquanto aguarda, o botão mostra "Analisando sua postura..." com uma animação.
- **Passo 2 — resultado:**
  - faixa colorida com ícone e o resumo geral (adequada / atenção / inadequada);
  - foto anotada com legenda explicando as linhas, e link **"Baixar imagem"** para salvar o resultado;
  - cartões de pescoço e tronco com o ângulo, um selo com a classificação e uma **régua colorida**
    (verde → laranja → vermelho) com um marcador na posição do ângulo medido. A régua vai de 0° até
    1,5 × o limite de "atenção" e é montada pela função `montarRegua` a partir dos `limites` enviados pela API;
  - lista de recomendações em forma de checklist.
- **Erros:** mensagens do back-end (campo `detail`) aparecem em uma caixa vermelha; se o servidor
  estiver desligado, a página avisa que não conseguiu se conectar.
- **Responsivo:** no celular o layout passa para uma coluna.
- **Tema escuro automático:** segue a configuração do sistema (`prefers-color-scheme`); as cores ficam em
  variáveis CSS no início de `style.css`.
- **Acessibilidade:** contorno visível para navegação por teclado, textos alternativos nas imagens e
  animações desligadas para quem prefere menos movimento (`prefers-reduced-motion`).
- Botão **"Analisar outra foto"** volta ao estado inicial.
- Os links para `style.css` e `app.js` têm `?v=N` no final; ao alterar esses arquivos, aumente o número
  para o navegador não usar a versão antiga guardada em cache.

---

## 8. Critérios de avaliação da postura

Os limites ficam no dicionário `LIMITES` de `backend/postura.py` e foram baseados nas faixas de flexão
do pescoço e do tronco do método **RULA** (*Rapid Upper Limb Assessment*):

| Parte | 🟢 Adequada | 🟠 Atenção | 🔴 Inadequada |
|---|---|---|---|
| Pescoço (ombro→orelha vs. vertical) | até 20° | 20° a 40° | acima de 40° |
| Tronco (quadril→ombro vs. vertical) | até 10° | 10° a 20° | acima de 20° |

---

## 9. Limitações
- A foto precisa ser **de perfil** e mostrar orelha, ombro e quadril; fotos de frente não permitem medir a inclinação.
- A medição é 2D: se a câmera estiver inclinada ou muito acima/abaixo do tronco, os ângulos podem ser distorcidos.
- Roupas largas, encosto alto da cadeira ou pouca luz podem reduzir a precisão dos pontos-chave.
- A ferramenta é **educativa e preventiva** e **não substitui** a avaliação de um profissional de saúde.
- As fotos não são armazenadas: são processadas em memória e descartadas após a resposta.

---

## 10. Referências
- JOCHER, G.; QIU, J. **Ultralytics YOLO11**. Versão 11.0.0, 2024. Disponível em: <https://github.com/ultralytics/ultralytics>. Licença AGPL-3.0.
- LIN, T.-Y. et al. **Microsoft COCO: Common Objects in Context**. In: European Conference on Computer Vision (ECCV), 2014.
- McATAMNEY, L.; CORLETT, E. N. **RULA: a survey method for the investigation of work-related upper limb disorders**. Applied Ergonomics, v. 24, n. 2, p. 91-99, 1993.
- FASTAPI. **FastAPI documentation**. Disponível em: <https://fastapi.tiangolo.com/>.
- OPENCV. **OpenCV documentation**. Disponível em: <https://docs.opencv.org/>.
- ORGANIZAÇÃO DAS NAÇÕES UNIDAS. **Objetivos de Desenvolvimento Sustentável — ODS 3: Saúde e Bem-Estar**. Disponível em: <https://brasil.un.org/pt-br/sdgs/3>.
