import React, { useEffect, useMemo, useState } from "react";
import SelectField from "./SelectField";
import TouchKeyboard from "./TouchKeyboard";

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export default function ListaProdutos({
  produtos,
  onAdd,
  disabled = false,
  touchMode = false,
  tecladoTouchAutomatico = true,
  modal = false
}) {
  const [categoria, setCategoria] = useState("TODOS");
  const [busca, setBusca] = useState("");
  const [quantidades, setQuantidades] = useState({});
  const [addingId, setAddingId] = useState(null);
  const [tecladoBuscaAberto, setTecladoBuscaAberto] = useState(false);

  function normalizarCategoria(categoriaRaw) {
    return String(categoriaRaw || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  const categorias = useMemo(() => {
    const mapa = new Map();
    for (const item of produtos || []) {
      const categoriaOriginal = String(item?.categoria || "").trim();
      if (!categoriaOriginal) continue;
      const chave = normalizarCategoria(categoriaOriginal);
      if (!chave) continue;
      if (!mapa.has(chave)) {
        mapa.set(chave, categoriaOriginal);
      }
    }
    return ["TODOS", ...Array.from(mapa.values()).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [produtos]);

  const categoriaOptions = useMemo(() => {
    return categorias.map((categoriaItem) => ({
      value: categoriaItem,
      label: categoriaItem
    }));
  }, [categorias]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const categoriaNormalizada = normalizarCategoria(categoria);
    return produtos.filter((item) => {
      const categoriaItemNormalizada = normalizarCategoria(item.categoria);
      const categoriaOk =
        categoria === "TODOS" || categoriaItemNormalizada === categoriaNormalizada;
      const buscaOk = String(item.nome || "").toLowerCase().includes(termo);
      return categoriaOk && buscaOk;
    });
  }, [produtos, categoria, busca]);

  useEffect(() => {
    if (!touchMode || !tecladoTouchAutomatico) {
      setTecladoBuscaAberto(false);
    }
  }, [touchMode, tecladoTouchAutomatico]);

  async function handleAdicionar(produtoId) {
    const quantidade = Math.max(1, Number(quantidades[produtoId] || 1));
    setAddingId(produtoId);

    try {
      await onAdd(produtoId, quantidade);
      setQuantidades((prev) => ({ ...prev, [produtoId]: 1 }));
    } finally {
      setAddingId(null);
    }
  }

  function setQuantidadeTouch(produtoId, delta) {
    setQuantidades((prev) => {
      const atual = Math.max(1, Number(prev[produtoId] || 1));
      return {
        ...prev,
        [produtoId]: Math.max(1, atual + delta)
      };
    });
  }

  return (
    <div
      style={{
        ...containerStyle,
        ...(touchMode ? touchContainerStyle : null),
        ...(modal ? modalContainerStyle : null)
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>Adicionar produtos</h3>

      <div style={{ ...filtrosGridStyle, ...(touchMode ? touchFiltrosGridStyle : null) }}>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onFocus={() => {
            if (touchMode && tecladoTouchAutomatico) setTecladoBuscaAberto(true);
          }}
          onClick={() => {
            if (touchMode && tecladoTouchAutomatico) setTecladoBuscaAberto(true);
          }}
          placeholder="Buscar produto..."
          style={{ ...inputStyle, ...(touchMode ? touchInputStyle : null) }}
          readOnly={touchMode && tecladoTouchAutomatico}
          inputMode={touchMode && tecladoTouchAutomatico ? "none" : "text"}
        />

        <SelectField
          value={categoria}
          onChange={setCategoria}
          options={categoriaOptions}
          wrapperStyle={categoriaSelectWrapperStyle(touchMode)}
          buttonStyle={{ ...selectStyle, ...(touchMode ? touchInputStyle : null) }}
        />
      </div>

      <div style={{ ...listagemStyle(modal), ...(touchMode && !modal ? touchListagemStyle : null) }}>
        {filtrados.map((produto) => {
          const semEstoque = produto.estoque <= 0;
          const carregando = addingId === produto.id;
          const qtdAtual = Math.max(1, Number(quantidades[produto.id] || 1));
          const bloqueado = disabled || semEstoque || carregando;

          return (
            <div key={produto.id} style={{ ...cardStyle, ...(touchMode ? touchCardStyle : null) }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: touchMode ? 22 : 22 }}>{produto.nome}</div>
                <div style={{ color: "#aab0c7", margin: "4px 0", fontSize: touchMode ? 18 : 18 }}>
                  {categorias.find((cat) => normalizarCategoria(cat) === normalizarCategoria(produto.categoria)) ||
                    produto.categoria}{" "}
                  - {moeda(produto.preco)}
                </div>
                <div style={{ color: produto.estoque_baixo ? "#f7c76b" : "#65d4a0", fontSize: touchMode ? 20 : 16 }}>
                  Estoque: {produto.estoque}
                </div>
              </div>

              {!touchMode && (
                <div style={actionsStyle}>
                  <input
                    type="number"
                    min="1"
                    value={qtdAtual}
                    onChange={(e) => {
                      const valor = Math.max(1, Number(e.target.value || 1));
                      setQuantidades((prev) => ({
                        ...prev,
                        [produto.id]: valor
                      }));
                    }}
                    style={qtyStyle}
                    disabled={bloqueado}
                  />

                  <button
                    onClick={() => handleAdicionar(produto.id)}
                    style={addButtonStyle(bloqueado)}
                    disabled={bloqueado}
                  >
                    {semEstoque ? "Sem estoque" : carregando ? "Adicionando..." : "Adicionar"}
                  </button>
                </div>
              )}

              {touchMode && (
                <div style={touchActionsStyle}>
                  <div style={touchStepperStyle}>
                    <button
                      type="button"
                      onClick={() => setQuantidadeTouch(produto.id, -1)}
                      style={touchStepButtonStyle(bloqueado)}
                      disabled={bloqueado}
                    >
                      -
                    </button>

                    <div style={touchQtyBadgeStyle}>{qtdAtual}</div>

                    <button
                      type="button"
                      onClick={() => setQuantidadeTouch(produto.id, 1)}
                      style={touchStepButtonStyle(bloqueado)}
                      disabled={bloqueado}
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAdicionar(produto.id)}
                    style={touchAddButtonStyle(bloqueado)}
                    disabled={bloqueado}
                  >
                    {semEstoque ? "Sem estoque" : carregando ? "Adicionando..." : `Adicionar x${qtdAtual}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {filtrados.length === 0 && (
          <div style={cardStyle}>Nenhum produto encontrado para esse filtro.</div>
        )}
      </div>

      <TouchKeyboard
        open={touchMode && tecladoTouchAutomatico && tecladoBuscaAberto}
        value={busca}
        onChange={setBusca}
        onClose={() => setTecladoBuscaAberto(false)}
        title="Buscar produto"
      />
    </div>
  );
}

const containerStyle = {
  marginTop: 16,
  border: "1px solid #2d3352",
  borderRadius: 14,
  padding: 12,
  background: "#12162a"
};

const touchContainerStyle = {
  borderRadius: 18,
  padding: 16
};

const filtrosGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 170px",
  gap: 8,
  marginBottom: 10
};

const touchFiltrosGridStyle = {
  gridTemplateColumns: "1fr",
  gap: 10
};

const inputStyle = {
  minWidth: 0,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #353b5b",
  background: "#121427",
  color: "#fff"
};

const touchInputStyle = {
  minHeight: 48,
  fontSize: 18,
  borderRadius: 14
};

const selectStyle = {
  minWidth: 0,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #353b5b",
  background: "#121427",
  color: "#fff"
};

function categoriaSelectWrapperStyle(touchMode) {
  return {
    minWidth: touchMode ? 240 : 170
  };
}

function listagemStyle(modal) {
  return {
    display: "grid",
    alignContent: "start",
    gridAutoRows: "max-content",
    gap: 10,
    height: modal ? "100%" : undefined,
    maxHeight: modal ? "none" : 260,
    overflow: "auto",
    paddingRight: 4,
    overscrollBehavior: "contain"
  };
}

const touchListagemStyle = {
  maxHeight: "none",
  overflow: "visible",
  gap: 12
};

const modalContainerStyle = {
  height: "100%",
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "auto auto minmax(0, 1fr)",
  overflow: "hidden",
  marginTop: 0
};

const cardStyle = {
  border: "1px solid #2e3351",
  borderRadius: 14,
  padding: 12,
  background: "#171a2f",
  display: "flex",
  flexDirection: "column",
  gap: 8
};

const touchCardStyle = {
  borderRadius: 18,
  padding: 16,
  gap: 10
};

const actionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8
};

const qtyStyle = {
  width: 76,
  minWidth: 76,
  padding: 8,
  borderRadius: 10,
  border: "1px solid #353b5b",
  background: "#0f1120",
  color: "#fff"
};

const touchActionsStyle = {
  display: "grid",
  gap: 10
};

const touchStepperStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8
};

const touchQtyBadgeStyle = {
  minWidth: 72,
  height: 48,
  borderRadius: 14,
  border: "1px solid #445182",
  background: "#0f1428",
  display: "grid",
  placeItems: "center",
  fontSize: 20,
  fontWeight: 800
};

function touchStepButtonStyle(disabled) {
  return {
    width: 48,
    height: 48,
    borderRadius: 14,
    border: "1px solid #425080",
    background: disabled ? "#31374f" : "#1e2546",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 24,
    fontWeight: 800,
    touchAction: "manipulation"
  };
}

function addButtonStyle(disabled) {
  return {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    border: "none",
    background: disabled ? "#4a4d65" : "#2e63f4",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700
  };
}

function touchAddButtonStyle(disabled) {
  return {
    width: "100%",
    minHeight: 48,
    padding: "10px 14px",
    borderRadius: 14,
    border: "none",
    background: disabled ? "#4a4d65" : "#2e63f4",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
    fontSize: 18,
    touchAction: "manipulation"
  };
}
