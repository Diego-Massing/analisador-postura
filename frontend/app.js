/*
  app.js
  Comportamento da interface do Alinha:
    - escolher a foto (clique, arrastar e soltar no quadro, ou colar com Ctrl+V);
    - validar tipo e tamanho antes de enviar;
    - enviar a foto para o back-end (POST /api/analisar);
    - mostrar a foto já traçada pelo back-end (esqueleto, pescoço e tronco
      coloridos, verticais de referência). O front-end NÃO redesenha a análise;
    - preencher a ficha de avaliação (ângulos, réguas, recomendações);
    - animar o resultado uma única vez: a foto é revelada de cima para baixo
      enquanto os ângulos contam a partir de zero (e nada de animação se o
      usuário pediu "reduzir movimento").

  A tela é uma pequena máquina de estados guardada em
  section#analisar[data-estado]:  vazio -> pronto -> analisando -> resultado.

  Também cuida da página em volta da ferramenta: rolagem até as seções,
  link ativo na barra do topo e a contagem dos graus do desenho da abertura.
*/

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const URL_API = "/api/analisar";

// Mesmas regras (e mensagens) do back-end
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10 MB
const MSG_FORMATO = "Formato não suportado. Envie uma foto JPG, PNG ou WEBP.";
const MSG_TAMANHO = "A foto é muito grande. O limite é 10 MB.";
const MSG_SEM_CONEXAO = "Não foi possível conectar ao servidor. Verifique se o back-end está rodando.";
const MSG_ERRO_GENERICO = "Não foi possível analisar a foto.";

// Tempo mínimo da animação de "analisando", para o passo ser visível na apresentação
const TEMPO_MINIMO_ANALISE = 600;

// Duração da revelação do resultado (foto, números e marcadores andam juntos)
const DURACAO_REVELACAO = 700;

// Nota sob o quadro: uma até a análise, outra quando a foto traçada aparece
const NOTA_PADRAO = "Linha de prumo: vertical de referência.";
const NOTA_RESULTADO =
  "Foto traçada pelo analisador: esqueleto em branco, pescoço e tronco coloridos pela classificação, vertical tracejada de referência.";

const NS_SVG = "http://www.w3.org/2000/svg";

// Texto e ícone (id do símbolo no sprite do HTML) de cada classificação
const CLASSES = {
  adequada: { rotulo: "Adequada", icone: "i-ok" },
  atencao: { rotulo: "Atenção", icone: "i-atencao" },
  inadequada: { rotulo: "Inadequada", icone: "i-alerta" },
};

// Veredito geral: frase principal + frase de apoio
const VEREDITO = {
  adequada: {
    titulo: "Sua postura está adequada.",
    texto: "Continue assim e lembre-se de fazer pausas.",
  },
  atencao: {
    titulo: "Sua postura merece atenção.",
    texto: "Pequenos ajustes já fazem diferença. Veja o que fazer abaixo.",
  },
  inadequada: {
    titulo: "Sua postura pode estar prejudicando sua saúde.",
    texto: "Siga as orientações abaixo para aliviar o pescoço e a coluna.",
  },
};

const RECOMENDACAO_PADRAO = "Continue assim! Levante e alongue o corpo a cada 50 minutos.";

// Curva "ease-out-expo": começa rápido e assenta devagar
const EASE_OUT_EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";

// ---------------------------------------------------------------------------
// Referências aos elementos da página
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

const secaoAnalisar = $("analisar");
const quadroArea = $("quadro-area");
const legendaQuadro = $("quadro-legenda");
const notaQuadro = $("quadro-nota");
const zonaEnvio = $("zona-envio");
const campoFoto = $("campo-foto");
const previa = $("previa");
const palco = $("palco");
const fotoResultado = $("foto-resultado");
const linhaRevelacao = $("linha-revelacao");
const painelAnalisando = $("analisando");
const trocarFoto = $("trocar-foto");
const fichaInstrucoes = $("ficha-instrucoes");
const fichaResultado = $("ficha-resultado");
const botaoAnalisar = $("botao-analisar");
const botaoNova = $("botao-nova");
const mensagemErro = $("mensagem-erro");
const mensagemErroTexto = $("mensagem-erro-texto");
const linhaGeral = $("linha-geral");
const ficha = $("ficha");
const maisAbaixo = $("mais-abaixo");
const fichaLado = $("ficha-lado");
const baixarImagem = $("baixar-imagem");

