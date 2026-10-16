/*
  app.js
  Comportamento da interface:
    - permite escolher a foto (clique ou arrastar e soltar) e mostra uma prévia;
    - envia a foto para o back-end (POST /api/analisar);
    - exibe a imagem com o esqueleto, os ângulos (com uma régua colorida),
      os alertas e as recomendações;
    - atualiza a barra de etapas (Foto → Análise → Resultado).
*/

// Endereço da API. Como o próprio back-end serve esta página, basta o caminho relativo.
const URL_API = "/api/analisar";

// Textos amigáveis para cada classificação devolvida pelo back-end
const ROTULOS = {
  adequada: "Adequada",
  atencao: "Atenção",
  inadequada: "Inadequada",
};

// Ícone, título e explicação da faixa de resumo geral
const RESUMO_GERAL = {
  adequada: { icone: "✅", titulo: "Muito bem! Sua postura está adequada.", texto: "Continue assim e lembre-se de fazer pausas." },
  atencao: { icone: "⚠️", titulo: "Sua postura merece atenção.", texto: "Pequenos ajustes já fazem diferença. Veja as dicas abaixo." },
  inadequada: { icone: "❌", titulo: "Sua postura pode estar prejudicando sua saúde.", texto: "Siga as dicas abaixo para aliviar o pescoço e a coluna." },
};

// Referências aos elementos da página
const campoFoto = document.getElementById("campo-foto");
const areaUpload = document.getElementById("area-upload");
const previa = document.getElementById("previa");
const textoUpload = document.getElementById("texto-upload");
const trocarFoto = document.getElementById("trocar-foto");
const botaoAnalisar = document.getElementById("botao-analisar");
const mensagemErro = document.getElementById("mensagem-erro");
const secaoEnvio = document.getElementById("secao-envio");
const secaoResultado = document.getElementById("secao-resultado");
const botaoNova = document.getElementById("botao-nova");

// Foto escolhida pelo usuário (objeto File)
let fotoSelecionada = null;

/**
 * Marca na barra de etapas qual passo está ativo (1, 2 ou 3).
 * Os passos anteriores ficam marcados como "feitos".
 */
function definirEtapa(numero) {
  [1, 2, 3].forEach((n) => {
    const item = document.getElementById(`etapa-${n}`);
    item.classList.toggle("ativa", n === numero);
    item.classList.toggle("feita", n < numero);
  });
}

/** Guarda a foto escolhida, mostra a prévia e habilita o botão de análise. */
function selecionarFoto(arquivo) {
  if (!arquivo || !arquivo.type.startsWith("image/")) {
    mostrarErro("Escolha um arquivo de imagem (JPG ou PNG).");
    return;
  }
  fotoSelecionada = arquivo;
  // Libera da memória a prévia anterior (se houver) antes de criar a nova
  if (previa.src) URL.revokeObjectURL(previa.src);
  previa.src = URL.createObjectURL(arquivo);
  previa.hidden = false;
  trocarFoto.hidden = false;
  textoUpload.hidden = true;
  botaoAnalisar.disabled = false;
  esconderErro();
}

/** Mostra uma mensagem de erro na caixa vermelha abaixo do botão. */
function mostrarErro(texto) {
  mensagemErro.textContent = texto;
  mensagemErro.hidden = false;
}

/** Esconde a caixa de erro. */
function esconderErro() {
  mensagemErro.hidden = true;
}

// --- Escolha da foto por clique ---
campoFoto.addEventListener("change", () => selecionarFoto(campoFoto.files[0]));

// --- Escolha da foto arrastando e soltando ---
["dragenter", "dragover"].forEach((evento) =>
  areaUpload.addEventListener(evento, (e) => {
    e.preventDefault();
    areaUpload.classList.add("arrastando");
  })
);
["dragleave", "drop"].forEach((evento) =>
  areaUpload.addEventListener(evento, (e) => {
    e.preventDefault();
    areaUpload.classList.remove("arrastando");
  })
);
areaUpload.addEventListener("drop", (e) => selecionarFoto(e.dataTransfer.files[0]));

// --- Envio para o back-end ---
botaoAnalisar.addEventListener("click", async () => {
  if (!fotoSelecionada) return;

  // Estado de "carregando": desabilita o botão e avança a barra para a etapa 2
  botaoAnalisar.disabled = true;
  botaoAnalisar.textContent = "Analisando sua postura...";
  botaoAnalisar.classList.add("carregando");
  definirEtapa(2);
  esconderErro();

  try {
    // Monta o formulário com o campo "foto", que é o nome esperado pela API
    const formulario = new FormData();
    formulario.append("foto", fotoSelecionada);

    const resposta = await fetch(URL_API, { method: "POST", body: formulario });
    const dados = await resposta.json();

    // Erros tratados pelo back-end vêm no campo "detail"
    if (!resposta.ok) throw new Error(dados.detail || "Não foi possível analisar a foto.");

    exibirResultado(dados);
  } catch (erro) {
    definirEtapa(1); // volta para a etapa da foto, para o usuário tentar de novo
    const semConexao = erro instanceof TypeError; // fetch falhou: servidor fora do ar
    mostrarErro(semConexao ? "Não foi possível conectar ao servidor. Verifique se o back-end está rodando." : erro.message);
  } finally {
    botaoAnalisar.disabled = false;
    botaoAnalisar.textContent = "Analisar minha postura";
    botaoAnalisar.classList.remove("carregando");
  }
});

