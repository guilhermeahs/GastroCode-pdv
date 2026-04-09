import React, { useEffect, useMemo, useRef, useState } from "react";
import SelectField from "./SelectField";
import ConfirmDialog from "./ConfirmDialog";
import { useApp } from "../context/AppContext";
import { gerarPreviewImpressaoConta } from "../services/print";

const TAXA_SERVICO_PADRAO = 10;
const TAXA_SERVICO_MAX = 30;
const TAXA_COUVERT_MAX = 200;

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function moedaNumero(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function arredondar(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Number(numero.toFixed(2));
}

function parseNumeroMonetario(valor, fallback = NaN) {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : fallback;
  }

  const bruto = String(valor ?? "").trim();
  if (!bruto) return fallback;

  let normalizado = bruto.replace(/\s+/g, "");

  if (normalizado.includes(",") && normalizado.includes(".")) {
    if (normalizado.lastIndexOf(",") > normalizado.lastIndexOf(".")) {
      normalizado = normalizado.replace(/\./g, "").replace(",", ".");
    } else {
      normalizado = normalizado.replace(/,/g, "");
    }
  } else if (normalizado.includes(",")) {
    normalizado = normalizado.replace(",", ".");
  }

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : fallback;
}

function formatarValorEntrada(valor) {
  return arredondar(valor).toFixed(2).replace(".", ",");
}