// ---------------------------------------------------------------------------
// Estado da aplicação
// ---------------------------------------------------------------------------

let estado = "vazio"; // vazio | pronto | analisando | resultado
let fotoSelecionada = null; // objeto File escolhido
let urlPrevia = null; // endereço temporário (blob:) da prévia
let contadorArrasto = 0; // evita "piscar" ao arrastar por cima de elementos filhos

// Tudo o que a animação do resultado cria, para poder cancelar ao trocar de foto
let animacoes = [];
let temporizadores = [];
let geracaoAnimacao = 0;

/** Pausa assíncrona simples. */
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** O usuário pediu menos movimento no sistema operacional? */
const preferePoucoMovimento = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Layout de uma coluna (abaixo de 1024px): a ficha fica embaixo do quadro. */
const ehTelaPequena = () => window.matchMedia && window.matchMedia("(max-width: 1023px)").matches;

// ---------------------------------------------------------------------------
// Máquina de estados: mostra e esconde cada parte da tela
// ---------------------------------------------------------------------------

/**
 * Troca o estado da tela. O CSS lê data-estado e o atributo `hidden` dos
 * elementos faz o mesmo trabalho, então os dois ficam sempre de acordo.
 */
function definirEstado(novo) {
  estado = novo;
  secaoAnalisar.dataset.estado = novo;

  const vazio = novo === "vazio";
  const pronto = novo === "pronto";
  const analisando = novo === "analisando";
  const resultado = novo === "resultado";

  zonaEnvio.hidden = !vazio;
  previa.hidden = !(pronto || analisando);
  painelAnalisando.hidden = !analisando;
  palco.hidden = !resultado;
  legendaQuadro.hidden = !resultado;
  trocarFoto.hidden = !pronto;
  notaQuadro.textContent = resultado ? NOTA_RESULTADO : NOTA_PADRAO;

  fichaInstrucoes.hidden = resultado;
  fichaResultado.hidden = !resultado;

  // Botão principal: só habilitado quando há foto pronta
  botaoAnalisar.disabled = !pronto;
  botaoAnalisar.textContent = analisando ? "Analisando…" : "Analisar postura";
  if (analisando) botaoAnalisar.setAttribute("aria-busy", "true");
  else botaoAnalisar.removeAttribute("aria-busy");
}

// ---------------------------------------------------------------------------
// Mensagens de erro
// ---------------------------------------------------------------------------

function mostrarErro(texto) {
  mensagemErroTexto.textContent = texto;
  mensagemErro.hidden = false;
}

function esconderErro() {
  mensagemErro.hidden = true;
  mensagemErroTexto.textContent = "";
}

// ---------------------------------------------------------------------------
// Escolha da foto
// ---------------------------------------------------------------------------

/** Devolve uma mensagem de erro se o arquivo não servir, ou null se estiver ok. */
function validarArquivo(arquivo) {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) return MSG_FORMATO;
  if (arquivo.size > TAMANHO_MAXIMO) return MSG_TAMANHO;
  return null;
}

/** Libera da memória o endereço temporário da prévia (se houver). */
function liberarPrevia() {
  if (urlPrevia) URL.revokeObjectURL(urlPrevia);
  urlPrevia = null;
}

/** Valida a foto, mostra a prévia no quadro e libera o botão de análise. */
function selecionarFoto(arquivo) {
  if (!arquivo) return;

  const problema = validarArquivo(arquivo);
  if (problema) {
    campoFoto.value = "";
    mostrarErro(problema);
    return;
  }

  liberarPrevia();
  fotoSelecionada = arquivo;
  urlPrevia = URL.createObjectURL(arquivo);
  previa.src = urlPrevia;

  esconderErro();
  definirEstado("pronto");

  // Em telas pequenas o botão fica abaixo das dicas: leva o usuário até ele
  if (ehTelaPequena()) {
    requestAnimationFrame(() =>
      botaoAnalisar.scrollIntoView({ behavior: preferePoucoMovimento() ? "auto" : "smooth", block: "center" })
    );
  }
}