/**
 * Monta o HTML da régua colorida de um indicador.
 * A régua vai de 0° até 1,5 × o limite de "atenção" (ex.: pescoço 0°–60°);
 * ângulos maiores que isso ficam com o marcador no fim da barra.
 */
function montarRegua(angulo, limite) {
  const maximo = limite.atencao * 1.5;
  const pct = (valor) => (Math.min(valor, maximo) / maximo) * 100;

  return `
    <div class="regua" aria-hidden="true">
      <div class="regua-barra">
        <div style="width:${pct(limite.adequada)}%"></div>
        <div style="width:${pct(limite.atencao) - pct(limite.adequada)}%"></div>
        <div style="width:${100 - pct(limite.atencao)}%"></div>
        <span class="regua-marcador" style="left:${pct(angulo)}%"></span>
      </div>
      <div class="regua-legenda">
        <span style="left:0">0°</span>
        <span style="left:${pct(limite.adequada)}%">${limite.adequada}°</span>
        <span style="left:${pct(limite.atencao)}%">${limite.atencao}°</span>
      </div>
    </div>
  `;
}

/** Preenche um cartão de indicador (pescoço ou tronco). */
function preencherIndicador(elemento, titulo, dados, limite) {
  elemento.innerHTML = `
    <div class="indicador-topo">
      <h4>${titulo}</h4>
      <span class="selo ${dados.classificacao}">${ROTULOS[dados.classificacao]}</span>
    </div>
    <div class="valor">${Math.round(dados.angulo)}° <small>de inclinação</small></div>
    ${montarRegua(dados.angulo, limite)}
    <p>${dados.mensagem} <small>Ideal: até ${limite.adequada}°.</small></p>
  `;
}

/** Mostra a seção de resultado com os dados devolvidos pela API. */
function exibirResultado({ resultado, imagem }) {
  // Imagem anotada (já vem pronta em base64 do back-end); o mesmo endereço
  // serve para o link "Baixar imagem"
  document.getElementById("imagem-resultado").src = imagem;
  document.getElementById("baixar-imagem").href = imagem;

  // Faixa com o resumo geral
  const resumo = RESUMO_GERAL[resultado.geral];
  document.getElementById("faixa-geral").className = `faixa ${resultado.geral}`;
  document.getElementById("faixa-icone").textContent = resumo.icone;
  document.getElementById("faixa-titulo").textContent = resumo.titulo;
  document.getElementById("faixa-texto").textContent = resumo.texto;

  // Cartões de pescoço e tronco
  preencherIndicador(document.getElementById("indicador-pescoco"), "Pescoço", resultado.pescoco, resultado.limites.pescoco);
  preencherIndicador(document.getElementById("indicador-tronco"), "Tronco (coluna)", resultado.tronco, resultado.limites.tronco);

  // Recomendações (junta as do pescoço e do tronco)
  const recomendacoes = [...resultado.pescoco.recomendacoes, ...resultado.tronco.recomendacoes];
  if (recomendacoes.length === 0) {
    recomendacoes.push("Continue assim! Lembre-se de levantar e alongar o corpo a cada 50 minutos.");
  }
  const lista = document.getElementById("lista-recomendacoes");
  lista.innerHTML = "";
  recomendacoes.forEach((texto) => {
    const item = document.createElement("li");
    item.textContent = texto;
    lista.appendChild(item);
  });

  // Troca de tela: esconde o envio, mostra o resultado e avança para a etapa 3
  secaoEnvio.hidden = true;
  secaoResultado.hidden = false;
  definirEtapa(3);
  secaoResultado.scrollIntoView({ behavior: "smooth" });
}

// --- Botão "Analisar outra foto": volta ao estado inicial ---
botaoNova.addEventListener("click", () => {
  fotoSelecionada = null;
  campoFoto.value = "";
  previa.hidden = true;
  trocarFoto.hidden = true;
  textoUpload.hidden = false;
  botaoAnalisar.disabled = true;
  secaoResultado.hidden = true;
  secaoEnvio.hidden = false;
  definirEtapa(1);
  window.scrollTo({ top: 0, behavior: "smooth" });
});
