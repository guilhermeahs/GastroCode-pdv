const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const DEFAULT_PRINT_CONFIG = {
  estabelecimento_nome: "",
  estabelecimento_documento: "",
  estabelecimento_telefone: "",
  estabelecimento_endereco: "",
  estabelecimento_cidade_uf: "",
  largura_papel_mm: 80,
  metodo_impressao: "NAVEGADOR",
  impressora_nome: "",
  linhas_feed_final: 6,
  cortar_papel: true,
  mostrar_logo: false,
  logo_data_url: "",
  logo_largura_mm: 34,
  logo_alto_contraste: true,
  exibir_cabecalho: true,
  mostrar_cliente: true,
  mostrar_data_hora: true,
  mostrar_forma_pagamento: true,
  mensagem_rodape: "Obrigado pela preferencia."
};

function moeda(valor) {
  const numero = Number(valor || 0);
  const formatado = Number.isFinite(numero)
    ? numero.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    : "0,00";
  return `R$${formatado}`;
}

function moedaNumero(valor) {
  const numero = Number(valor || 0);
  if (!Number.isFinite(numero)) return "0,00";
  return numero.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function moedaAlinhada(valor, larguraCampo = 11) {
  const numero = moedaNumero(valor);
  const espacoNumero = Math.max(1, Number(larguraCampo || 11) - 2);
  return `R$${padLeft(numero, espacoNumero)}`;
}

function formatarFormaPagamento(forma) {
  const code = String(forma || "").toUpperCase();
  if (code === "PIX") return "Pix";
  if (code === "CREDITO") return "Cartao de credito";
  if (code === "DEBITO") return "Cartao de debito";
  if (code === "DINHEIRO") return "Dinheiro";
  if (code === "MISTO") return "Misto";
  return code || "Nao informado";
}

function normalizarListaPagamentos(pagamento = null, pedido = null) {
  const origem =
    (Array.isArray(pagamento?.pagamentos) && pagamento.pagamentos) ||
    (Array.isArray(pedido?.pagamentos) && pedido.pagamentos) ||
    [];

  return origem
    .map((item) => ({
      forma_pagamento: String(item?.forma_pagamento || "").toUpperCase(),
      valor: Number(item?.valor || 0),
      valor_recebido:
        item?.valor_recebido === null || item?.valor_recebido === undefined
          ? null
          : Number(item.valor_recebido),
      troco: Number(item?.troco || 0)
    }))
    .filter((item) => item.forma_pagamento && Number.isFinite(item.valor) && item.valor > 0);
}

function escapeHtml(valor) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function limparTextoTermica(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\u202F/g, " ")
    .replace(/[\u2000-\u200F\u2060\uFEFF]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function normalizarConfig(config) {
  const merged = { ...DEFAULT_PRINT_CONFIG, ...(config || {}) };
  const largura = Number(merged.largura_papel_mm) === 58 ? 58 : 80;
  const logoDataUrlRaw = String(merged.logo_data_url || "");
  const logoDataUrl =
    logoDataUrlRaw.startsWith("data:image/") && logoDataUrlRaw.length <= 900000 ? logoDataUrlRaw : "";
  return {
    ...merged,
    largura_papel_mm: largura,
    metodo_impressao: String(merged.metodo_impressao || "").toUpperCase() === "DIRETA" ? "DIRETA" : "NAVEGADOR",
    impressora_nome: String(merged.impressora_nome || "").trim(),
    linhas_feed_final: Math.max(2, Math.min(12, Number(merged.linhas_feed_final || 6) || 6)),
    cortar_papel: merged.cortar_papel !== false,
    mostrar_logo: Boolean(merged.mostrar_logo) && Boolean(logoDataUrl),
    logo_data_url: logoDataUrl,
    logo_largura_mm: Math.max(18, Math.min(58, Number(merged.logo_largura_mm || 34) || 34)),
    logo_alto_contraste: merged.logo_alto_contraste !== false
  };
}

function roleAtivo() {
  return String(localStorage.getItem("role") || "GERENTE").toUpperCase();
}

async function tentarImpressaoDireta(conteudo, config) {
  if (config.metodo_impressao !== "DIRETA") return false;

  if (!config.impressora_nome) {
    alert("Selecione uma impressora para usar o modo de impressao direta.");
    return false;
  }

  try {
    const response = await fetch(`${BASE_URL}/api/impressao/imprimir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-role": roleAtivo()
      },
      body: JSON.stringify({
        impressora: config.impressora_nome,
        conteudo,
        largura_papel_mm: config.largura_papel_mm,
        linhas_feed_final: config.linhas_feed_final,
        cortar_papel: config.cortar_papel
      })
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(raw || "Falha na impressao direta.");
    }

    return true;
  } catch (error) {
    alert(
      `Nao foi possivel imprimir direto em "${config.impressora_nome}". Abrindo impressao do navegador.\n\n${
        error.message || "Erro desconhecido."
      }`
    );
    return false;
  }
}

function abrirJanelaImpressao() {
  const janela = window.open("", "_blank", "width=520,height=760");
  if (!janela) {
    alert("Nao foi possivel abrir a janela de impressao.");
    return null;
  }
  return janela;
}

function linhaCabecalho(config) {
  const linhas = [];
  if (config.estabelecimento_nome) linhas.push(`<div>${escapeHtml(config.estabelecimento_nome)}</div>`);
  if (config.estabelecimento_documento) linhas.push(`<div>${escapeHtml(config.estabelecimento_documento)}</div>`);
  if (config.estabelecimento_telefone) linhas.push(`<div>${escapeHtml(config.estabelecimento_telefone)}</div>`);
  if (config.estabelecimento_endereco) linhas.push(`<div>${escapeHtml(config.estabelecimento_endereco)}</div>`);
  if (config.estabelecimento_cidade_uf) linhas.push(`<div>${escapeHtml(config.estabelecimento_cidade_uf)}</div>`);

  if (linhas.length === 0) return "";
  return `
    <div class="cabecalho">
      ${linhas.join("")}
      <hr />
    </div>
  `;
}

function blocoLogo(config) {
  if (!config.mostrar_logo || !config.logo_data_url) return "";
  const limite = config.largura_papel_mm === 58 ? 48 : 62;
  const largura = Math.max(18, Math.min(limite, Number(config.logo_largura_mm || 34) || 34));
  return `
    <div class="logo-bloco ${config.logo_alto_contraste ? "logo-alto-contraste" : ""}">
      <img src="${config.logo_data_url}" alt="Logo do estabelecimento" style="width:${largura}mm;" />
    </div>
  `;
}

function dataHoraAtual(config) {
  if (!config.mostrar_data_hora) return "";
  return `<p>Data: ${escapeHtml(new Date().toLocaleString("pt-BR"))}</p>`;
}

function escreverDocumento(janela, html) {
  janela.document.open();
  janela.document.write(html);
  janela.document.close();
}

function htmlTextoSimples(titulo, texto, config) {
  return `
    <html>
      <head>
        <title>${escapeHtml(titulo)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 1.5mm 1.5mm 6mm;
            width: ${config.largura_papel_mm}mm;
            font-family: "Courier New", "Consolas", monospace;
            font-size: ${config.largura_papel_mm === 58 ? 11 : 12}px;
            line-height: 1.3;
            color: #111;
            white-space: pre-wrap;
            word-break: break-word;
          }
          .conteudo {
            border: none;
          }
          @page {
            size: ${config.largura_papel_mm}mm auto;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="conteudo">${escapeHtml(texto)}</div>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;
}

function sanitizeText(valor) {
  return limparTextoTermica(String(valor || "").replace(/\r?\n/g, " ").trim());
}

function padLeft(texto, tamanho) {
  const safe = String(texto || "");
  if (safe.length >= tamanho) return safe.slice(0, tamanho);
  return " ".repeat(tamanho - safe.length) + safe;
}

function padLeftMoney(texto, tamanho) {
  const safe = String(texto || "");
  if (safe.length >= tamanho) return safe.slice(Math.max(0, safe.length - tamanho));
  return " ".repeat(tamanho - safe.length) + safe;
}

function padRight(texto, tamanho) {
  const safe = String(texto || "");
  if (safe.length >= tamanho) return safe.slice(0, tamanho);
  return safe + " ".repeat(tamanho - safe.length);
}

function linePair(left, right, largura) {
  const rightSafe = limparTextoTermica(String(right || ""));
  if (!rightSafe) {
    return limparTextoTermica(String(left || "")).slice(0, largura);
  }

  if (rightSafe.length >= largura - 2) {
    const leftSafe = limparTextoTermica(String(left || "")).slice(0, largura);
    return `${leftSafe}\n${padLeft(rightSafe, largura)}`;
  }

  const leftWidth = Math.max(4, largura - rightSafe.length - 1);
  return `${padRight(limparTextoTermica(left), leftWidth)} ${rightSafe}`;
}

function calcularLarguraTexto(config) {
  return config.largura_papel_mm === 58 ? 32 : 42;
}

function montarTextoConta(mesa, pedido, itens, pagamento, config) {
  const largura = calcularLarguraTexto(config);
  const pedidoSeguro = pedido || {};
  const linhas = [];
  const formaPagamento = pagamento?.forma_pagamento || pedidoSeguro.forma_pagamento || "";
  const pagamentos = normalizarListaPagamentos(pagamento, pedidoSeguro);
  const pessoas = Math.max(1, Number(pedidoSeguro?.pessoas || 1));
  const dividirPorPessoa = Number(pedidoSeguro?.dividir_por_pessoa || 0) === 1;

  if (config.estabelecimento_nome) linhas.push(sanitizeText(config.estabelecimento_nome).slice(0, largura));
  if (config.estabelecimento_documento) linhas.push(sanitizeText(config.estabelecimento_documento).slice(0, largura));
  if (config.estabelecimento_telefone) linhas.push(sanitizeText(config.estabelecimento_telefone).slice(0, largura));
  if (config.estabelecimento_endereco) linhas.push(sanitizeText(config.estabelecimento_endereco).slice(0, largura));
  if (config.estabelecimento_cidade_uf) linhas.push(sanitizeText(config.estabelecimento_cidade_uf).slice(0, largura));

  if (linhas.length > 0) linhas.push("-".repeat(largura));

  linhas.push(sanitizeText(formaPagamento ? "Comprovante" : "Pre-conta"));
  linhas.push(`Mesa ${sanitizeText(mesa?.numero || "-")}`);
  if (config.mostrar_cliente && mesa?.cliente_nome) {
    linhas.push(`Cliente: ${sanitizeText(mesa.cliente_nome).slice(0, largura - 9)}`);
  }
  if (pedidoSeguro?.garcom_nome_fechamento) {
    linhas.push(`Garcom: ${sanitizeText(pedidoSeguro.garcom_nome_fechamento).slice(0, largura - 8)}`);
  }
  linhas.push(`Pessoas: ${pessoas}`);
  if (config.mostrar_data_hora) linhas.push(`Data: ${new Date().toLocaleString("pt-BR")}`);
  linhas.push("-".repeat(largura));
  const usaTabelaCompacta = largura <= 32;
  const qtdWidth = usaTabelaCompacta ? 3 : 4;
  const precoWidth = usaTabelaCompacta ? 10 : 11;
  const totalWidth = usaTabelaCompacta ? 10 : 11;
  const itemWidth = Math.max(8, largura - qtdWidth - precoWidth - totalWidth - 3);

  linhas.push(
    `${padLeft("QTD", qtdWidth)} ${padRight("ITEM", itemWidth)} ${padLeft("PRECO", precoWidth)} ${padLeft(
      "TOTAL",
      totalWidth
    )}`
  );
  linhas.push("-".repeat(largura));

  for (const item of itens || []) {
    const nome = sanitizeText(item.nome_produto);
    const qtdTxt = `${Number(item.quantidade || 0)}x`;
    const precoTxt = moedaAlinhada(item.preco_unitario, precoWidth);
    const totalTxt = moedaAlinhada(item.total_item, totalWidth);
    linhas.push(
      `${padLeft(qtdTxt, qtdWidth)} ${padRight(nome, itemWidth)} ${padLeft(precoTxt, precoWidth)} ${padLeft(
        totalTxt,
        totalWidth
      )}`
    );
  }

  linhas.push("-".repeat(largura));
  linhas.push(linePair("Subtotal", moedaAlinhada(pedidoSeguro.subtotal), largura));
  linhas.push(linePair("Taxa de servico", moedaAlinhada(pedidoSeguro.taxa_servico_valor), largura));
  if (Number(pedidoSeguro.couvert_artistico_total || 0) > 0) {
    linhas.push(linePair("Couvert artistico", moedaAlinhada(pedidoSeguro.couvert_artistico_total), largura));
  }
  linhas.push(linePair("Total", moedaAlinhada(pedidoSeguro.total), largura));

  if (dividirPorPessoa && pessoas > 1) {
    linhas.push(linePair("Por pessoa", moedaAlinhada(pedidoSeguro.total_por_pessoa), largura));
  }

  if (config.mostrar_forma_pagamento && formaPagamento) {
    linhas.push("-".repeat(largura));
    if (pagamentos.length > 0) {
      linhas.push(linePair("Forma", pagamentos.length > 1 ? "Misto" : formatarFormaPagamento(pagamentos[0].forma_pagamento), largura));
      for (const item of pagamentos) {
        linhas.push(linePair(`- ${formatarFormaPagamento(item.forma_pagamento)}`, moedaAlinhada(item.valor), largura));
      }
      const pagamentoDinheiro = pagamentos.find(
        (item) => String(item.forma_pagamento || "").toUpperCase() === "DINHEIRO"
      );
      if (pagamentoDinheiro && pagamentoDinheiro.valor_recebido !== null && pagamentoDinheiro.valor_recebido !== undefined) {
        linhas.push(linePair("Recebido dinheiro", moedaAlinhada(pagamentoDinheiro.valor_recebido), largura));
      }
      if (pagamentoDinheiro && Number(pagamentoDinheiro.troco || 0) > 0) {
        linhas.push(linePair("Troco", moedaAlinhada(pagamentoDinheiro.troco), largura));
      }
    } else {
      linhas.push(linePair("Forma", formatarFormaPagamento(formaPagamento), largura));

      const valorRecebido = pagamento?.valor_recebido ?? pedidoSeguro?.valor_recebido;
      const troco = pagamento?.troco ?? pedidoSeguro?.troco;

      if (valorRecebido !== null && valorRecebido !== undefined) {
        linhas.push(linePair("Valor recebido", moedaAlinhada(valorRecebido), largura));
      }
      if (troco !== null && troco !== undefined) {
        linhas.push(linePair("Troco", moedaAlinhada(troco), largura));
      }
    }
  }

  if (config.mensagem_rodape) {
    linhas.push("-".repeat(largura));
    linhas.push(sanitizeText(config.mensagem_rodape).slice(0, largura));
  }

  return `${linhas.join("\n")}\n`;
}

function montarTextoResumoCaixa(resumo, config) {
  const largura = calcularLarguraTexto(config);
  const linhas = [];
  const caixa = resumo?.caixa || {};

  if (config.estabelecimento_nome) linhas.push(sanitizeText(config.estabelecimento_nome).slice(0, largura));
  if (config.estabelecimento_documento) linhas.push(sanitizeText(config.estabelecimento_documento).slice(0, largura));
  if (config.estabelecimento_telefone) linhas.push(sanitizeText(config.estabelecimento_telefone).slice(0, largura));

  if (linhas.length > 0) linhas.push("-".repeat(largura));
  linhas.push("Fechamento de caixa");

  if (config.mostrar_data_hora) {
    linhas.push(`Gerado: ${new Date().toLocaleString("pt-BR")}`);
  }

  if (resumo?.periodo_inicio) linhas.push(`Inicio: ${new Date(resumo.periodo_inicio).toLocaleString("pt-BR")}`);
  if (resumo?.periodo_fim) linhas.push(`Fim: ${new Date(resumo.periodo_fim).toLocaleString("pt-BR")}`);
  linhas.push("-".repeat(largura));

  linhas.push(linePair("Saldo inicial", moeda(resumo?.saldo_inicial), largura));
  if (resumo?.saldo_contado !== null && resumo?.saldo_contado !== undefined) {
    linhas.push(linePair("Saldo contado", moeda(resumo?.saldo_contado), largura));
  }
  if (resumo?.diferenca_fechamento !== null && resumo?.diferenca_fechamento !== undefined) {
    linhas.push(linePair("Diferenca", moeda(resumo?.diferenca_fechamento), largura));
  }
  linhas.push(linePair("Subtotal", moeda(caixa.subtotal_produtos), largura));
  linhas.push(linePair("Taxa", moeda(caixa.taxa_servico_total), largura));
  linhas.push(linePair("Total vendido", moeda(caixa.faturamento_total), largura));
  linhas.push(linePair("Vendas", Number(caixa.vendas || 0), largura));
  linhas.push(linePair("Saldo final", moeda(resumo?.saldo_final_estimado), largura));

  if (config.mostrar_forma_pagamento && (resumo?.faturamentoPorForma || []).length > 0) {
    linhas.push("-".repeat(largura));
    linhas.push("Por forma de pagamento:");
    for (const item of resumo.faturamentoPorForma) {
      linhas.push(linePair(formatarFormaPagamento(item.forma_pagamento), moeda(item.total), largura));
    }
  }

  if (config.mensagem_rodape) {
    linhas.push("-".repeat(largura));
    linhas.push(sanitizeText(config.mensagem_rodape).slice(0, largura));
  }

  return `${linhas.join("\n")}\n`;
}

function htmlConta(mesa, pedido, itens, pagamento, config) {
  const pedidoSeguro = pedido || {};
  const mesaNumero = mesa?.numero ?? "-";
  const linhasItens = (itens || [])
    .map(
      (item) => `
    <tr>
      <td>${Number(item.quantidade || 0)}x</td>
      <td>${escapeHtml(item.nome_produto)}</td>
      <td style="text-align:right;">${moeda(item.preco_unitario)}</td>
      <td style="text-align:right;">${moeda(item.total_item)}</td>
    </tr>
  `
    )
    .join("");

  const formaPagamento = pagamento?.forma_pagamento || pedidoSeguro?.forma_pagamento || "";
  const pagamentos = normalizarListaPagamentos(pagamento, pedidoSeguro);
  const pagamentoDinheiro = pagamentos.find(
    (item) => String(item.forma_pagamento || "").toUpperCase() === "DINHEIRO"
  );
  const valorRecebido =
    pagamento?.valor_recebido ??
    pagamentoDinheiro?.valor_recebido ??
    pedidoSeguro?.valor_recebido;
  const troco = pagamento?.troco ?? pagamentoDinheiro?.troco ?? pedidoSeguro?.troco;
  const pessoas = Math.max(1, Number(pedidoSeguro?.pessoas || 1));
  const dividirPorPessoa = Number(pedidoSeguro?.dividir_por_pessoa || 0) === 1;
  const taxaPercent = Number(pedidoSeguro?.taxa_servico_percent || 0);
  const taxaLabel =
    taxaPercent > 0 ? `Taxa de servico (${taxaPercent}%)` : "Taxa de servico (isenta)";
  const titulo = formaPagamento
    ? `Comprovante de pagamento - Mesa ${escapeHtml(mesaNumero)}`
    : `Pre-conta - Mesa ${escapeHtml(mesaNumero)}`;

  const blocoCliente =
    config.mostrar_cliente && mesa?.cliente_nome
      ? `<p>Cliente: ${escapeHtml(mesa.cliente_nome || "Nao informado")}</p>`
      : "";
  const blocoGarcom = pedidoSeguro?.garcom_nome_fechamento
    ? `<p>Garcom: ${escapeHtml(pedidoSeguro.garcom_nome_fechamento)}</p>`
    : "";

  const blocoPagamento =
    config.mostrar_forma_pagamento && formaPagamento
      ? `
      <div class="pagamento">
        <h2>Pagamento</h2>
        <div><span>Forma</span><span>${escapeHtml(
          pagamentos.length > 1 ? "Misto" : formatarFormaPagamento(formaPagamento)
        )}</span></div>
        ${
          pagamentos.length > 0
            ? pagamentos
                .map(
                  (item) =>
                    `<div><span>${escapeHtml(
                      formatarFormaPagamento(item.forma_pagamento)
                    )}</span><span>${moeda(item.valor)}</span></div>`
                )
                .join("")
            : ""
        }
        ${
          valorRecebido !== null && valorRecebido !== undefined
            ? `<div><span>Valor recebido</span><span>${moeda(valorRecebido)}</span></div>`
            : ""
        }
        ${
          troco !== null && troco !== undefined && Number(troco || 0) > 0
            ? `<div><span>Troco</span><span>${moeda(troco)}</span></div>`
            : ""
        }
      </div>
    `
      : "";

  const rodape = config.mensagem_rodape
    ? `<p style="margin-top: 12px;">${escapeHtml(config.mensagem_rodape)}</p>`
    : "";

  return `
    <html>
      <head>
        <title>${titulo}</title>
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 2mm 2mm 6mm;
            width: ${config.largura_papel_mm}mm;
            color: #111;
            font-size: ${config.largura_papel_mm === 58 ? 11 : 12}px;
            line-height: 1.35;
          }
          h1 {
            margin: 0 0 10px 0;
            font-size: 1.9em;
            line-height: 1.15;
          }
          h2 {
            margin: 0 0 8px 0;
            font-size: 1.2em;
          }
          p {
            margin: 0 0 6px 0;
            font-size: 1em;
          }
          .cabecalho {
            margin-bottom: 10px;
            font-size: 0.95em;
          }
          .logo-bloco {
            text-align: center;
            margin: 0 0 10px;
          }
          .logo-bloco img {
            max-width: 100%;
            max-height: 24mm;
            object-fit: contain;
            image-rendering: crisp-edges;
          }
          .logo-alto-contraste img {
            filter: grayscale(1) contrast(1.9) brightness(1.05);
          }
          .cabecalho hr {
            margin: 7px 0 0;
          }
          .topo, .totais {
            margin-bottom: 14px;
          }
          .pagamento {
            margin: 14px 0;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 1em;
          }
          .pagamento div {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
            font-size: 1em;
            table-layout: fixed;
          }
          td, th {
            border-bottom: 1px dashed #bbb;
            padding: 6px 0;
            font-size: 1em;
            vertical-align: top;
          }
          .comanda-table thead th {
            text-transform: uppercase;
            font-size: 0.9em;
            letter-spacing: 0.4px;
            color: #333;
            padding-bottom: 7px;
          }
          .comanda-table tbody td {
            font-variant-numeric: tabular-nums;
          }
          .totais div {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 1em;
          }
          .destaque {
            font-weight: bold;
            font-size: 1.35em !important;
          }
          @page {
            size: ${config.largura_papel_mm}mm auto;
            margin: 0;
          }
          @media print {
            body {
              width: ${config.largura_papel_mm}mm;
            }
          }
        </style>
      </head>
      <body>
        ${blocoLogo(config)}
        ${config.exibir_cabecalho ? linhaCabecalho(config) : ""}
        <div class="topo">
          <h1>${titulo}</h1>
          ${blocoCliente}
          ${blocoGarcom}
          <p>Pessoas: ${escapeHtml(pessoas)}</p>
          ${dataHoraAtual(config)}
        </div>

        <table class="comanda-table">
          <thead>
            <tr>
              <th>Qtd</th>
              <th>Item</th>
              <th style="text-align:right;">Preco</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${linhasItens}
          </tbody>
        </table>

        <div class="totais">
          <div><span>Subtotal</span><span>${moeda(pedidoSeguro.subtotal)}</span></div>
          <div><span>${taxaLabel}</span><span>${moeda(pedidoSeguro.taxa_servico_valor)}</span></div>
          ${
            Number(pedidoSeguro.couvert_artistico_total || 0) > 0
              ? `<div><span>Couvert artistico</span><span>${moeda(pedidoSeguro.couvert_artistico_total)}</span></div>`
              : ""
          }
          <div class="destaque"><span>Total</span><span>${moeda(pedidoSeguro.total)}</span></div>
          ${
            dividirPorPessoa && pessoas > 1
              ? `<div><span>Por pessoa</span><span>${moeda(pedidoSeguro.total_por_pessoa)}</span></div>`
              : ""
          }
        </div>

        ${blocoPagamento}
        ${rodape}

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;
}

function htmlResumoCaixa(resumo, config) {
  const resumoSeguro = resumo || {};
  const caixa = resumoSeguro.caixa || {};
  const formasPagamento = (resumoSeguro.faturamentoPorForma || [])
    .map((item) => {
      return `<div class="row"><span>${escapeHtml(
        formatarFormaPagamento(item.forma_pagamento)
      )}</span><span>${moeda(item.total)}</span></div>`;
    })
    .join("");

  const periodoInicio = resumoSeguro.periodo_inicio
    ? new Date(resumoSeguro.periodo_inicio).toLocaleString("pt-BR")
    : "-";
  const periodoFim = resumoSeguro.periodo_fim
    ? new Date(resumoSeguro.periodo_fim).toLocaleString("pt-BR")
    : "-";

  return `
    <html>
      <head>
        <title>Resumo de Fechamento de Caixa</title>
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 2mm 2mm 6mm;
            width: ${config.largura_papel_mm}mm;
            color: #111;
            font-size: ${config.largura_papel_mm === 58 ? 11 : 12}px;
            line-height: 1.35;
          }
          h1 {
            margin: 0 0 10px 0;
            font-size: 1.7em;
          }
          h2 {
            margin: 0 0 8px 0;
            font-size: 1.2em;
          }
          p {
            margin: 0 0 6px 0;
            font-size: 1em;
          }
          .cabecalho {
            margin-bottom: 10px;
            font-size: 0.95em;
          }
          .logo-bloco {
            text-align: center;
            margin: 0 0 10px;
          }
          .logo-bloco img {
            max-width: 100%;
            max-height: 24mm;
            object-fit: contain;
            image-rendering: crisp-edges;
          }
          .logo-alto-contraste img {
            filter: grayscale(1) contrast(1.9) brightness(1.05);
          }
          .box {
            margin-bottom: 12px;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 8px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 1em;
          }
          .destaque {
            font-weight: bold;
            font-size: 1.3em !important;
          }
          @page {
            size: ${config.largura_papel_mm}mm auto;
            margin: 0;
          }
          @media print {
            body {
              width: ${config.largura_papel_mm}mm;
            }
          }
        </style>
      </head>
      <body>
        ${blocoLogo(config)}
        ${config.exibir_cabecalho ? linhaCabecalho(config) : ""}
        <h1>Fechamento de Caixa</h1>
        <p>Periodo: ${escapeHtml(periodoInicio)} ate ${escapeHtml(periodoFim)}</p>

        <div class="box">
          <h2>Resumo</h2>
          <div class="row"><span>Saldo inicial</span><span>${moeda(resumoSeguro.saldo_inicial)}</span></div>
          ${
            resumoSeguro.saldo_contado !== null && resumoSeguro.saldo_contado !== undefined
              ? `<div class="row"><span>Saldo contado</span><span>${moeda(resumoSeguro.saldo_contado)}</span></div>`
              : ""
          }
          ${
            resumoSeguro.diferenca_fechamento !== null && resumoSeguro.diferenca_fechamento !== undefined
              ? `<div class="row"><span>Diferenca</span><span>${moeda(resumoSeguro.diferenca_fechamento)}</span></div>`
              : ""
          }
          <div class="row"><span>Subtotal produtos</span><span>${moeda(caixa.subtotal_produtos)}</span></div>
          <div class="row"><span>Taxa de servico</span><span>${moeda(caixa.taxa_servico_total)}</span></div>
          <div class="row"><span>Total vendido</span><span>${moeda(caixa.faturamento_total)}</span></div>
          <div class="row"><span>Vendas</span><span>${Number(caixa.vendas || 0)}</span></div>
          <div class="row destaque"><span>Saldo final estimado</span><span>${moeda(
            resumoSeguro.saldo_final_estimado
          )}</span></div>
        </div>

        ${
          config.mostrar_forma_pagamento
            ? `
          <div class="box">
            <h2>Faturamento por pagamento</h2>
            ${formasPagamento || "<p>Nenhum pagamento registrado.</p>"}
          </div>
        `
            : ""
        }

        ${config.mostrar_data_hora ? `<p>Gerado em: ${escapeHtml(new Date().toLocaleString("pt-BR"))}</p>` : ""}
        ${config.mensagem_rodape ? `<p>${escapeHtml(config.mensagem_rodape)}</p>` : ""}

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;
}

export async function imprimirConta(mesa, pedido, itens = [], pagamento = null, config = null) {
  const cfg = normalizarConfig(config);
  const precisaHtmlComLogo = cfg.mostrar_logo && Boolean(cfg.logo_data_url);
  if (!precisaHtmlComLogo) {
    const textoDireto = montarTextoConta(mesa, pedido, itens, pagamento, cfg);
    const impressoDireto = await tentarImpressaoDireta(textoDireto, cfg);
    if (impressoDireto) return;

    const janelaTexto = abrirJanelaImpressao();
    if (!janelaTexto) return;
    escreverDocumento(
      janelaTexto,
      htmlTextoSimples(
        pagamento?.forma_pagamento || pedido?.forma_pagamento
          ? `Comprovante - Mesa ${mesa?.numero ?? "-"}`
          : `Pre-conta - Mesa ${mesa?.numero ?? "-"}`,
        textoDireto,
        cfg
      )
    );
    return;
  }

  const janela = abrirJanelaImpressao();
  if (!janela) return;

  escreverDocumento(janela, htmlConta(mesa, pedido, itens, pagamento, cfg));
}

export function gerarPreviewImpressaoConta(mesa, pedido, itens = [], pagamento = null, config = null) {
  const cfg = normalizarConfig(config);
  return montarTextoConta(mesa, pedido, itens, pagamento, cfg);
}

export async function imprimirResumoCaixa(resumo, config = null) {
  const cfg = normalizarConfig(config);
  const precisaHtmlComLogo = cfg.mostrar_logo && Boolean(cfg.logo_data_url);
  if (!precisaHtmlComLogo) {
    const textoDireto = montarTextoResumoCaixa(resumo, cfg);
    const impressoDireto = await tentarImpressaoDireta(textoDireto, cfg);
    if (impressoDireto) return;

    const janelaTexto = abrirJanelaImpressao();
    if (!janelaTexto) return;
    escreverDocumento(janelaTexto, htmlTextoSimples("Fechamento de caixa", textoDireto, cfg));
    return;
  }

  const janela = abrirJanelaImpressao();
  if (!janela) return;

  escreverDocumento(janela, htmlResumoCaixa(resumo, cfg));
}