/** Só aceitamos uma nova foto antes da análise (não durante, nem depois do resultado). */
const podeReceberFoto = () => estado === "vazio" || estado === "pronto";

/** O evento de arrastar traz arquivos (e não, por exemplo, texto selecionado)? */
function trazArquivos(evento) {
  const tipos = evento.dataTransfer ? Array.from(evento.dataTransfer.types || []) : [];
  return tipos.includes("Files");
}

/**
 * Liga/desliga o destaque de "solte aqui". Vai no quadro inteiro e na zona de
 * envio, para aparecer também quando já existe uma foto (estado "pronto").
 */
function marcarArrasto(ativo) {
  quadroArea.classList.toggle("arrastando", ativo);
  zonaEnvio.classList.toggle("arrastando", ativo);
}

function ligarEscolhaDeFoto() {
  // Clique: o <input type="file"> dentro da zona de envio
  campoFoto.addEventListener("change", () => selecionarFoto(campoFoto.files[0]));

  // "Trocar foto" abre o seletor de arquivos
  trocarFoto.addEventListener("click", () => campoFoto.click());

  // Arrastar e soltar: o quadro inteiro é a área de soltar
  quadroArea.addEventListener("dragenter", (e) => {
    if (!trazArquivos(e)) return;
    e.preventDefault();
    contadorArrasto += 1;
    if (podeReceberFoto()) marcarArrasto(true);
  });
  quadroArea.addEventListener("dragover", (e) => {
    if (!trazArquivos(e)) return;
    e.preventDefault(); // sem isso o navegador não deixa soltar
    e.dataTransfer.dropEffect = podeReceberFoto() ? "copy" : "none";
  });
  quadroArea.addEventListener("dragleave", (e) => {
    if (!trazArquivos(e)) return;
    contadorArrasto = Math.max(0, contadorArrasto - 1);
    if (contadorArrasto === 0) marcarArrasto(false);
  });
  quadroArea.addEventListener("drop", (e) => {
    e.preventDefault();
    contadorArrasto = 0;
    marcarArrasto(false);
    if (!podeReceberFoto()) return;
    const arquivo = e.dataTransfer.files[0];
    if (arquivo) selecionarFoto(arquivo);
    else mostrarErro("Solte um arquivo de imagem (JPG, PNG ou WEBP).");
  });

  // Soltar um arquivo fora do quadro não deve abrir a foto no navegador
  ["dragover", "drop"].forEach((nome) =>
    window.addEventListener(nome, (e) => {
      if (trazArquivos(e)) e.preventDefault();
    })
  );

  // Colar (Ctrl+V) uma imagem da área de transferência
  document.addEventListener("paste", (e) => {
    if (!podeReceberFoto() || !e.clipboardData) return;
    const imagem = Array.from(e.clipboardData.files || []).find((f) => f.type.startsWith("image/"));
    if (!imagem) return;
    e.preventDefault();
    selecionarFoto(imagem);
  });
}

// ---------------------------------------------------------------------------
// Envio para o back-end
// ---------------------------------------------------------------------------

/** Erro com mensagem já pronta para mostrar ao usuário. */
class ErroDeAnalise extends Error {}

/** Envia a foto e devolve o JSON da resposta (ou lança ErroDeAnalise). */
async function enviarFoto(arquivo) {
  const formulario = new FormData();
  formulario.append("foto", arquivo); // "foto" é o nome do campo esperado pela API

  let resposta;
  try {
    resposta = await fetch(URL_API, { method: "POST", body: formulario });
  } catch (erro) {
    throw new ErroDeAnalise(MSG_SEM_CONEXAO);
  }

  // O corpo pode não ser JSON (ex.: erro 500 do servidor)
  let dados = null;
  try {
    dados = await resposta.json();
  } catch (erro) {
    dados = null;
  }

  if (!resposta.ok) {
    const detalhe = dados && typeof dados.detail === "string" ? dados.detail : MSG_ERRO_GENERICO;
    throw new ErroDeAnalise(detalhe);
  }
  return dados;
}

