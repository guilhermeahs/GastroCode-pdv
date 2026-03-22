import React, { useEffect, useMemo, useRef, useState } from "react";
import SelectField from "../components/SelectField";
import ConfirmDialog from "../components/ConfirmDialog";
import { useApp } from "../context/AppContext";
import { imprimirConta, imprimirResumoCaixa } from "../services/print";
import { api } from "../services/api";

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

const LARGURA_OPTIONS = [
  { value: 80, label: "80 mm (padrao)" },
  { value: 58, label: "58 mm (compacto)" }
];

const METODO_OPTIONS = [
  { value: "NAVEGADOR", label: "Navegador (com dialogo)" },
  { value: "DIRETA", label: "Direta (impressora selecionada)" }
];

const LOGO_DATA_URL_MAX = 900000;
const PRINT_CHECKLIST_STORAGE_KEY = "pdv_print_checklist_v1";
const PRINT_CHECKLIST_ITEMS = [
  {
    id: "impressora_selecionada",
    titulo: "Impressora selecionada",
    detalhe: "Confirme se o nome da impressora do Windows esta correto."
  },
  {
    id: "largura_papel",
    titulo: "Largura do papel",
    detalhe: "Teste 58 mm e 80 mm e mantenha a opcao que nao corta texto."
  },
  {
    id: "logo_legivel",
    titulo: "Logo legivel",
    detalhe: "Verifique contraste e nitidez da logo no comprovante."
  },
  {
    id: "corte_e_margens",
    titulo: "Corte e margens",
    detalhe: "Cheque se o fim do cupom nao fica em branco excessivo."
  },
  {
    id: "pagamento_e_troco",
    titulo: "Pagamento e troco",
    detalhe: "No comprovante de pagamento, validar forma, valor recebido e troco."
  },
  {
    id: "fechamento_caixa",
    titulo: "Fechamento de caixa",
    detalhe: "Imprima resumo de caixa e confira totais por forma de pagamento."
  }
];

function checklistPadrao() {
  return PRINT_CHECKLIST_ITEMS.reduce((acc, item) => {
    acc[item.id] = false;
    return acc;
  }, {});
}

function normalizarChecklist(valor) {
  const base = checklistPadrao();
  if (!valor || typeof valor !== "object") return base;

  for (const item of PRINT_CHECKLIST_ITEMS) {
    base[item.id] = Boolean(valor[item.id]);
  }
  return base;
}

function lerArquivoComoDataUrl(arquivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler o arquivo da logo."));
    reader.readAsDataURL(arquivo);
  });
}