export default function ModalPagamento({
  open,
  onClose,
  onConfirm,
  pedido,
  mesa,
  itens = [],
  processing = false,
  mode = "fechar"
}) {
  const { configuracoes, configuracaoImpressaoAtual, role, authUser } = useApp();
  const [pagamentos, setPagamentos] = useState([]);
  const [valorRecebidoDinheiro, setValorRecebidoDinheiro] = useState(0);
  const [pessoas, setPessoas] = useState(1);
  const [dividirPorPessoa, setDividirPorPessoa] = useState(false);
  const [cobrarTaxa, setCobrarTaxa] = useState(true);
  const [taxaServicoPercent, setTaxaServicoPercent] = useState(TAXA_SERVICO_PADRAO);
  const [cobrarCouvert, setCobrarCouvert] = useState(false);
  const [couvertUnitario, setCouvertUnitario] = useState(0);
  const [erro, setErro] = useState("");
  const [confirmarImpressaoOpen, setConfirmarImpressaoOpen] = useState(false);
  const [payloadPendente, setPayloadPendente] = useState(null);
  const [previewImpressao, setPreviewImpressao] = useState("");
  const [garcomCodigoFechamento, setGarcomCodigoFechamento] = useState("");
  const [garcomPinFechamento, setGarcomPinFechamento] = useState("");
  const [garcomNomeFechamento, setGarcomNomeFechamento] = useState("");
  const chaveInicializacaoRef = useRef("");
  const formasPagamentoOptions = useMemo(
    () => [
      { value: "PIX", label: "Pix" },
      { value: "CREDITO", label: "Cartao de credito" },
      { value: "DEBITO", label: "Cartao de debito" },
      { value: "DINHEIRO", label: "Dinheiro" }
    ],
    []
  );

  function novaLinhaPagamento(forma = "PIX", valor = 0) {
    const valorNormalizado =
      typeof valor === "string" ? valor : formatarValorEntrada(valor);
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      forma_pagamento: forma,
      valor: valorNormalizado
    };
  }

  useEffect(() => {
    if (!open || !pedido || !mesa) return;

    const chaveAtual = `${mode}:${mesa.id}:${pedido.id || "sem-pedido"}:${Number(
      pedido.subtotal || 0
    )}:${Number(pedido.total || 0)}`;
    if (chaveInicializacaoRef.current === chaveAtual) return;
    chaveInicializacaoRef.current = chaveAtual;

    const taxaPadraoConfig = Math.max(
      0,
      Math.min(TAXA_SERVICO_MAX, Number(configuracoes.taxa_servico_padrao_percent ?? TAXA_SERVICO_PADRAO))
    );
    const cobrarTaxaPadrao = configuracoes.cobrar_taxa_servico_padrao !== false;
    const temTaxaNoPedido = pedido.taxa_servico_percent !== null && pedido.taxa_servico_percent !== undefined;
    const taxaPedido = Number(temTaxaNoPedido ? pedido.taxa_servico_percent : taxaPadraoConfig);
    const taxaAtiva = temTaxaNoPedido ? taxaPedido > 0 : cobrarTaxaPadrao;
    const couvertPadraoAtivo = configuracoes.cobrar_couvert_artistico_padrao === true;
    const couvertPadraoValor = Math.max(
      0,
      Math.min(TAXA_COUVERT_MAX, Number(configuracoes.couvert_artistico_valor || 0))
    );
    const pedidoTemCouvertDefinido =
      pedido.cobrar_couvert_artistico !== undefined || pedido.couvert_artistico_unitario !== undefined;
    const couvertAtivo = pedidoTemCouvertDefinido
      ? Number(pedido.cobrar_couvert_artistico || 0) === 1
      : couvertPadraoAtivo;
    const couvertValorInicial = pedidoTemCouvertDefinido
      ? Number(pedido.couvert_artistico_unitario || 0)
      : couvertPadraoValor;
    const pessoasPadrao = Math.max(1, Number(configuracoes.pessoas_padrao_conta || 1));

    setCobrarTaxa(taxaAtiva);
    setTaxaServicoPercent(taxaAtiva ? taxaPedido : taxaPadraoConfig);
    setCobrarCouvert(couvertAtivo);
    setCouvertUnitario(couvertAtivo ? couvertValorInicial : couvertPadraoValor);
    setPagamentos([novaLinhaPagamento("PIX", formatarValorEntrada(pedido.total))]);
    setValorRecebidoDinheiro(formatarValorEntrada(pedido.total));
    setPessoas(Number(pedido.pessoas || pessoasPadrao));
    setDividirPorPessoa(Number(pedido.dividir_por_pessoa || 0) === 1);
    setGarcomCodigoFechamento(
      String(role === "GARCOM" ? authUser?.apelido || "" : "")
        .trim()
        .slice(0, 60)
    );
    setGarcomPinFechamento("");
    setGarcomNomeFechamento(
      String(authUser?.nome || authUser?.apelido || "")
        .trim()
        .slice(0, 60)
    );
    setErro("");
    setConfirmarImpressaoOpen(false);
    setPayloadPendente(null);
    setPreviewImpressao("");
  }, [open, pedido, mesa, mode, configuracoes, role, authUser?.apelido, authUser?.nome]);

  useEffect(() => {
    if (!open) {
      chaveInicializacaoRef.current = "";
    }
  }, [open]);

  const subtotal = arredondar(pedido?.subtotal);
  const taxaAplicada = cobrarTaxa ? Math.max(0, Number(taxaServicoPercent || 0)) : 0;
  const taxaServicoValor = arredondar(subtotal * (taxaAplicada / 100));
  const pessoasNumeroCalculo = Math.max(1, Number(pessoas || 1));
  const couvertAplicado = cobrarCouvert ? Math.max(0, Number(couvertUnitario || 0)) : 0;
  const couvertTotal = arredondar(couvertAplicado * pessoasNumeroCalculo);
  const total = arredondar(subtotal + taxaServicoValor + couvertTotal);

  const totalPorPessoa = useMemo(() => {
    const qtd = Math.max(1, Number(pessoas || 1));
    return total / qtd;
  }, [total, pessoas]);

  const pagamentosNormalizados = useMemo(() => {
    return (pagamentos || []).map((item) => ({
      ...item,
      forma_pagamento: String(item.forma_pagamento || "").toUpperCase(),
      valor: arredondar(parseNumeroMonetario(item.valor, NaN))
    }));
  }, [pagamentos]);

  const totalInformado = useMemo(() => {
    return arredondar(pagamentosNormalizados.reduce((acc, item) => acc + Number(item.valor || 0), 0));
  }, [pagamentosNormalizados]);

  const diferencaTotal = useMemo(() => {
    return arredondar(total - totalInformado);
  }, [total, totalInformado]);

  const totalDinheiro = useMemo(() => {
    return arredondar(
      pagamentosNormalizados
        .filter((item) => item.forma_pagamento === "DINHEIRO")
        .reduce((acc, item) => acc + Number(item.valor || 0), 0)
    );
  }, [pagamentosNormalizados]);

  const valorRecebidoDinheiroNumero = useMemo(() => {
    return parseNumeroMonetario(valorRecebidoDinheiro, 0);
  }, [valorRecebidoDinheiro]);

  const troco = useMemo(() => {
    if (totalDinheiro <= 0) return 0;
    return Math.max(0, arredondar(valorRecebidoDinheiroNumero - totalDinheiro));
  }, [totalDinheiro, valorRecebidoDinheiroNumero]);

  if (!open || !pedido || !mesa) return null;

  const emPagamento = mode === "pagar";
  const exigePinGarcomFechamento = !emPagamento && configuracoes.exigir_pin_fechamento_conta !== false;
  const solicitarNomeGarcom = !emPagamento && configuracoes.solicitar_nome_garcom_fechamento === true;
  const titulo = emPagamento
    ? `Pagamento da Mesa ${mesa.numero}`
    : `Enviar Mesa ${mesa.numero} para Fechamento`;
  const botaoSubmit = emPagamento
    ? processing
      ? "Finalizando..."
      : "Revisar impressao e finalizar"
    : processing
      ? "Processando..."
      : "Enviar para fechamento";

  function atualizarPagamento(id, parcial) {
    setPagamentos((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return { ...item, ...(parcial || {}) };
      })
    );
  }

  function adicionarFormaPagamento() {
    setPagamentos((prev) => [...prev, novaLinhaPagamento("PIX", 0)]);
  }

  function removerFormaPagamento(id) {
    setPagamentos((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((item) => item.id !== id);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");

    const pessoasNumero = Math.max(1, Math.floor(Number(pessoas || 1)));
    const taxaNumero = Number(taxaServicoPercent || 0);
    const codigoGarcomNormalizado = String(garcomCodigoFechamento || "").trim().slice(0, 60);
    const pinGarcomNormalizado = String(garcomPinFechamento || "").trim();
    const nomeGarcomNormalizado = String(garcomNomeFechamento || "").trim().slice(0, 60);

    if (cobrarTaxa && (!Number.isFinite(taxaNumero) || taxaNumero < 0 || taxaNumero > TAXA_SERVICO_MAX)) {
      setErro(`A taxa de servico deve ficar entre 0 e ${TAXA_SERVICO_MAX}%.`);
      return;
    }
    const couvertNumero = Number(couvertUnitario || 0);
    if (
      cobrarCouvert &&
      (!Number.isFinite(couvertNumero) || couvertNumero < 0 || couvertNumero > TAXA_COUVERT_MAX)
    ) {
      setErro(`O couvert artistico deve ficar entre 0 e ${TAXA_COUVERT_MAX}.`);
      return;
    }

    const payload = {
      pessoas: pessoasNumero,
      dividir_conta_por_pessoa: Boolean(dividirPorPessoa),
      cobrar_taxa_servico: cobrarTaxa,
      taxa_servico_percent: cobrarTaxa ? arredondar(taxaNumero) : 0,
      cobrar_couvert_artistico: cobrarCouvert,
      couvert_artistico_unitario: cobrarCouvert ? arredondar(couvertNumero) : 0
    };

    if (!emPagamento) {
      if (exigePinGarcomFechamento) {
        if (!codigoGarcomNormalizado) {
          setErro("Informe o codigo do garcom para enviar a mesa ao fechamento.");
          return;
        }
        if (!/^\d{4,8}$/.test(pinGarcomNormalizado)) {
          setErro("Informe o PIN do garcom com 4 a 8 numeros.");
          return;
        }
        payload.garcom_codigo_fechamento = codigoGarcomNormalizado;
        payload.garcom_pin_fechamento = pinGarcomNormalizado;
      } else {
        if (solicitarNomeGarcom && !nomeGarcomNormalizado) {
          setErro("Informe o nome do garcom para enviar a mesa ao fechamento.");
          return;
        }
        payload.garcom_nome_fechamento = nomeGarcomNormalizado || authUser?.nome || authUser?.apelido || "Nao informado";
      }
    }

    if (emPagamento) {
      if (pagamentosNormalizados.length < 1) {
        setErro("Adicione pelo menos uma forma de pagamento.");
        return;
      }

      const pagamentosValidos = [];
      for (const item of pagamentosNormalizados) {
        const valor = Number(item.valor);
        if (!Number.isFinite(valor) || valor <= 0) {
          setErro("Todos os pagamentos devem ter valor maior que zero.");
          return;
        }
        pagamentosValidos.push({
          forma_pagamento: item.forma_pagamento,
          valor: arredondar(valor)
        });
      }

      if (Math.abs(diferencaTotal) > 0.05) {
        setErro("A soma das formas de pagamento deve bater com o total da conta.");
        return;
      }

      if (totalDinheiro > 0) {
        const recebido = parseNumeroMonetario(valorRecebidoDinheiro, NaN);
        if (!Number.isFinite(recebido) || recebido < totalDinheiro) {
          setErro("Valor recebido em dinheiro deve ser maior ou igual ao valor pago em dinheiro.");
          return;
        }
        payload.valor_recebido_dinheiro = arredondar(recebido);
      }

      payload.pagamentos = pagamentosValidos;

      const pagamentosComDetalhes = pagamentosValidos.map((item) => {
        if (item.forma_pagamento !== "DINHEIRO") {
          return { ...item };
        }
        return {
          ...item,
          valor_recebido: payload.valor_recebido_dinheiro ?? item.valor,
          troco: troco > 0 ? arredondar(troco) : 0
        };
      });

      const pedidoPreview = {
        ...pedido,
        subtotal: arredondar(subtotal),
        taxa_servico_percent: payload.taxa_servico_percent,
        taxa_servico_valor: arredondar(taxaServicoValor),
        cobrar_couvert_artistico: payload.cobrar_couvert_artistico ? 1 : 0,
        couvert_artistico_unitario: payload.couvert_artistico_unitario,
        couvert_artistico_total: arredondar(couvertTotal),
        total: arredondar(total),
        pessoas: pessoasNumero,
        dividir_por_pessoa: payload.dividir_conta_por_pessoa ? 1 : 0,
        total_por_pessoa:
          payload.dividir_conta_por_pessoa && pessoasNumero > 1 ? arredondar(total / pessoasNumero) : 0,
        forma_pagamento:
          pagamentosComDetalhes.length > 1
            ? "MISTO"
            : pagamentosComDetalhes[0]?.forma_pagamento || "PIX",
        pagamentos: pagamentosComDetalhes,
        valor_recebido: payload.valor_recebido_dinheiro ?? null,
        troco: troco > 0 ? arredondar(troco) : 0
      };
      const pagamentoPreview = {
        forma_pagamento: pedidoPreview.forma_pagamento,
        valor_recebido: payload.valor_recebido_dinheiro ?? null,
        troco: troco > 0 ? arredondar(troco) : 0,
        pagamentos: pagamentosComDetalhes
      };
      const textoPreview = gerarPreviewImpressaoConta(
        mesa,
        pedidoPreview,
        itens,
        pagamentoPreview,
        configuracaoImpressaoAtual
      );

      setPayloadPendente(payload);
      setPreviewImpressao(textoPreview);
      setConfirmarImpressaoOpen(true);
      return;
    }

    let sucesso = false;
    try {
      sucesso = await onConfirm(payload);
    } catch (error) {
      setErro(error?.message || "Falha ao finalizar pagamento.");
      return;
    }

    if (!sucesso) {
      setErro(
        emPagamento
          ? "Nao foi possivel concluir o pagamento. Revise os dados e tente de novo."
          : "Nao foi possivel colocar a mesa em fechamento."
      );
    }
  }

  async function handleConfirmarImpressaoFinal() {
    if (!payloadPendente) return;
    let sucesso = false;
    try {
      sucesso = await onConfirm(payloadPendente);
    } catch (error) {
      setErro(error?.message || "Falha ao finalizar pagamento.");
      setConfirmarImpressaoOpen(false);
      return;
    }

    if (!sucesso) {
      setErro("Nao foi possivel concluir o pagamento. Revise os dados e tente de novo.");
      setConfirmarImpressaoOpen(false);
      return;
    }

    setConfirmarImpressaoOpen(false);
    setPayloadPendente(null);
    setPreviewImpressao("");
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.65)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 30
      }}
    >
      <form onSubmit={handleSubmit} style={formStyle}>
        <h2 style={{ marginTop: 0 }}>{titulo}</h2>
        <p style={descricaoStyle}>
          {emPagamento
            ? "Confirme o pagamento para liberar a mesa."
            : "A mesa vai para FECHANDO. Voce pode mostrar a pre-conta ao cliente e finalizar depois."}
        </p>

        {exigePinGarcomFechamento && (
          <div style={{ ...fieldStyle, gap: 10 }}>
            <div style={fieldStyle}>
              <label style={fieldLabelStyle}>Codigo do garcom</label>
              <input
                type="text"
                value={garcomCodigoFechamento}
                onChange={(e) => setGarcomCodigoFechamento(e.target.value)}
                style={inputStyle}
                placeholder="Ex.: garcom1"
                maxLength={60}
                autoComplete="off"
                disabled={processing}
              />
            </div>
            <div style={fieldStyle}>
              <label style={fieldLabelStyle}>PIN do garcom</label>
              <input
                type="password"
                value={garcomPinFechamento}
                onChange={(e) => setGarcomPinFechamento(e.target.value)}
                style={inputStyle}
                placeholder="4 a 8 numeros"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                disabled={processing}
              />
            </div>
          </div>
        )}

        {!exigePinGarcomFechamento && solicitarNomeGarcom && (
          <div style={fieldStyle}>
            <label style={fieldLabelStyle}>Nome do garcom</label>
            <input
              type="text"
              value={garcomNomeFechamento}
              onChange={(e) => setGarcomNomeFechamento(e.target.value)}
              style={inputStyle}
              placeholder="Nome para identificar o fechamento"
              maxLength={60}
              autoComplete="off"
              disabled={processing}
            />
          </div>
        )}

        <div style={fieldStyle}>
          <label style={fieldLabelStyle}>Pessoas</label>
          <input
            type="number"
            min="1"
            value={pessoas}
            onChange={(e) => setPessoas(e.target.value)}
            style={inputStyle}
            disabled={processing}
          />
        </div>

        <div style={taxaBoxStyle}>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={dividirPorPessoa}
              onChange={(e) => setDividirPorPessoa(e.target.checked)}
              disabled={processing}
            />
            Dividir total por pessoa
          </label>
          <div style={{ color: "#aeb6d3", fontSize: 12 }}>
            Desmarcado: mostra apenas o total da mesa.
          </div>
        </div>

        <div style={taxaBoxStyle}>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={cobrarTaxa}
              onChange={(e) => setCobrarTaxa(e.target.checked)}
              disabled={processing}
            />
            Cobrar taxa de servico
          </label>

          {cobrarTaxa && (
            <div style={fieldStyle}>
              <label style={fieldLabelStyle}>Percentual da taxa (%)</label>
              <input
                type="number"
                min="0"
                max={TAXA_SERVICO_MAX}
                step="0.1"
                value={taxaServicoPercent}
                onChange={(e) => setTaxaServicoPercent(e.target.value)}
                style={inputStyle}
                disabled={processing}
              />
            </div>
          )}
        </div>
        <div style={taxaBoxStyle}>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={cobrarCouvert}
              onChange={(e) => setCobrarCouvert(e.target.checked)}
              disabled={processing}
            />
            Cobrar couvert artistico
          </label>

          {cobrarCouvert && (
            <div style={fieldStyle}>
              <label style={fieldLabelStyle}>Valor do couvert por pessoa</label>
              <div style={valorInputWrapperStyle}>
                <span style={valorPrefixStyle}>R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={String(couvertUnitario).replace(".", ",")}
                  onChange={(e) => setCouvertUnitario(parseNumeroMonetario(e.target.value, 0))}
                  placeholder="0,00"
                  style={inputValorStyle}
                  disabled={processing}
                />
              </div>
            </div>
          )}
        </div>

        {emPagamento && (
          <div style={taxaBoxStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <label style={fieldLabelStyle}>Pagamento (permite misto)</label>
              <button
                type="button"
                onClick={adicionarFormaPagamento}
                style={miniActionButtonStyle}
                disabled={processing}
              >
                + Adicionar forma
              </button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {pagamentos.map((linha) => (
                <div key={linha.id} style={pagamentoLinhaStyle}>
                  <SelectField
                    value={linha.forma_pagamento}
                    onChange={(value) => atualizarPagamento(linha.id, { forma_pagamento: value })}
                    options={formasPagamentoOptions}
                    disabled={processing}
                    wrapperStyle={{ minWidth: 0 }}
                    buttonStyle={selectButtonStyle}
                  />
                  <div style={valorInputWrapperStyle}>
                    <span style={valorPrefixStyle}>R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={linha.valor}
                      onChange={(e) => atualizarPagamento(linha.id, { valor: e.target.value })}
                      placeholder="0,00"
                      style={inputValorStyle}
                      disabled={processing}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removerFormaPagamento(linha.id)}
                    style={removeLinhaButtonStyle(processing || pagamentos.length <= 1)}
                    disabled={processing || pagamentos.length <= 1}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={comandaBoxStyle}>
          <div style={comandaHeaderStyle}>
            <strong>Comanda da mesa</strong>
            <span style={{ color: "#aeb6d3", fontSize: 12 }}>{itens.length} item(ns)</span>
          </div>

          <div style={comandaTabelaHeaderStyle}>
            <div>COMANDA</div>
            <div style={{ textAlign: "right" }}>VALORES</div>
          </div>

          <div style={comandaListaStyle}>
            {itens.length > 0 ? (
              itens.map((item) => (
                <div key={item.id} style={comandaLinhaCardStyle}>
                  <div style={comandaLinhaTopoStyle}>
                    <span style={comandaQtdBadgeStyle}>{Number(item.quantidade || 0)}x</span>
                    <div style={comandaNomeItemStyle} title={String(item.nome_produto || "")}>
                      {item.nome_produto}
                    </div>
                  </div>

                  <div style={comandaValoresLinhaStyle}>
                    <div style={comandaValorBlocoStyle}>
                      <span style={comandaValorLabelStyle}>PRECO</span>
                      <div style={moneyCellStyle}>
                        <span style={moneyCellPrefixStyle}>R$</span>
                        <span style={moneyCellAmountStyle}>{moedaNumero(item.preco_unitario)}</span>
                      </div>
                    </div>
                    <div style={comandaValorBlocoStyle}>
                      <span style={comandaValorLabelStyle}>TOTAL</span>
                      <div style={moneyCellStyle}>
                        <span style={moneyCellPrefixStyle}>R$</span>
                        <span style={{ ...moneyCellAmountStyle, fontWeight: 800 }}>
                          {moedaNumero(item.total_item)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: "#aeb6d3", fontSize: 13, padding: "8px 0" }}>
                Nenhum item na comanda.
              </div>
            )}
          </div>
        </div>

        {emPagamento && totalDinheiro > 0 && (
          <div style={fieldStyle}>
            <label style={fieldLabelStyle}>Valor recebido em dinheiro</label>
            <div style={valorInputWrapperStyle}>
              <span style={valorPrefixStyle}>R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={valorRecebidoDinheiro}
                onChange={(e) => setValorRecebidoDinheiro(e.target.value)}
                style={inputValorStyle}
                placeholder="0,00"
                disabled={processing}
              />
            </div>
          </div>
        )}

        <div style={totaisStyle}>
          <ResumoLinha label="Subtotal" valor={subtotal} />
          <ResumoLinha label={`Servico (${taxaAplicada}%)`} valor={taxaServicoValor} />
          {cobrarCouvert && <ResumoLinha label="Couvert artistico" valor={couvertTotal} />}
          <ResumoLinha label="Total" valor={total} destaque />
          {emPagamento && <ResumoLinha label="Pago informado" valor={totalInformado} />}
          {emPagamento && (
            <ResumoLinha
              label="Diferenca"
              valor={diferencaTotal}
              cor={Math.abs(diferencaTotal) > 0.05 ? "#ffb3bf" : "#a8ddb6"}
            />
          )}
          {dividirPorPessoa && Number(pessoas || 1) > 1 && (
            <ResumoLinha label="Total por pessoa" valor={totalPorPessoa} />
          )}
          {emPagamento && totalDinheiro > 0 && <ResumoLinha label="Troco" valor={troco} />}
        </div>

        {erro && (
          <div
            style={{
              marginBottom: 10,
              padding: "8px 10px",
              borderRadius: 10,
              background: "#3f1820",
              border: "1px solid #9b3b4d",
              fontSize: 14
            }}
          >
            {erro}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={cancelButtonStyle(processing)}
            disabled={processing}
          >
            Cancelar
          </button>

          <button type="submit" style={submitButtonStyle(processing)} disabled={processing}>
            {botaoSubmit}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmarImpressaoOpen}
        title="Confirmar impressao e pagamento"
        message="Confira abaixo o comprovante que sera impresso ao finalizar:"
        details={previewImpressao}
        confirmLabel="Imprimir e finalizar"
        cancelLabel="Voltar"
        processing={processing}
        onCancel={() => setConfirmarImpressaoOpen(false)}
        onConfirm={handleConfirmarImpressaoFinal}
      />
    </div>
  );
}

const formStyle = {
  width: "100%",
  maxWidth: 500,
  background: "#14172d",
  color: "#fff",
  borderRadius: 20,
  padding: 20,
  border: "1px solid #2f3454",
  maxHeight: "calc(100vh - 20px)",
  overflowY: "auto"
};

const descricaoStyle = {
  marginTop: -6,
  marginBottom: 14,
  color: "#b7bfda",
  fontSize: 14
};

const fieldStyle = {
  display: "grid",
  gap: 6,
  marginBottom: 10
};

const fieldLabelStyle = {
  color: "#dfe4fa"
};

const inputStyle = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #363d60",
  background: "#0f1223",
  color: "#fff",
  boxSizing: "border-box"
};

const selectButtonStyle = {
  width: "100%",
  minWidth: 0,
  minHeight: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #363d60",
  background: "#0f1223",
  color: "#fff",
  boxSizing: "border-box"
};

const taxaBoxStyle = {
  marginBottom: 12,
  padding: 10,
  borderRadius: 12,
  border: "1px solid #31395e",
  background: "#12162c"
};

const checkLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
  cursor: "pointer"
};

const totaisStyle = {
  background: "#1b1f37",
  borderRadius: 14,
  padding: 14,
  margin: "16px 0",
  border: "1px solid #30385b"
};

const pagamentoLinhaStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(140px, 180px) auto",
  gap: 8,
  alignItems: "center"
};

const valorInputWrapperStyle = {
  display: "grid",
  gridTemplateColumns: "46px minmax(0, 1fr)",
  borderRadius: 10,
  border: "1px solid #363d60",
  background: "#0f1223",
  overflow: "hidden"
};

const valorPrefixStyle = {
  display: "grid",
  placeItems: "center",
  color: "#c7d3ff",
  background: "#161c38",
  borderRight: "1px solid #363d60",
  fontWeight: 700
};

const inputValorStyle = {
  width: "100%",
  padding: 10,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#fff",
  boxSizing: "border-box",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums"
};

const comandaBoxStyle = {
  marginBottom: 12,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #31395e",
  background: "linear-gradient(180deg, #141a32 0%, #10162b 100%)"
};

const comandaHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8
};

const comandaTabelaHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 12,
  padding: "8px 0",
  borderBottom: "1px dashed #3a4368",
  color: "#b7c2e6",
  fontSize: 12,
  fontWeight: 700
};