/** Clique em "Analisar postura". */
async function analisar() {
  if (!fotoSelecionada || estado !== "pronto") return;

  esconderErro();
  definirEstado("analisando");

  try {
    // A análise e um tempo mínimo correm juntos: a varredura sempre aparece
    const [dados] = await Promise.all([enviarFoto(fotoSelecionada), esperar(TEMPO_MINIMO_ANALISE)]);
    await exibirResultado(dados);
  } catch (erro) {
    definirEstado("pronto"); // volta para o usuário tentar de novo
    mostrarErro(erro instanceof ErroDeAnalise ? erro.message : "A resposta do servidor veio em um formato inesperado.");
  }
}

// ---------------------------------------------------------------------------
// Validação da resposta
// ---------------------------------------------------------------------------

const ehNumero = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Confere se a resposta tem tudo o que precisamos para mostrar o resultado.
 * Lança um erro simples se algo estiver faltando.
 */
function validarResposta(dados) {
  const r = dados && dados.resultado;
  const ok =
    r &&
    r.pescoco &&
    r.tronco &&
    r.limites &&
    r.limites.pescoco &&
    r.limites.tronco &&
    ehNumero(r.limites.pescoco.adequada) &&
    ehNumero(r.limites.pescoco.atencao) &&
    ehNumero(r.limites.tronco.adequada) &&
    ehNumero(r.limites.tronco.atencao) &&
    CLASSES[r.geral] &&
    CLASSES[r.pescoco.classificacao] &&
    CLASSES[r.tronco.classificacao] &&
    ehNumero(r.pescoco.angulo) &&
    ehNumero(r.tronco.angulo) &&
    typeof dados.imagem === "string" &&
    dados.imagem.startsWith("data:image/");
  if (!ok) throw new Error("resposta inesperada");
}

// ---------------------------------------------------------------------------
// Ficha de avaliação (a parte em texto do resultado)
// ---------------------------------------------------------------------------

/** Cria um elemento SVG com atributos e o coloca dentro do pai. */
function criarSvg(tag, atributos, pai) {
  const elemento = document.createElementNS(NS_SVG, tag);
  Object.keys(atributos || {}).forEach((nome) => elemento.setAttribute(nome, atributos[nome]));
  if (pai) pai.appendChild(elemento);
  return elemento;
}

/** Ícone do sprite (<symbol id="i-...">) como <svg><use/></svg>. */
function criarIcone(idSimbolo, tamanho) {
  const svg = criarSvg("svg", {
    class: "icone",
    width: tamanho,
    height: tamanho,
    "aria-hidden": "true",
    focusable: "false",
  });
  criarSvg("use", { href: `#${idSimbolo}` }, svg);
  return svg;
}

/** Esvazia um elemento e coloca "ícone + texto" nele. */
function preencherComIcone(elemento, idSimbolo, texto, tamanho) {
  elemento.replaceChildren();
  elemento.appendChild(criarIcone(idSimbolo, tamanho));
  const span = document.createElement("span");
  span.textContent = texto;
  elemento.appendChild(span);
  return span;
}

/**
 * Monta a régua colorida de um indicador: de 0° até 1,5 x o limite de "atenção".
 * Ângulos acima disso ficam com o marcador no fim da barra. O limite "ideal"
 * (fim da faixa adequada) ganha um risco sobre a régua e um rótulo na escala.
 */
function montarRegua(recipiente, angulo, limite) {
  const maximo = limite.atencao * 1.5;
  const pct = (valor) => (Math.min(Math.max(valor, 0), maximo) / maximo) * 100;

  recipiente.replaceChildren();
  // A régua é um desenho: quem usa leitor de tela ouve a leitura e os limites num texto só
  recipiente.setAttribute("role", "img");
  recipiente.setAttribute(
    "aria-label",
    `Medida de ${Math.round(angulo)} graus. Ideal até ${limite.adequada} graus; atenção até ${limite.atencao} graus.`
  );

  const faixas = document.createElement("div");
  faixas.className = "regua-faixas";
  [
    ["f-adequada", pct(limite.adequada)],
    ["f-atencao", pct(limite.atencao) - pct(limite.adequada)],
    ["f-inadequada", 100 - pct(limite.atencao)],
  ].forEach(([classe, largura]) => {
    const faixa = document.createElement("span");
    faixa.className = `faixa ${classe}`;
    faixa.style.width = `${largura}%`;
    faixas.appendChild(faixa);
  });

  const marcador = document.createElement("span");
  marcador.className = "regua-marcador";
  marcador.style.left = `${pct(angulo)}%`;

  const limiteIdeal = document.createElement("span");
  limiteIdeal.className = "regua-limite";
  limiteIdeal.style.left = `${pct(limite.adequada)}%`;

  const escala = document.createElement("div");
  escala.className = "regua-escala";
  [
    [0, "0°", ""],
    [pct(limite.adequada), `ideal até ${limite.adequada}°`, "e-ideal"],
    [pct(limite.atencao), `${limite.atencao}°`, ""],
  ].forEach(([posicao, texto, classe]) => {
    const marca = document.createElement("span");
    marca.style.left = `${posicao}%`;
    marca.textContent = texto;
    if (classe) marca.className = classe;
    escala.appendChild(marca);
  });

  recipiente.append(faixas, limiteIdeal, marcador, escala);
  return { marcador, posicao: pct(angulo) };
}

