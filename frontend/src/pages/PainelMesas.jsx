import React, { useEffect, useMemo, useRef, useState } from "react";
import CardMesa from "../components/CardMesa";
import ListaProdutos from "../components/ListaProdutos";
import ModalPagamento from "../components/ModalPagamento";
import SelectField from "../components/SelectField";
import TouchKeyboard from "../components/TouchKeyboard";
import ConfirmDialog from "../components/ConfirmDialog";
import { useApp } from "../context/AppContext";
import { imprimirConta } from "../services/print";

const TOUCH_STORAGE_KEY = "garcom_touch_mode";

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export default function PainelMesas() {
  const {
    mesas,
    produtos,
    role,
    mesaSelecionada,
    pedidoAtivo,
    selecionarMesa,
    criarMesa,
    excluirMesa,
    abrirMesa,
    adicionarItem,
    atualizarQuantidadeItem,
    removerItem,
    fecharMesa,
    retomarFechamentoMesa,
    pagarMesa,
    configImpressao,
    configuracaoImpressaoAtual,
    configuracoes
  } = useApp();

  const [clienteNome, setClienteNome] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [buscaMesa, setBuscaMesa] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const [novaMesaNumero, setNovaMesaNumero] = useState("");
  const [modalMode, setModalMode] = useState("fechar");
  const [touchMode, setTouchMode] = useState(() => localStorage.getItem(TOUCH_STORAGE_KEY) === "1");
  const [tecladoBuscaMesaAberto, setTecladoBuscaMesaAberto] = useState(false);
  const [alturaAside, setAlturaAside] = useState(null);
  const [confirmExcluirMesaOpen, setConfirmExcluirMesaOpen] = useState(false);
  const [pinSegurancaMesa, setPinSegurancaMesa] = useState("");
  const [exclusaoForcadaMesa, setExclusaoForcadaMesa] = useState(false);
  const [modalProdutosOpen, setModalProdutosOpen] = useState(false);
  const [janelaMesaOpen, setJanelaMesaOpen] = useState(false);
  const asideRef = useRef(null);
  const modoTouchAtivo = role === "GARCOM" && touchMode;

  useEffect(() => {
    localStorage.setItem(TOUCH_STORAGE_KEY, touchMode ? "1" : "0");
  }, [touchMode]);

  useEffect(() => {
    if (role !== "GARCOM" && touchMode) {
      setTouchMode(false);
    }
  }, [role, touchMode]);

  useEffect(() => {
    if (!modoTouchAtivo) {
      setTecladoBuscaMesaAberto(false);
    }
  }, [modoTouchAtivo]);

  useEffect(() => {
    function atualizarAlturaAside() {
      const asideEl = asideRef.current;
      if (!asideEl) return;
      const top = asideEl.getBoundingClientRect().top;
      const alturaDisponivel = Math.floor(window.innerHeight - top - 12);
      setAlturaAside(Math.max(420, alturaDisponivel));
    }

    atualizarAlturaAside();
    window.addEventListener("resize", atualizarAlturaAside);
    return () => window.removeEventListener("resize", atualizarAlturaAside);
  }, [mesaSelecionada?.id, modoTouchAtivo]);

  useEffect(() => {
    if (!mesaSelecionada || mesaSelecionada.status !== "OCUPADA") {
      setModalProdutosOpen(false);
    }
  }, [mesaSelecionada?.id, mesaSelecionada?.status]);

  useEffect(() => {
    if (!mesaSelecionada) {
      setJanelaMesaOpen(false);
    }
  }, [mesaSelecionada?.id]);

  useEffect(() => {
    if (!modalProdutosOpen) return undefined;

    function onEsc(event) {
      if (event.key === "Escape") {
        setModalProdutosOpen(false);
      }
    }

    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [modalProdutosOpen]);

  useEffect(() => {
    function onAtalhos(event) {
      if (!mesaSelecionada || mesaSelecionada.status !== "OCUPADA") return;
      if (event.key === "F3") {
        event.preventDefault();
        setModalProdutosOpen(true);
      }
    }
    document.addEventListener("keydown", onAtalhos);
    return () => document.removeEventListener("keydown", onAtalhos);
  }, [mesaSelecionada?.id, mesaSelecionada?.status]);

  useEffect(() => {
    if (!janelaMesaOpen) return undefined;

    function onEsc(event) {
      if (event.key !== "Escape") return;
      setModalProdutosOpen(false);
      setJanelaMesaOpen(false);
    }

    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [janelaMesaOpen]);

  const pedido = pedidoAtivo?.pedido;
  const itens = pedidoAtivo?.itens || [];
  const taxaServicoPercent = Number(pedido?.taxa_servico_percent || 0);
  const bloqueado = finalizando;

  const mesasFiltradas = useMemo(() => {
    const termo = buscaMesa.trim().toLowerCase();

    return mesas.filter((mesa) => {
      const statusOk = filtroStatus === "TODOS" || mesa.status === filtroStatus;
      const buscaOk =
        termo.length === 0 ||
        String(mesa.numero).includes(termo) ||
        String(mesa.cliente_nome || "").toLowerCase().includes(termo);

      return statusOk && buscaOk;
    });
  }, [mesas, filtroStatus, buscaMesa]);

  const statusOptions = useMemo(
    () => [
      { value: "TODOS", label: "Todos" },
      { value: "LIVRE", label: "Livre" },
      { value: "OCUPADA", label: "Ocupada" },
      { value: "FECHANDO", label: "Fechando" }
    ],
    []
  );

  async function handleCriarMesa() {
    const numero = novaMesaNumero.trim() ? Number(novaMesaNumero) : null;
    const mesaCriada = await criarMesa(numero);
    if (mesaCriada) {
      setNovaMesaNumero("");
      selecionarMesa(mesaCriada);
    }
  }

  async function handleCriarProximaMesa() {
    const mesaCriada = await criarMesa(null);
    if (mesaCriada) {
      setNovaMesaNumero("");
      selecionarMesa(mesaCriada);
    }
  }

  async function handleAbrirMesa() {
    if (!mesaSelecionada) return;
    if (configuracoes.exigir_nome_cliente && !clienteNome.trim()) {
      alert("Informe o nome do cliente para abrir a mesa.");
      return;
    }
    const resultado = await abrirMesa(mesaSelecionada.id, clienteNome);
    if (resultado) {
      setClienteNome("");
    }
  }

  function handleImprimirPreConta() {
    if (!mesaSelecionada || !pedido) return;
    imprimirConta(mesaSelecionada, pedido, itens, null, configuracaoImpressaoAtual);
  }

  function handleAbrirFechamento() {
    setModalMode("fechar");
    setModalOpen(true);
  }

  function handleAbrirPagamento() {
    setModalMode("pagar");
    setModalOpen(true);
  }

  async function handleExcluirMesa() {
    if (!mesaSelecionada) return;
    setExclusaoForcadaMesa(mesaSelecionada.status !== "LIVRE");
    setConfirmExcluirMesaOpen(true);
  }

  async function confirmarExcluirMesa() {
    if (!mesaSelecionada) return;
    const pinNormalizado = String(pinSegurancaMesa || "").trim();
    if (!/^\d{4,8}$/.test(pinNormalizado)) {
      alert("Informe o PIN do gerente (4 a 8 numeros) para excluir mesa.");
      return;
    }

    const resultado = await excluirMesa(mesaSelecionada.id, pinNormalizado, exclusaoForcadaMesa);
    if (resultado) {
      setClienteNome("");
      setPinSegurancaMesa("");
      setExclusaoForcadaMesa(false);
    }
    setConfirmExcluirMesaOpen(false);
  }

  async function handleAdicionarItem(produtoId, quantidade) {
    if (!mesaSelecionada) return;
    await adicionarItem(mesaSelecionada.id, produtoId, quantidade);
  }

  async function handleAjustarQuantidade(item, proximaQuantidade) {
    if (!mesaSelecionada) return;

    if (proximaQuantidade < 1) {
      await removerItem(mesaSelecionada.id, item.id);
      return;
    }

    await atualizarQuantidadeItem(mesaSelecionada.id, item.id, proximaQuantidade);
  }

  async function handleRetomarFechamento() {
    if (!mesaSelecionada) return;
    await retomarFechamentoMesa(mesaSelecionada.id);
  }

  async function handleAbrirJanelaMesa(mesa) {
    await selecionarMesa(mesa);
    setJanelaMesaOpen(true);
  }

  async function handleConfirmarModal(dados) {
    if (!mesaSelecionada) return false;

    setFinalizando(true);

    try {
      if (modalMode === "fechar") {
        const fechamento = await fecharMesa(mesaSelecionada.id, dados);
        if (!fechamento) return false;
        setModalOpen(false);
        return true;
      }

      const pagamento = await pagarMesa(mesaSelecionada.id, dados);
      if (!pagamento) return false;

      const pedidoImpresso = pagamento.pedido || pedido;
      if (configImpressao.auto_imprimir_pagamento) {
        const pagamentosImpressao =
          pagamento?.pagamentos ||
          pedidoImpresso?.pagamentos ||
          (dados?.pagamentos || []);
        const pagamentoDinheiro = pagamentosImpressao.find(
          (item) => String(item?.forma_pagamento || "").toUpperCase() === "DINHEIRO"
        );

        imprimirConta(
          mesaSelecionada,
          pedidoImpresso,
          itens,
          {
            forma_pagamento: pedidoImpresso?.forma_pagamento || dados.forma_pagamento,
            valor_recebido:
              pedidoImpresso?.valor_recebido ??
              pagamentoDinheiro?.valor_recebido ??
              dados.valor_recebido_dinheiro,
            troco: pagamento.troco,
            pagamentos: pagamentosImpressao
          },
          configuracaoImpressaoAtual
        );
      }

      setModalOpen(false);
      return true;
    } finally {
      setFinalizando(false);
    }
  }

  return (
    <div style={painelGridStyle(modoTouchAtivo)}>
      <section style={{ minWidth: 0 }}>
        <div style={tituloAreaStyle}>
          <h2 style={{ marginTop: 0, fontSize: modoTouchAtivo ? 34 : 32 }}>Mesas e comandas</h2>
          {role === "GARCOM" && (
            <button
              type="button"
              onClick={() => setTouchMode((prev) => !prev)}
              style={touchToggleStyle(modoTouchAtivo)}
            >
              Modo touch: {modoTouchAtivo ? "ON" : "OFF"}
            </button>
          )}
        </div>

        {(role === "GERENTE" || role === "GARCOM") && (
          <div style={novoBlocoStyle}>
            <div style={{ fontWeight: 700 }}>Nova mesa</div>
            <div style={{ color: "#b0b7d3", fontSize: 13 }}>
              Deixe em branco para gerar o proximo numero automaticamente.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <input
                type="number"
                min="1"
                value={novaMesaNumero}
                onChange={(e) => setNovaMesaNumero(e.target.value)}
                placeholder="Numero da mesa (opcional)"
                style={{ ...inputStyle(modoTouchAtivo), maxWidth: 220 }}
                disabled={bloqueado}
              />
              <button
                onClick={handleCriarMesa}
                style={primaryButtonStyle(bloqueado, modoTouchAtivo)}
                disabled={bloqueado}
              >
                Criar mesa
              </button>
              <button
                onClick={handleCriarProximaMesa}
                style={secondaryButtonStyle(bloqueado, modoTouchAtivo)}
                disabled={bloqueado}
              >
                Gerar proxima
              </button>
            </div>
          </div>
        )}

        <div style={filtrosMesasStyle(modoTouchAtivo)}>
          <input
            value={buscaMesa}
            onChange={(e) => setBuscaMesa(e.target.value)}
            onFocus={() => {
              if (modoTouchAtivo && configuracoes.teclado_touch_automatico) {
                setTecladoBuscaMesaAberto(true);
              }
            }}
            onClick={() => {
              if (modoTouchAtivo && configuracoes.teclado_touch_automatico) {
                setTecladoBuscaMesaAberto(true);
              }
            }}
            placeholder="Buscar mesa por numero ou cliente"
            style={inputStyle(modoTouchAtivo)}
            readOnly={modoTouchAtivo && configuracoes.teclado_touch_automatico}
            inputMode={modoTouchAtivo && configuracoes.teclado_touch_automatico ? "none" : "text"}
          />

          <SelectField
            value={filtroStatus}
            onChange={setFiltroStatus}
            options={statusOptions}
            wrapperStyle={statusSelectWrapperStyle(modoTouchAtivo)}
            buttonStyle={statusSelectButtonStyle(modoTouchAtivo)}
          />
        </div>

        <div style={mesasListStyle(modoTouchAtivo)}>
          {mesasFiltradas.map((mesa) => (
            <CardMesa
              key={mesa.id}
              mesa={mesa}
              selected={mesaSelecionada?.id === mesa.id}
              onClick={() => handleAbrirJanelaMesa(mesa)}
              touchMode={modoTouchAtivo}
              searchTerm={buscaMesa}
            />
          ))}
        </div>

        {mesasFiltradas.length === 0 && (
          <p style={{ color: "#b2b8d2", marginTop: 10 }}>Nenhuma mesa encontrada para o filtro atual.</p>
        )}
      </section>

      {janelaMesaOpen && (
        <div
          style={mesaJanelaBackdropStyle}
          onClick={() => {
            setModalProdutosOpen(false);
            setJanelaMesaOpen(false);
          }}
        />
      )}

      <aside ref={asideRef} style={asideStyle(modoTouchAtivo, alturaAside, janelaMesaOpen)}>
        {!janelaMesaOpen && (
          <div style={painelMesaFechadoStyle}>
            <strong>Clique em uma mesa para abrir a janela de atendimento.</strong>
            {mesaSelecionada && (
              <button
                type="button"
                onClick={() => setJanelaMesaOpen(true)}
                style={secondaryButtonStyle(false, modoTouchAtivo)}
              >
                Reabrir mesa {mesaSelecionada.numero}
              </button>
            )}
          </div>
        )}

        {janelaMesaOpen && !mesaSelecionada && <p>Selecione uma mesa para comecar.</p>}

        {janelaMesaOpen && mesaSelecionada && (
          <>
            <div style={janelaMesaHeaderStyle}>
              <h2 style={{ marginTop: 0, marginBottom: 0, fontSize: modoTouchAtivo ? 36 : 30 }}>
                Mesa {mesaSelecionada.numero}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setModalProdutosOpen(false);
                  setJanelaMesaOpen(false);
                }}
                style={secondaryButtonStyle(false, modoTouchAtivo)}
              >
                Fechar janela
              </button>
            </div>
            <p style={{ fontSize: modoTouchAtivo ? 19 : 16 }}>Status: {mesaSelecionada.status}</p>

            {mesaSelecionada.cliente_nome && (
              <p style={{ fontSize: modoTouchAtivo ? 19 : 16 }}>Cliente: {mesaSelecionada.cliente_nome}</p>
            )}

            {mesaSelecionada.status === "LIVRE" && (
              <>
                <input
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                  placeholder={
                    configuracoes.exigir_nome_cliente
                      ? "Nome do cliente (obrigatorio)"
                      : "Nome do cliente (opcional)"
                  }
                  style={{
                    ...inputStyle(modoTouchAtivo),
                    width: "100%",
                    marginBottom: 12,
                    flex: "0 0 auto",
                    minWidth: 0
                  }}
                  disabled={bloqueado}
                />

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={handleAbrirMesa}
                    style={primaryButtonStyle(bloqueado, modoTouchAtivo)}
                    disabled={bloqueado}
                  >
                    Abrir mesa
                  </button>

                  {role === "GERENTE" && (
                    <button
                      onClick={handleExcluirMesa}
                      style={dangerButtonStyle(bloqueado, modoTouchAtivo)}
                      disabled={bloqueado}
                    >
                      Excluir mesa
                    </button>
                  )}
                </div>
              </>
            )}

            {mesaSelecionada.status !== "LIVRE" && (
              <>
                {mesaSelecionada.status === "OCUPADA" && (
                  <div style={produtoAtalhoBarStyle}>
                    <button
                      onClick={() => setModalProdutosOpen(true)}
                      style={primaryButtonStyle(bloqueado, modoTouchAtivo)}
                      disabled={bloqueado}
                    >
                      Produtos (F3)
                    </button>
                    <span style={{ color: "#aeb7d7", fontSize: modoTouchAtivo ? 16 : 13 }}>
                      Toque para abrir o catalogo em tela cheia.
                    </span>
                  </div>
                )}

                <div style={detalhesContaScrollStyle(modoTouchAtivo)}>
                  <div style={pedidoResumoStyle(modoTouchAtivo)}>
                    <div style={{ fontSize: modoTouchAtivo ? 19 : 16 }}>Subtotal: {moeda(pedido?.subtotal)}</div>
                    <div style={{ fontSize: modoTouchAtivo ? 19 : 16 }}>
                      Servico ({taxaServicoPercent}%): {moeda(pedido?.taxa_servico_valor)}
                    </div>
                    {Number(pedido?.couvert_artistico_total || 0) > 0 && (
                      <div style={{ fontSize: modoTouchAtivo ? 19 : 16 }}>
                        Couvert artistico: {moeda(pedido?.couvert_artistico_total)}
                      </div>
                    )}
                    <div style={{ fontSize: modoTouchAtivo ? 23 : 18, fontWeight: 700 }}>
                      Total: {moeda(pedido?.total)}
                    </div>
                  </div>
                  <h3 style={{ fontSize: modoTouchAtivo ? 28 : 24 }}>Itens da conta</h3>

                  <div style={itensListaStyle(modoTouchAtivo)}>
                    {itens.length > 0 ? (
                      itens.map((item) => (
                        <div key={item.id} style={itemCardStyle(modoTouchAtivo)}>
                          <div style={{ fontWeight: 700, fontSize: modoTouchAtivo ? 24 : 18 }}>
                            {item.nome_produto}
                          </div>
                          <div
                            style={{ color: "#aeb4cc", margin: "4px 0 8px", fontSize: modoTouchAtivo ? 18 : 16 }}
                          >
                            {item.quantidade}x - {moeda(item.preco_unitario)} - {moeda(item.total_item)}
                          </div>

                          <div style={itemAcoesStyle(modoTouchAtivo)}>
                            <button
                              onClick={() => handleAjustarQuantidade(item, item.quantidade - 1)}
                              disabled={bloqueado}
                              style={miniButtonStyle(bloqueado, modoTouchAtivo)}
                            >
                              -
                            </button>

                            <span style={itemQuantidadeStyle(modoTouchAtivo)}>{item.quantidade}</span>

                            <button
                              onClick={() => handleAjustarQuantidade(item, item.quantidade + 1)}
                              disabled={bloqueado}
                              style={miniButtonStyle(bloqueado, modoTouchAtivo)}
                            >
                              +
                            </button>

                            <button
                              onClick={() => removerItem(mesaSelecionada.id, item.id)}
                              disabled={bloqueado}
                              style={removeButtonStyle(bloqueado, modoTouchAtivo)}
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p>Nenhum item adicionado ainda.</p>
                    )}
                  </div>
                </div>

                <div style={acoesMesaFixaStyle(modoTouchAtivo)}>
                  <button
                    onClick={handleImprimirPreConta}
                    style={secondaryButtonStyle(bloqueado || !pedido, modoTouchAtivo)}
                    disabled={bloqueado || !pedido}
                  >
                    Imprimir pre-conta
                  </button>

                  <div style={{ display: "grid", gap: 8 }}>
                    {mesaSelecionada.status === "OCUPADA" && (
                      <button
                        onClick={handleAbrirFechamento}
                        style={successButtonStyle(bloqueado || !pedido, modoTouchAtivo)}
                        disabled={bloqueado || !pedido}
                      >
                        Ir para fechamento
                      </button>
                    )}

                    {mesaSelecionada.status === "FECHANDO" && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={handleRetomarFechamento}
                          style={warningButtonStyle(bloqueado, modoTouchAtivo)}
                          disabled={bloqueado}
                        >
                          Voltar para consumo
                        </button>

                        <button
                          onClick={handleAbrirPagamento}
                          style={successButtonStyle(bloqueado || !pedido, modoTouchAtivo)}
                          disabled={bloqueado || !pedido}
                        >
                          Finalizar pagamento
                        </button>
                      </div>
                    )}

                    {role === "GERENTE" && (
                      <button
                        type="button"
                        onClick={handleExcluirMesa}
                        style={dangerButtonStyle(bloqueado, modoTouchAtivo)}
                        disabled={bloqueado}
                      >
                        Excluir mesa
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            <ModalPagamento
              open={modalOpen}
              onClose={() => setModalOpen(false)}
              onConfirm={handleConfirmarModal}
              pedido={pedido}
              mesa={mesaSelecionada}
              itens={itens}
              processing={bloqueado}
              mode={modalMode}
            />

            <ConfirmDialog
              open={confirmExcluirMesaOpen}
              title={`Excluir mesa ${mesaSelecionada.numero}`}
              message={
                exclusaoForcadaMesa
                  ? "A mesa esta em uso. A exclusao forcada vai cancelar o pedido em aberto e devolver itens ao estoque."
                  : "Essa acao remove a mesa e nao pode ser desfeita."
              }
              details="Seguranca: confirme com o PIN do gerente."
              confirmLabel="Excluir mesa"
              cancelLabel="Cancelar"
              processing={bloqueado}
              variant="danger"
              onCancel={() => {
                setConfirmExcluirMesaOpen(false);
                setPinSegurancaMesa("");
                setExclusaoForcadaMesa(false);
              }}
              onConfirm={confirmarExcluirMesa}
              confirmDisabled={!/^\d{4,8}$/.test(String(pinSegurancaMesa || "").trim())}
            >
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pinSegurancaMesa}
                onChange={(event) => setPinSegurancaMesa(event.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="PIN gerente (4 a 8 numeros)"
                style={inputStyle(modoTouchAtivo)}
              />
            </ConfirmDialog>
          </>
        )}
      </aside>

      <TouchKeyboard
        open={modoTouchAtivo && configuracoes.teclado_touch_automatico && tecladoBuscaMesaAberto}
        value={buscaMesa}
        onChange={setBuscaMesa}
        onClose={() => setTecladoBuscaMesaAberto(false)}
        title="Buscar mesa ou cliente"
      />

      {modalProdutosOpen && mesaSelecionada?.status === "OCUPADA" && (
        <div style={modalProdutosOverlayStyle}>
          <div style={modalProdutosCardStyle(modoTouchAtivo)}>
            <div style={modalProdutosHeaderStyle}>
              <h3 style={{ margin: 0, fontSize: modoTouchAtivo ? 30 : 24 }}>
                Adicionar produtos - Mesa {mesaSelecionada.numero}
              </h3>
              <button
                type="button"
                onClick={() => setModalProdutosOpen(false)}
                style={secondaryButtonStyle(false, modoTouchAtivo)}
              >
                Fechar
              </button>
            </div>

            <ListaProdutos
              produtos={produtos}
              onAdd={handleAdicionarItem}
              disabled={bloqueado}
              touchMode={modoTouchAtivo}
              tecladoTouchAutomatico={configuracoes.teclado_touch_automatico}
              modal
            />
          </div>
        </div>
      )}
    </div>
  );
}

function painelGridStyle(touchMode) {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${touchMode ? 360 : 320}px, 1fr))`,
    gap: touchMode ? 16 : 18,
    touchAction: touchMode ? "manipulation" : "auto"
  };
}

function filtrosMesasStyle(touchMode) {
  return {
    display: "flex",
    gap: 8,
    flexWrap: touchMode ? "wrap" : "nowrap",
    alignItems: "stretch",
    marginBottom: 12
  };
}

function mesasListStyle(touchMode) {
  return {
    display: "grid",
    gridTemplateColumns: touchMode
      ? "repeat(auto-fit, minmax(200px, 1fr))"
      : "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12
  };
}

function inputStyle(touchMode) {
  return {
    flex: 1,
    minWidth: 200,
    minHeight: touchMode ? 48 : "auto",
    padding: touchMode ? "10px 12px" : 10,
    borderRadius: touchMode ? 14 : 10,
    border: "1px solid #363d60",
    background: "#11152b",
    color: "#fff",
    fontSize: touchMode ? 18 : 16
  };
}

function statusSelectWrapperStyle(touchMode) {
  return {
    width: touchMode ? 220 : 170,
    minWidth: touchMode ? 220 : 170,
    flex: "0 0 auto"
  };
}

function statusSelectButtonStyle(touchMode) {
  return {
    minHeight: touchMode ? 48 : "auto",
    padding: touchMode ? "10px 12px" : 10,
    borderRadius: touchMode ? 14 : 10,
    border: "1px solid #363d60",
    background: "#11152b",
    fontSize: touchMode ? 18 : 16
  };
}

function asideStyle(touchMode, alturaAside = null, janelaOpen = false) {
  if (janelaOpen) {
    return {
      background: "#161a2f",
      borderRadius: touchMode ? 24 : 20,
      padding: touchMode ? 20 : 18,
      border: "1px solid #2d3352",
      minWidth: 0,
      position: "fixed",
      inset: "18px",
      margin: "auto",
      width: "min(980px, calc(100vw - 24px))",
      height: "min(92vh, 920px)",
      maxHeight: "92vh",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      zIndex: 132,
      boxShadow: "0 18px 44px rgba(0, 0, 0, 0.48)"
    };
  }

  return {
    background: "#161a2f",
    borderRadius: touchMode ? 24 : 20,
    padding: touchMode ? 20 : 18,
    border: "1px solid #2d3352",
    minWidth: 0,
    height: alturaAside ? `${alturaAside}px` : undefined,
    maxHeight: alturaAside ? `${alturaAside}px` : "calc(100vh - 24px)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: 10
  };
}

function detalhesContaScrollStyle(touchMode) {
  return {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingRight: 4,
    paddingBottom: 10
  };
}

function pedidoResumoStyle(touchMode) {
  return {
    background: "#111429",
    borderRadius: touchMode ? 16 : 14,
    padding: touchMode ? 16 : 12,
    marginBottom: 14,
    border: "1px solid #2d3352",
    display: "grid",
    gap: touchMode ? 8 : 4
  };
}

function itemCardStyle(touchMode) {
  return {
    border: "1px solid #2d3352",
    borderRadius: touchMode ? 16 : 12,
    padding: touchMode ? 14 : 10,
    background: "#12172c"
  };
}

function itensListaStyle(touchMode) {
  return {
    display: "grid",
    gap: touchMode ? 10 : 8,
    maxHeight: "none",
    overflow: "visible",
    paddingRight: 4,
    marginBottom: 6
  };
}

function itemAcoesStyle(touchMode) {
  return {
    display: "flex",
    gap: touchMode ? 10 : 6,
    alignItems: "center",
    flexWrap: "wrap"
  };
}

function itemQuantidadeStyle(touchMode) {
  return {
    minWidth: touchMode ? 58 : 26,
    minHeight: touchMode ? 46 : "auto",
    borderRadius: touchMode ? 14 : 0,
    border: touchMode ? "1px solid #48507a" : "none",
    background: touchMode ? "#0f152a" : "transparent",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    fontWeight: 700,
    fontSize: touchMode ? 20 : 16,
    padding: touchMode ? "0 8px" : 0
  };
}

function acoesMesaFixaStyle(touchMode) {
  return {
    borderTop: "1px solid #2d3352",
    paddingTop: 10,
    background: "#161a2f",
    display: "grid",
    gap: 8
  };
}

const novoBlocoStyle = {
  border: "1px solid #2d3352",
  borderRadius: 12,
  background: "#151a31",
  padding: 12,
  marginBottom: 12
};

function primaryButtonStyle(disabled, touchMode = false) {
  return {
    minWidth: touchMode ? 110 : 102,
    minHeight: touchMode ? 48 : "auto",
    padding: touchMode ? "10px 14px" : "9px 11px",
    borderRadius: touchMode ? 14 : 12,
    border: "none",
    background: disabled ? "#5e6484" : "#2e63f4",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
    fontSize: touchMode ? 18 : 14,
    touchAction: "manipulation"
  };
}

function secondaryButtonStyle(disabled, touchMode = false) {
  return {
    minWidth: touchMode ? 130 : 112,
    minHeight: touchMode ? 48 : "auto",
    padding: touchMode ? "10px 14px" : "9px 11px",
    borderRadius: touchMode ? 14 : 12,
    border: "1px solid #3d4770",
    background: disabled ? "#252a44" : "#1b213c",
    color: "#d7def9",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
    fontSize: touchMode ? 18 : 14,
    touchAction: "manipulation"
  };
}

function successButtonStyle(disabled, touchMode = false) {
  return {
    flex: 1,
    minHeight: touchMode ? 52 : "auto",
    padding: touchMode ? "10px 14px" : "9px 11px",
    borderRadius: touchMode ? 14 : 12,
    border: "none",
    background: disabled ? "#5e6484" : "#1c9a5e",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
    fontSize: touchMode ? 18 : 14,
    touchAction: "manipulation"
  };
}

function warningButtonStyle(disabled, touchMode = false) {
  return {
    flex: 1,
    minHeight: touchMode ? 52 : "auto",
    padding: touchMode ? "10px 14px" : "9px 11px",
    borderRadius: touchMode ? 14 : 12,
    border: "1px solid #b4832d",
    background: disabled ? "#665330" : "#3b2a0f",
    color: "#ffd89a",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
    fontSize: touchMode ? 18 : 14,
    touchAction: "manipulation"
  };
}

function miniButtonStyle(disabled, touchMode = false) {
  return {
    width: touchMode ? 46 : 30,
    height: touchMode ? 46 : 30,
    borderRadius: touchMode ? 14 : 8,
    border: "1px solid #50597f",
    background: "#1d2240",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: touchMode ? 22 : 16,
    fontWeight: 800,
    touchAction: "manipulation"
  };
}

function removeButtonStyle(disabled, touchMode = false) {
  return {
    marginLeft: "auto",
    minHeight: touchMode ? 46 : "auto",
    padding: touchMode ? "8px 12px" : "6px 9px",
    borderRadius: touchMode ? 12 : 8,
    border: "1px solid #7a3b49",
    background: "#4c1d27",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: touchMode ? 800 : 600,
    fontSize: touchMode ? 16 : 13,
    touchAction: "manipulation"
  };
}

function dangerButtonStyle(disabled, touchMode = false) {
  return {
    minWidth: touchMode ? 120 : 106,
    minHeight: touchMode ? 48 : "auto",
    padding: touchMode ? "10px 14px" : "9px 11px",
    borderRadius: touchMode ? 14 : 12,
    border: "1px solid #7a3b49",
    background: disabled ? "#4f2630" : "#4c1d27",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
    fontSize: touchMode ? 18 : 14,
    touchAction: "manipulation"
  };
}

const tituloAreaStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap"
};

function touchToggleStyle(active) {
  return {
    border: active ? "1px solid #2e63f4" : "1px solid #3d4770",
    background: active ? "#2e63f4" : "#1b213c",
    color: "#fff",
    borderRadius: 10,
    padding: "8px 12px",
    fontWeight: 700,
    cursor: "pointer"
  };
}

const modalProdutosOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(5, 8, 18, 0.78)",
  backdropFilter: "blur(2px)",
  zIndex: 133,
  display: "grid",
  placeItems: "center",
  padding: 16
};

const mesaJanelaBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(6, 9, 20, 0.72)",
  backdropFilter: "blur(2px)",
  zIndex: 131
};

const painelMesaFechadoStyle = {
  border: "1px dashed #3a4778",
  borderRadius: 12,
  background: "#121935",
  padding: 14,
  display: "grid",
  gap: 10
};

const janelaMesaHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap"
};

function modalProdutosCardStyle(touchMode) {
  const larguraBase = touchMode ? 1040 : 980;
  const alturaBase = touchMode ? 820 : 760;

  return {
    width: `min(${larguraBase}px, 96vw)`,
    height: `min(${alturaBase}px, 92vh)`,
    overflow: "hidden",
    borderRadius: touchMode ? 20 : 16,
    border: "1px solid #324176",
    background: "linear-gradient(145deg, #151c36 0%, #0f152b 100%)",
    boxShadow: "0 18px 44px rgba(0, 0, 0, 0.45)",
    padding: touchMode ? 16 : 14,
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    gap: 10
  };
}

const modalProdutosHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap"
};

const produtoAtalhoBarStyle = {
  border: "1px solid #334271",
  background: "#111a34",
  borderRadius: 12,
  padding: "10px 12px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap"
};