async function otimizarLogoParaTermica(arquivo) {
  const dataUrlOriginal = await lerArquivoComoDataUrl(arquivo);
  if (!dataUrlOriginal.startsWith("data:image/")) {
    throw new Error("Formato invalido. Use uma imagem PNG, JPG ou WEBP.");
  }

  const imagem = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Nao foi possivel carregar a imagem."));
    img.src = dataUrlOriginal;
  });

  const maxLargura = 700;
  const maxAltura = 260;
  const escala = Math.min(maxLargura / imagem.width, maxAltura / imagem.height, 1);
  const largura = Math.max(1, Math.round(imagem.width * escala));
  const altura = Math.max(1, Math.round(imagem.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrlOriginal;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(imagem, 0, 0, largura, altura);

  const dataUrlConvertido = canvas.toDataURL("image/png", 0.92);
  return dataUrlConvertido.length <= LOGO_DATA_URL_MAX ? dataUrlConvertido : dataUrlOriginal;
}

export default function Impressao() {
  const {
    role,
    hasPermission,
    configuracoes,
    configImpressao,
    configuracaoImpressaoAtual,
    atualizarConfigImpressao,
    restaurarConfigImpressaoPadrao
  } = useApp();
  const [impressoras, setImpressoras] = useState([]);
  const [carregandoImpressoras, setCarregandoImpressoras] = useState(false);
  const [erroImpressoras, setErroImpressoras] = useState("");
  const [erroLogo, setErroLogo] = useState("");
  const [carregandoLogo, setCarregandoLogo] = useState(false);
  const [checklistTermica, setChecklistTermica] = useState(() => {
    try {
      const raw = localStorage.getItem(PRINT_CHECKLIST_STORAGE_KEY);
      if (!raw) return checklistPadrao();
      return normalizarChecklist(JSON.parse(raw));
    } catch {
      return checklistPadrao();
    }
  });
  const inputLogoRef = useRef(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmLimparChecklistOpen, setConfirmLimparChecklistOpen] = useState(false);

  const pedidoTeste = useMemo(
    () => ({
      subtotal: 42,
      taxa_servico_percent: 10,
      taxa_servico_valor: 4.2,
      total: 46.2,
      pessoas: 2,
      total_por_pessoa: 23.1
    }),
    []
  );

  const itensTeste = useMemo(
    () => [
      { quantidade: 2, nome_produto: "Coca-Cola 350ml", total_item: 13 },
      { quantidade: 1, nome_produto: "Hamburguer artesanal", total_item: 29 }
    ],
    []
  );

  useEffect(() => {
    localStorage.setItem(PRINT_CHECKLIST_STORAGE_KEY, JSON.stringify(checklistTermica));
  }, [checklistTermica]);

  useEffect(() => {
    let mounted = true;

    async function carregarImpressoras() {
      setCarregandoImpressoras(true);
      setErroImpressoras("");
      try {
        const resposta = await api.getImpressoras(role);
        if (!mounted) return;

        const lista = Array.isArray(resposta?.impressoras) ? resposta.impressoras : [];
        setImpressoras(lista);

        if (configImpressao.impressora_nome && !lista.includes(configImpressao.impressora_nome)) {
          atualizarConfigImpressao({ impressora_nome: "" });
        }
      } catch (error) {
        if (!mounted) return;
        setImpressoras([]);
        setErroImpressoras(error.message || "Nao foi possivel carregar impressoras.");
      } finally {
        if (mounted) setCarregandoImpressoras(false);
      }
    }

    carregarImpressoras();

    return () => {
      mounted = false;
    };
  }, [role]);

  const impressoraOptions = useMemo(() => {
    return impressoras.map((nome) => ({ value: nome, label: nome }));
  }, [impressoras]);

  const checklistResumo = useMemo(() => {
    const total = PRINT_CHECKLIST_ITEMS.length;
    const concluidos = PRINT_CHECKLIST_ITEMS.reduce((acc, item) => {
      return acc + (checklistTermica[item.id] ? 1 : 0);
    }, 0);
    return { total, concluidos };
  }, [checklistTermica]);

  function alternar(chave) {
    atualizarConfigImpressao({ [chave]: !configImpressao[chave] });
  }

  async function handleSelecionarLogo(event) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo) return;

    setErroLogo("");
    setCarregandoLogo(true);
    try {
      const dataUrl = await otimizarLogoParaTermica(arquivo);
      if (!dataUrl.startsWith("data:image/")) {
        throw new Error("Arquivo invalido para logo.");
      }
      if (dataUrl.length > LOGO_DATA_URL_MAX) {
        throw new Error("A imagem ficou grande demais. Use um arquivo menor.");
      }
      atualizarConfigImpressao({
        logo_data_url: dataUrl,
        mostrar_logo: true
      });
    } catch (error) {
      setErroLogo(error.message || "Nao foi possivel carregar a logo.");
    } finally {
      setCarregandoLogo(false);
    }
  }

  function removerLogo() {
    setErroLogo("");
    atualizarConfigImpressao({
      logo_data_url: "",
      mostrar_logo: false
    });
  }

  function imprimirTestePreConta() {
    imprimirConta(
      { numero: 10, cliente_nome: "Cliente teste" },
      pedidoTeste,
      itensTeste,
      null,
      configuracaoImpressaoAtual
    );
  }

  function imprimirTestePagamento() {
    imprimirConta(
      { numero: 10, cliente_nome: "Cliente teste" },
      { ...pedidoTeste, forma_pagamento: "PIX", valor_recebido: 46.2, troco: 0 },
      itensTeste,
      { forma_pagamento: "PIX", valor_recebido: 46.2, troco: 0 },
      configuracaoImpressaoAtual
    );
  }

  function imprimirTesteFechamentoCaixa() {
    imprimirResumoCaixa(
      {
        periodo_inicio: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
        periodo_fim: new Date().toISOString(),
        saldo_inicial: 100,
        saldo_final_estimado: 356.2,
        caixa: {
          subtotal_produtos: 420,
          taxa_servico_total: 42,
          faturamento_total: 462,
          vendas: 12
        },
        faturamentoPorForma: [
          { forma_pagamento: "PIX", total: 212 },
          { forma_pagamento: "DINHEIRO", total: 130 },
          { forma_pagamento: "CREDITO", total: 120 }
        ]
      },
      configuracaoImpressaoAtual
    );
  }

  function restaurarPadrao() {
    setConfirmResetOpen(true);
  }

  function confirmarRestaurarPadrao() {
    restaurarConfigImpressaoPadrao();
    setConfirmResetOpen(false);
  }

  function toggleChecklist(itemId) {
    setChecklistTermica((prev) => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  }

  function limparChecklist() {
    setConfirmLimparChecklistOpen(true);
  }

  function confirmarLimparChecklist() {
    setChecklistTermica(checklistPadrao());
    setConfirmLimparChecklistOpen(false);
  }

  if (!hasPermission("APP_IMPRESSAO")) {
    return <p>Sem permissao para acessar impressao.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Impressao</h2>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Padrao de comprovante</h3>

        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Metodo de impressao</label>
            <SelectField
              value={configImpressao.metodo_impressao}
              onChange={(value) => atualizarConfigImpressao({ metodo_impressao: value })}
              options={METODO_OPTIONS}
              buttonStyle={inputLikeSelectStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Largura do papel</label>
            <SelectField
              value={Number(configImpressao.largura_papel_mm)}
              onChange={(value) => atualizarConfigImpressao({ largura_papel_mm: Number(value) })}
              options={LARGURA_OPTIONS}
              buttonStyle={inputLikeSelectStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Impressora (modo direto)</label>
            <div style={printerSelectRowStyle}>
              <SelectField
                value={configImpressao.impressora_nome}
                onChange={(value) => atualizarConfigImpressao({ impressora_nome: value })}
                options={impressoraOptions}
                placeholder={carregandoImpressoras ? "Carregando..." : "Selecionar impressora"}
                buttonStyle={inputLikeSelectStyle}
                disabled={carregandoImpressoras || impressoraOptions.length === 0}
              />

              <button
                type="button"
                style={refreshButtonStyle}
                onClick={async () => {
                  setCarregandoImpressoras(true);
                  setErroImpressoras("");
                  try {
                    const resposta = await api.getImpressoras(role);
                    const lista = Array.isArray(resposta?.impressoras) ? resposta.impressoras : [];
                    setImpressoras(lista);
                  } catch (error) {
                    setErroImpressoras(error.message || "Nao foi possivel carregar impressoras.");
                  } finally {
                    setCarregandoImpressoras(false);
                  }
                }}
                disabled={carregandoImpressoras}
              >
                {carregandoImpressoras ? "..." : "Atualizar"}
              </button>
            </div>
            {erroImpressoras && <div style={warningStyle}>{erroImpressoras}</div>}
            {!erroImpressoras && impressoraOptions.length === 0 && (
              <div style={warningStyle}>Nenhuma impressora encontrada no Windows.</div>
            )}
          </div>
        </div>

        <div style={logoCardStyle}>
          <div style={logoHeaderStyle}>
            <div>
              <label style={labelStyle}>Logo no comprovante</label>
              <div style={smallHelperStyle}>
                Dica: para impressora termica, prefira imagem com fundo claro e pouco detalhe.
              </div>
            </div>
            <div style={logoActionsStyle}>
              <input
                ref={inputLogoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleSelecionarLogo}
                style={{ display: "none" }}
              />
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => inputLogoRef.current?.click()}
                disabled={carregandoLogo}
              >
                {carregandoLogo
                  ? "Carregando..."
                  : configImpressao.logo_data_url
                    ? "Trocar logo"
                    : "Enviar logo"}
              </button>
              <button
                type="button"
                style={dangerButtonStyle}
                onClick={removerLogo}
                disabled={!configImpressao.logo_data_url || carregandoLogo}
              >
                Remover
              </button>
            </div>
          </div>

          {erroLogo && <div style={warningStyle}>{erroLogo}</div>}

          {configImpressao.logo_data_url ? (
            <div style={logoPreviewBoxStyle}>
              <img
                src={configImpressao.logo_data_url}
                alt="Preview da logo"
                style={{
                  maxWidth: "100%",
                  maxHeight: 140,
                  objectFit: "contain",
                  filter: configImpressao.logo_alto_contraste ? "grayscale(1) contrast(1.9) brightness(1.05)" : "none"
                }}
              />
            </div>
          ) : (
            <div style={warningStyle}>Nenhuma logo configurada.</div>
          )}

          <div style={logoControlsStyle}>
            <SwitchRow
              label="Mostrar logo no comprovante"
              checked={configImpressao.mostrar_logo}
              disabled={!configImpressao.logo_data_url}
              onToggle={() => alternar("mostrar_logo")}
            />
            <SwitchRow
              label="Alto contraste para termica"
              checked={configImpressao.logo_alto_contraste}
              disabled={!configImpressao.logo_data_url}
              onToggle={() => alternar("logo_alto_contraste")}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            <label style={labelStyle}>Largura da logo ({configImpressao.logo_largura_mm} mm)</label>
            <input
              type="range"
              min="18"
              max={configImpressao.largura_papel_mm === 58 ? "48" : "62"}
              value={Number(configImpressao.logo_largura_mm || 34)}
              onChange={(e) => atualizarConfigImpressao({ logo_largura_mm: Number(e.target.value) })}
              disabled={!configImpressao.logo_data_url}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        <div style={warningStyle}>
          Dica: no modo navegador, a escolha da impressora e "Cabecalhos e rodapes" ficam no dialogo de impressao.
        </div>
        {configImpressao.metodo_impressao === "DIRETA" && configImpressao.mostrar_logo && (
          <div style={warningStyle}>
            Com logo ativa, a impressao abre no navegador para garantir que a imagem saia no comprovante.
          </div>
        )}

        <div style={switchGridStyle}>
          <SwitchRow label="Exibir cabecalho" checked={configImpressao.exibir_cabecalho} onToggle={() => alternar("exibir_cabecalho")} />
          <SwitchRow
            label="Mostrar cliente"
            checked={configImpressao.mostrar_cliente}
            onToggle={() => alternar("mostrar_cliente")}
          />
          <SwitchRow
            label="Mostrar data/hora"
            checked={configImpressao.mostrar_data_hora}
            onToggle={() => alternar("mostrar_data_hora")}
          />
          <SwitchRow
            label="Mostrar forma de pagamento"
            checked={configImpressao.mostrar_forma_pagamento}
            onToggle={() => alternar("mostrar_forma_pagamento")}
          />
          <SwitchRow
            label="Imprimir automatico no pagamento"
            checked={configImpressao.auto_imprimir_pagamento}
            onToggle={() => alternar("auto_imprimir_pagamento")}
          />
          <SwitchRow
            label="Imprimir automatico no fechamento de caixa"
            checked={configImpressao.auto_imprimir_fechamento_caixa}
            onToggle={() => alternar("auto_imprimir_fechamento_caixa")}
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={labelStyle}>Mensagem no rodape</label>
          <textarea
            value={configImpressao.mensagem_rodape}
            onChange={(e) => atualizarConfigImpressao({ mensagem_rodape: e.target.value })}
            style={textareaStyle}
            placeholder="Ex.: Obrigado pela preferencia."
          />
        </div>

        <div style={actionsStyle}>
          <button type="button" onClick={imprimirTestePreConta} style={secondaryButtonStyle}>
            Teste pre-conta
          </button>
          <button type="button" onClick={imprimirTestePagamento} style={secondaryButtonStyle}>
            Teste pagamento
          </button>
          <button type="button" onClick={imprimirTesteFechamentoCaixa} style={secondaryButtonStyle}>
            Teste fechamento caixa
          </button>
          <button type="button" onClick={restaurarPadrao} style={dangerButtonStyle}>
            Restaurar padrao
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Preview rapido</h3>
        <div style={previewStyle}>
          {configImpressao.mostrar_logo && configImpressao.logo_data_url && (
            <div style={previewLogoWrapperStyle}>
              <img
                src={configImpressao.logo_data_url}
                alt="Logo"
                style={{
                  width: `${configImpressao.logo_largura_mm}mm`,
                  maxWidth: "100%",
                  maxHeight: 84,
                  objectFit: "contain",
                  filter: configImpressao.logo_alto_contraste ? "grayscale(1) contrast(1.9) brightness(1.05)" : "none"
                }}
              />
            </div>
          )}
          <strong>{configuracoes.estabelecimento_nome || "Seu estabelecimento"}</strong>
          <div>Metodo: {configImpressao.metodo_impressao === "DIRETA" ? "Direta" : "Navegador"}</div>
          {configImpressao.impressora_nome && <div>Impressora: {configImpressao.impressora_nome}</div>}
          {configuracoes.estabelecimento_documento && <div>{configuracoes.estabelecimento_documento}</div>}
          {configuracoes.estabelecimento_telefone && <div>{configuracoes.estabelecimento_telefone}</div>}
          {configuracoes.estabelecimento_endereco && <div>{configuracoes.estabelecimento_endereco}</div>}
          <hr style={lineStyle} />
          <div>Total da conta teste: {moeda(pedidoTeste.total)}</div>
          {configImpressao.mostrar_forma_pagamento && <div>Forma: Pix</div>}
          {configImpressao.mensagem_rodape && (
            <>
              <hr style={lineStyle} />
              <div>{configImpressao.mensagem_rodape}</div>
            </>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={checklistHeaderStyle}>
          <div>
            <h3 style={{ margin: 0 }}>Checklist de homologacao termica</h3>
            <div style={warningStyle}>
              Marque os itens conforme validar na impressora real do caixa.
            </div>
          </div>
          <div style={checklistCountStyle}>
            {checklistResumo.concluidos}/{checklistResumo.total} concluidos
          </div>
        </div>

        <div style={checklistGridStyle}>
          {PRINT_CHECKLIST_ITEMS.map((item) => {
            const checked = Boolean(checklistTermica[item.id]);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleChecklist(item.id)}
                style={checklistItemStyle(checked)}
              >
                <div style={{ fontWeight: 800 }}>{item.titulo}</div>
                <div style={checklistDetailStyle}>{item.detalhe}</div>
                <strong>{checked ? "OK" : "Pendente"}</strong>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={secondaryButtonStyle} onClick={imprimirTestePreConta}>
            Rodar pre-conta
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={imprimirTestePagamento}>
            Rodar pagamento
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={imprimirTesteFechamentoCaixa}>
            Rodar fechamento
          </button>
          <button type="button" style={dangerButtonStyle} onClick={limparChecklist}>
            Limpar checklist
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmResetOpen}
        title="Restaurar configuracoes de impressao"
        message="Deseja voltar para os valores padrao de impressao?"
        confirmLabel="Restaurar"
        cancelLabel="Cancelar"
        variant="danger"
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={confirmarRestaurarPadrao}
      />

      <ConfirmDialog
        open={confirmLimparChecklistOpen}
        title="Limpar checklist termica"
        message="Deseja desmarcar todos os itens de homologacao?"
        confirmLabel="Limpar checklist"
        cancelLabel="Cancelar"
        variant="danger"
        onCancel={() => setConfirmLimparChecklistOpen(false)}
        onConfirm={confirmarLimparChecklist}
      />
    </div>
  );
}

function SwitchRow({ label, checked, onToggle, disabled = false }) {
  return (
    <button type="button" onClick={onToggle} style={switchRowStyle(checked, disabled)} disabled={disabled}>
      <span style={{ minWidth: 0, flex: 1 }}>{label}</span>
      <strong>{checked ? "ON" : "OFF"}</strong>
    </button>
  );
}

const cardStyle = {
  border: "1px solid #2d3352",
  borderRadius: 16,
  background: "#161a30",
  padding: 16
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
  alignItems: "end"
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  color: "#aeb6d3",
  fontSize: 13
};

const inputLikeSelectStyle = {
  minHeight: 42,
  border: "1px solid #3a4166",
  background: "#101427",
  borderRadius: 10
};

const printerSelectRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 8,
  alignItems: "center"
};

const refreshButtonStyle = {
  border: "1px solid #3d4770",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 700,
  background: "#1b213c",
  color: "#d7def9",
  cursor: "pointer"
};

const switchGridStyle = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 8
};

function switchRowStyle(active, disabled) {
  return {
    border: `1px solid ${active ? "#2e63f4" : "#3d4770"}`,
    borderRadius: 10,
    background: active ? "rgba(46, 99, 244, 0.18)" : "#141b35",
    color: "#fff",
    padding: "10px 12px",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    cursor: disabled ? "not-allowed" : "pointer",
    textAlign: "left",
    alignItems: "center",
    opacity: disabled ? 0.6 : 1
  };
}

const textareaStyle = {
  width: "100%",
  minHeight: 80,
  resize: "vertical",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #3a4166",
  background: "#101427",
  color: "#fff"
};

const actionsStyle = {
  marginTop: 14,
  display: "flex",
  gap: 8,
  flexWrap: "wrap"
};

const secondaryButtonStyle = {
  border: "1px solid #3d4770",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 700,
  background: "#1b213c",
  color: "#d7def9",
  cursor: "pointer"
};

const dangerButtonStyle = {
  border: "1px solid #7a3b49",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 700,
  background: "#4c1d27",
  color: "#fff",
  cursor: "pointer"
};

const previewStyle = {
  border: "1px dashed #536096",
  borderRadius: 10,
  padding: 12,
  background: "#11162d",
  width: "min(100%, 360px)",
  lineHeight: 1.5
};

const lineStyle = {
  border: "none",
  borderTop: "1px dashed #4f5b90",
  margin: "10px 0"
};

const warningStyle = {
  marginTop: 10,
  color: "#aeb6d3",
  fontSize: 13
};

const smallHelperStyle = {
  marginTop: 4,
  color: "#aeb6d3",
  fontSize: 12
};

const logoCardStyle = {
  marginTop: 12,
  border: "1px solid #33406f",
  borderRadius: 12,
  background: "#111730",
  padding: 12
};

const logoHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  flexWrap: "wrap"
};

const logoActionsStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap"
};

const logoPreviewBoxStyle = {
  marginTop: 10,
  border: "1px dashed #4e5f99",
  borderRadius: 10,
  padding: 10,
  background: "#0d1228",
  textAlign: "center"
};

const logoControlsStyle = {
  marginTop: 10,
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
};

const previewLogoWrapperStyle = {
  marginBottom: 10,
  textAlign: "center"
};

const checklistHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap"
};

const checklistCountStyle = {
  border: "1px solid #3d4770",
  borderRadius: 999,
  padding: "6px 12px",
  background: "#10162d",
  fontWeight: 700
};

const checklistGridStyle = {
  marginTop: 12,
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"
};

function checklistItemStyle(done) {
  return {
    border: `1px solid ${done ? "#2f9468" : "#3a4166"}`,
    borderRadius: 12,
    background: done ? "rgba(47, 148, 104, 0.16)" : "#12182f",
    color: "#fff",
    textAlign: "left",
    padding: 10,
    display: "grid",
    gap: 6,
    cursor: "pointer"
  };
}

const checklistDetailStyle = {
  color: "#b8c0db",
  fontSize: 13
};