/** Preenche uma linha de medida da ficha (pescoço ou tronco). */
function preencherMedida(parte, dados, limite) {
  const linha = $(`linha-${parte}`);
  const info = CLASSES[dados.classificacao];

  linha.dataset.classe = dados.classificacao;

  const valor = $(`${parte}-valor`);
  valor.textContent = `${Math.round(dados.angulo)}°`;

  const selo = $(`${parte}-selo`);
  selo.dataset.classe = dados.classificacao;
  preencherComIcone(selo, info.icone, info.rotulo, 16);

  const regua = montarRegua($(`${parte}-regua`), dados.angulo, limite);

  $(`${parte}-mensagem`).textContent = dados.mensagem || "";

  return { valor, marcador: regua.marcador, posicaoMarcador: regua.posicao, angulo: Math.round(dados.angulo) };
}

/** Preenche toda a ficha: veredito, medidas, recomendações, legenda e link de download. */
function preencherFicha(dados) {
  const r = dados.resultado;

  // Veredito geral
  const veredito = VEREDITO[r.geral];
  linhaGeral.dataset.classe = r.geral;
  preencherComIcone($("geral-valor"), CLASSES[r.geral].icone, veredito.titulo, 28);
  $("geral-texto").textContent = veredito.texto;

  // Lado medido, no cabeçalho da ficha (só os dois valores que a API devolve)
  fichaLado.textContent = r.lado === "direito" || r.lado === "esquerdo" ? `Perfil ${r.lado}` : "";

  // Pescoço e tronco
  const medidas = {
    pescoco: preencherMedida("pescoco", r.pescoco, r.limites.pescoco),
    tronco: preencherMedida("tronco", r.tronco, r.limites.tronco),
  };

  // A legenda do quadro usa as mesmas cores com que a foto foi traçada
  ["pescoco", "tronco"].forEach((parte) => {
    const item = legendaQuadro.querySelector(`[data-parte="${parte}"]`);
    if (item) item.dataset.classe = r[parte].classificacao;
  });

  // Recomendações (as do pescoço e as do tronco, sem repetir)
  const lista = [...(r.pescoco.recomendacoes || []), ...(r.tronco.recomendacoes || [])];
  const unicas = lista.filter((texto, i) => typeof texto === "string" && lista.indexOf(texto) === i);
  if (unicas.length === 0) unicas.push(RECOMENDACAO_PADRAO);

  const ul = $("lista-recomendacoes");
  ul.replaceChildren();
  unicas.forEach((texto) => {
    const item = document.createElement("li");
    preencherComIcone(item, "i-ok", texto, 20);
    ul.appendChild(item);
  });

  // Link para baixar a imagem traçada (a resposta já foi validada)
  baixarImagem.href = dados.imagem;

  return medidas;
}

// ---------------------------------------------------------------------------
// Animação de revelação (Web Animations API)
// ---------------------------------------------------------------------------

/** Cancela tudo que a animação anterior deixou rodando. */
function cancelarAnimacoes() {
  geracaoAnimacao += 1;
  animacoes.forEach((a) => {
    try {
      a.cancel();
    } catch (erro) {
      /* animação já terminou */
    }
  });
  temporizadores.forEach((t) => clearTimeout(t));
  animacoes = [];
  temporizadores = [];
  linhaRevelacao.hidden = true;
}