const comandaListaStyle = {
  maxHeight: 168,
  overflowY: "auto",
  display: "grid",
  gap: 8,
  paddingTop: 6
};

const comandaLinhaCardStyle = {
  border: "1px solid #2a3254",
  borderRadius: 10,
  background: "#111930",
  padding: 8,
  display: "grid",
  gap: 8
};

const comandaLinhaTopoStyle = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  gap: 8,
  alignItems: "center",
  color: "#edf2ff"
};

const comandaQtdBadgeStyle = {
  border: "1px solid #46507a",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 800,
  color: "#dbe4ff",
  background: "#1a2240"
};

const comandaNomeItemStyle = {
  minWidth: 0,
  fontWeight: 700,
  lineHeight: 1.2,
  wordBreak: "break-word"
};

const comandaValoresLinhaStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8
};

const comandaValorBlocoStyle = {
  border: "1px solid #303a61",
  borderRadius: 8,
  padding: "6px 8px",
  display: "grid",
  gap: 4,
  alignItems: "center"
};

const comandaValorLabelStyle = {
  fontSize: 11,
  letterSpacing: 0.3,
  fontWeight: 700,
  color: "#b7c2e6"
};

const miniActionButtonStyle = {
  border: "1px solid #3d4770",
  borderRadius: 10,
  padding: "8px 10px",
  fontWeight: 700,
  background: "#1b213c",
  color: "#d7def9",
  cursor: "pointer"
};