/** element.animate() guardando a animação para poder cancelar depois. */
function animar(elemento, quadros, opcoes) {
  if (!elemento || typeof elemento.animate !== "function") return null;
  // fill "backwards": antes do atraso acabar, o elemento já mostra o valor inicial
  const animacao = elemento.animate(quadros, { fill: "backwards", easing: EASE_OUT_EXPO, ...opcoes });
  animacoes.push(animacao);
  return animacao;
}

/**
 * Conta de 0 até um valor, escrevendo no elemento. O texto final é sempre
 * garantido por um temporizador, mesmo se a aba estiver em segundo plano.
 */
function contar(elemento, ate, atraso, duracao, formatar) {
  const geracao = geracaoAnimacao;
  elemento.textContent = formatar(0);

  const terminar = () => {
    if (geracao === geracaoAnimacao) elemento.textContent = formatar(ate);
  };
  temporizadores.push(setTimeout(terminar, atraso + duracao + 80));

  const inicio = performance.now() + atraso;
  const passo = (agora) => {
    if (geracao !== geracaoAnimacao) return;
    const t = Math.min(1, Math.max(0, (agora - inicio) / duracao));
    const suave = t === 1 ? 1 : 1 - Math.pow(2, -10 * t); // ease-out-expo
    elemento.textContent = formatar(Math.round(ate * suave));
    if (t < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

/**
 * A animação assinatura, rodada uma vez por resultado: a foto traçada é
 * revelada de cima para baixo, com a linha teal na borda inferior, enquanto
 * os ângulos da ficha contam a partir de 0° e os marcadores deslizam até a
 * leitura. Tudo com a mesma duração e curva, então anda em sincronia.
 * O conteúdo já está no estado final no DOM; aqui só animamos a partir de um
 * valor inicial, então nada fica invisível se a animação falhar.
 */
function revelarResultado(medidas) {
  if (preferePoucoMovimento()) return;
  if (typeof fotoResultado.animate !== "function") return;

  const geracao = geracaoAnimacao;

  // 1. Foto: recorte de cima para baixo (a folga de 2px mantém a moldura
  //    e o contorno visíveis desde o início)
  animar(
    fotoResultado,
    [{ clipPath: "inset(-2px -2px 100% -2px)" }, { clipPath: "inset(-2px)" }],
    { duration: DURACAO_REVELACAO }
  );

  // 2. Linha teal: posicionada sobre a foto e descendo junto com o recorte
  const caixaPalco = palco.getBoundingClientRect();
  const caixaFoto = fotoResultado.getBoundingClientRect();
  if (caixaFoto.width && caixaFoto.height) {
    linhaRevelacao.style.left = `${caixaFoto.left - caixaPalco.left}px`;
    linhaRevelacao.style.top = `${caixaFoto.top - caixaPalco.top}px`;
    linhaRevelacao.style.width = `${caixaFoto.width}px`;
    linhaRevelacao.hidden = false;
    const descida = animar(
      linhaRevelacao,
      [{ transform: "translateY(0)" }, { transform: `translateY(${caixaFoto.height}px)` }],
      { duration: DURACAO_REVELACAO }
    );
    if (descida) {
      descida.finished
        .then(() => {
          if (geracao === geracaoAnimacao) linhaRevelacao.hidden = true;
        })
        .catch(() => {
          /* cancelada: o cancelarAnimacoes já escondeu a linha */
        });
    } else {
      linhaRevelacao.hidden = true;
    }
  }

  // 3. Ficha: valores contam de 0° ao ângulo e os marcadores deslizam
  Object.keys(medidas).forEach((parte) => {
    const m = medidas[parte];
    contar(m.valor, m.angulo, 0, DURACAO_REVELACAO, (n) => `${n}°`);
    animar(m.marcador, [{ left: "0%" }, { left: `${m.posicaoMarcador}%` }], { duration: DURACAO_REVELACAO });
  });
}

// ---------------------------------------------------------------------------
// Pista de rolagem da ficha
// ---------------------------------------------------------------------------

let jaRolouFicha = false; // a pessoa já rolou a ficha neste resultado?

/**
 * Em telas largas a ficha rola por dentro. Se ainda há conteúdo abaixo, o CSS
 * mostra a linha "Role para ver mais" no rodapé (classe dica-mais), que some
 * depois da primeira rolagem. A classe tem-mais marca "ainda há conteúdo abaixo".
 */
function atualizarPistaDeRolagem() {
  // A linha da dica ocupa espaço na ficha: descontamos a altura dela para não oscilar
  const alturaDica = ficha.classList.contains("dica-mais") ? maisAbaixo.offsetHeight : 0;
  const falta = ficha.scrollHeight - ficha.clientHeight - ficha.scrollTop - alturaDica;
  const temMais = estado === "resultado" && falta > 4;
  if (ficha.scrollTop > 8) jaRolouFicha = true;
  ficha.classList.toggle("tem-mais", temMais);
  ficha.classList.toggle("dica-mais", temMais && !jaRolouFicha);
}

function ligarPistaDeRolagem() {
  ficha.addEventListener("scroll", atualizarPistaDeRolagem, { passive: true });
  window.addEventListener("resize", atualizarPistaDeRolagem);
  // A dica também serve de atalho: leva o olhar para as recomendações
  maisAbaixo.addEventListener("click", () =>
    ficha.scrollBy({ top: ficha.clientHeight * 0.6, behavior: preferePoucoMovimento() ? "auto" : "smooth" })
  );
  if ("ResizeObserver" in window) new ResizeObserver(atualizarPistaDeRolagem).observe(fichaResultado);
}

// ---------------------------------------------------------------------------
// Mostrar o resultado
// ---------------------------------------------------------------------------

/** Mostra o resultado: a foto traçada, a ficha e a animação de revelação. */
async function exibirResultado(dados) {
  validarResposta(dados);

  cancelarAnimacoes();

  // A foto já vem traçada pelo back-end: só a colocamos no palco
  fotoResultado.src = dados.imagem;
  try {
    await fotoResultado.decode(); // espera a imagem estar pronta para não "piscar"
  } catch (erro) {
    /* sem decode(): o navegador carrega a imagem normalmente */
  }

  const medidas = preencherFicha(dados);

  // Troca de tela
  definirEstado("resultado");
  jaRolouFicha = false;
  atualizarPistaDeRolagem();

  // Em telas pequenas, mostra o quadro antes (a ficha fica abaixo dele)
  if (ehTelaPequena()) {
    document
      .querySelector(".quadro")
      .scrollIntoView({ behavior: preferePoucoMovimento() ? "auto" : "smooth", block: "start" });
  }

  // Leitores de tela anunciam o resultado geral
  linhaGeral.focus({ preventScroll: true });

  // A animação começa no próximo quadro, depois que o layout do palco existe
  requestAnimationFrame(() => {
    revelarResultado(medidas);
    atualizarPistaDeRolagem();
  });
}

// ---------------------------------------------------------------------------
// "Analisar outra foto": volta ao começo
// ---------------------------------------------------------------------------

function recomecar() {
  cancelarAnimacoes();

  fotoSelecionada = null;
  campoFoto.value = "";
  liberarPrevia();
  previa.removeAttribute("src");
  fotoResultado.removeAttribute("src");
  baixarImagem.removeAttribute("href");

  esconderErro();
  fichaLado.textContent = "";
  definirEstado("vazio");
  atualizarPistaDeRolagem();

  const comoPoucoMovimento = preferePoucoMovimento();
  secaoAnalisar.scrollIntoView({ behavior: comoPoucoMovimento ? "auto" : "smooth", block: "start" });
  campoFoto.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Navegação: destaca o link da seção que está na tela
// ---------------------------------------------------------------------------

function ligarNavegacao() {
  const links = Array.from(document.querySelectorAll(".navegacao a[href^='#']"));
  const secoes = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  if (links.length === 0 || secoes.length === 0) return;

  // As seções precisam estar na ordem em que aparecem na página
  secoes.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  const marcar = (idSecao) => {
    links.forEach((a) => {
      const ativo = a.getAttribute("href") === `#${idSecao}`;
      a.classList.toggle("ativo", ativo);
      if (ativo) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  };

  // Linha de leitura: um pouco abaixo da barra do topo. A seção ativa é a última
  // cujo topo já passou dessa linha. Na abertura (antes da primeira seção) nenhum
  // link fica ativo; "Por que importa", "Analisar", "Como funciona" e "Sobre"
  // assumem quando chegam. No fim da página a última seção (curta) vence, mesmo
  // sem alcançar a linha.
  const atualizar = () => {
    const topo = document.querySelector(".topo");
    const barra = topo && getComputedStyle(topo).position === "sticky" ? topo.offsetHeight : 0;
    const linhaLeitura = barra + (window.innerHeight - barra) * 0.3;
    const noFim = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;

    let ativa = null;
    secoes.forEach((secao) => {
      if (secao.getBoundingClientRect().top <= linhaLeitura) ativa = secao;
    });
    if (noFim) ativa = secoes[secoes.length - 1];
    marcar(ativa ? ativa.id : "");
  };

  // Uma checagem por quadro de tela, não uma por evento de rolagem
  let agendada = false;
  const agendar = () => {
    if (agendada) return;
    agendada = true;
    requestAnimationFrame(() => {
      agendada = false;
      atualizar();
    });
  };
  window.addEventListener("scroll", agendar, { passive: true });
  window.addEventListener("resize", agendar);
  window.addEventListener("hashchange", agendar);
  atualizar();
}

// ---------------------------------------------------------------------------
// Âncoras: botões e links que levam a uma seção da própria página
// ---------------------------------------------------------------------------

/**
 * Rolagem suave até a seção (ou instantânea, se o usuário pediu menos movimento),
 * com o endereço atualizado e o foco levado para a seção, para quem usa teclado
 * ou leitor de tela continuar de onde chegou.
 */
function ligarAncoras() {
  document.addEventListener("click", (e) => {
    const link = e.target instanceof Element ? e.target.closest("a[href^='#']") : null;
    if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

    const id = link.getAttribute("href").slice(1);
    const alvo = id ? document.getElementById(id) : null;
    if (!alvo) return;

    e.preventDefault();
    alvo.scrollIntoView({ behavior: preferePoucoMovimento() ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    if (!alvo.hasAttribute("tabindex")) alvo.setAttribute("tabindex", "-1");
    alvo.focus({ preventScroll: true });
  });
}

// ---------------------------------------------------------------------------
// Abertura: os graus do desenho contam a partir de zero
// ---------------------------------------------------------------------------

// Espera (ms) até cada letreiro aparecer: igual ao --d do CSS (.rot-pescoco, .rot-tronco)
const ATRASO_GRAUS_HERO = { pescoco: 1350, tronco: 1450 };
const DURACAO_GRAUS_HERO = 500;

/**
 * O desenho da abertura se desenha sozinho pelo CSS (traços e arcos). Aqui só os
 * números contam de 0° até o valor, sincronizados com os arcos. O valor final já
 * está no HTML; sem animação (movimento reduzido) nada é mexido, e um
 * temporizador garante o texto final mesmo se a aba estiver em segundo plano.
 */
function animarGrausHero() {
  if (preferePoucoMovimento()) return;

  document.querySelectorAll(".hero-svg [data-contar]").forEach((texto) => {
    const alvo = Number(texto.dataset.contar);
    if (!Number.isFinite(alvo)) return;
    const parte = texto.closest(".rot-tronco") ? "tronco" : "pescoco";
    const atraso = ATRASO_GRAUS_HERO[parte];

    texto.textContent = "0°";
    setTimeout(() => {
      texto.textContent = `${alvo}°`;
    }, atraso + DURACAO_GRAUS_HERO + 80);

    const inicio = performance.now() + atraso;
    const passo = (agora) => {
      const t = Math.min(1, Math.max(0, (agora - inicio) / DURACAO_GRAUS_HERO));
      const suave = t === 1 ? 1 : 1 - Math.pow(2, -10 * t); // ease-out-expo
      texto.textContent = `${Math.round(alvo * suave)}°`;
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  });
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------

function iniciar() {
  // Data de hoje na ficha (dd/mm/aaaa)
  $("ficha-data").textContent = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // Permite focar a linha de resultado por código (leitores de tela)
  linhaGeral.setAttribute("tabindex", "-1");

  ligarEscolhaDeFoto();
  ligarAncoras();
  ligarNavegacao();
  ligarPistaDeRolagem();
  animarGrausHero();

  botaoAnalisar.addEventListener("click", analisar);
  botaoNova.addEventListener("click", recomecar);

  definirEstado("vazio");
}

iniciar();