function removeLinhaButtonStyle(disabled) {
  return {
    border: "1px solid #7a3b49",
    borderRadius: 10,
    padding: "9px 10px",
    fontWeight: 700,
    background: disabled ? "#4f2630" : "#4c1d27",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    minWidth: 88
  };
}

function cancelButtonStyle(disabled) {
  return {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #545c7f",
    background: "transparent",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer"
  };
}

function submitButtonStyle(disabled) {
  return {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    border: "none",
    background: disabled ? "#4b5877" : "#1c9a5e",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700
  };
}

function ResumoLinha({ label, valor, destaque = false, cor = "#fff" }) {
  return (
    <div style={resumoLinhaStyle}>
      <span style={{ ...resumoLabelStyle, fontWeight: destaque ? 800 : 600, color: cor }}>{label}</span>
      <span style={resumoMoneyStyle(destaque, cor)}>
        <span style={resumoMoneyPrefixStyle}>R$</span>
        <span>{moedaNumero(valor)}</span>
      </span>
    </div>
  );
}

const resumoLinhaStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 8,
  marginBottom: 4
};

const resumoLabelStyle = {
  minWidth: 0
};

function resumoMoneyStyle(destaque, cor) {
  return {
    display: "grid",
    gridTemplateColumns: "16px auto",
    alignItems: "center",
    justifyItems: "end",
    columnGap: 4,
    minWidth: 124,
    color: cor,
    fontWeight: destaque ? 800 : 700,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap"
  };
}

const resumoMoneyPrefixStyle = {
  justifySelf: "start"
};

const moneyCellStyle = {
  display: "grid",
  gridTemplateColumns: "16px auto",
  justifyContent: "end",
  justifyItems: "end",
  alignItems: "center",
  columnGap: 4,
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums"
};

const moneyCellPrefixStyle = {
  justifySelf: "start",
  color: "#b7c5f1"
};

const moneyCellAmountStyle = {
  textAlign: "right"
};
