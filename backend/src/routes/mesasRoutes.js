const express = require("express");
const MesasController = require("../controllers/MesasController");
const { allowRoles } = require("../middleware/auth");
const { requireSensitivePin } = require("../middleware/sensitivePin");

const router = express.Router();

router.get(
  "/mesas",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_MESAS_VER" }),
  MesasController.listarMesas
);
router.post(
  "/mesas",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_MESAS_CRIAR" }),
  MesasController.criarMesa
);
router.delete(
  "/mesas/:id",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_MESAS_EXCLUIR" }),
  requireSensitivePin({
    acaoFalha: "PIN_SENSIVEL_FALHA_EXCLUIR_MESA",
    mensagemErro: "PIN invalido para excluir mesa."
  }),
  MesasController.excluirMesa
);
router.get(
  "/mesas/:id/pedido",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_MESAS_VER" }),
  MesasController.detalheMesa
);
router.post(
  "/mesas/:id/abrir",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_MESAS_ABRIR_FECHAR" }),
  MesasController.abrirMesa
);
router.post(
  "/mesas/:id/itens",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_MESAS_ITENS" }),
  MesasController.adicionarItem
);
router.patch(
  "/mesas/:id/itens/:itemId",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_MESAS_ITENS" }),
  MesasController.atualizarQuantidadeItem
);
router.delete(
  "/mesas/:id/itens/:itemId",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_MESAS_ITENS" }),
  MesasController.removerItem
);
router.post(
  "/mesas/:id/fechar",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_MESAS_ABRIR_FECHAR" }),
  MesasController.fecharMesa
);
router.post(
  "/mesas/:id/retomar-fechamento",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_MESAS_ABRIR_FECHAR" }),
  MesasController.retomarFechamento
);
router.post(
  "/mesas/:id/pagar",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_MESAS_ABRIR_FECHAR" }),
  MesasController.pagarMesa
);
router.post(
  "/mesas/:id/reabrir",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_MESAS_ABRIR_FECHAR" }),
  MesasController.reabrirMesa
);

router.get(
  "/produtos",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_PRODUTOS_VER" }),
  MesasController.listarProdutos
);
router.get(
  "/produtos/categorias",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_PRODUTOS_VER" }),
  MesasController.listarCategoriasProdutos
);
router.post(
  "/produtos",
  allowRoles(["GERENTE"], { permission: "APP_PRODUTOS_CADASTRAR" }),
  MesasController.criarProduto
);
router.patch(
  "/produtos/:id",
  allowRoles(["GERENTE"], { permission: "APP_PRODUTOS_EDITAR" }),
  MesasController.atualizarProduto
);
router.patch(
  "/produtos/:id/estoque",
  allowRoles(["GERENTE"], { permission: "APP_PRODUTOS_ESTOQUE" }),
  MesasController.ajustarEstoqueProduto
);
router.post(
  "/produtos/lote/importar",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_PRODUTOS_IMPORTAR" }),
  requireSensitivePin({
    acaoFalha: "PIN_SENSIVEL_FALHA_IMPORTAR_PRODUTOS",
    mensagemErro: "PIN invalido para importar produtos."
  }),
  MesasController.importarProdutosLote
);
router.post(
  "/produtos/lote/estoque",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_PRODUTOS_ESTOQUE" }),
  requireSensitivePin({
    acaoFalha: "PIN_SENSIVEL_FALHA_AJUSTE_ESTOQUE_LOTE",
    mensagemErro: "PIN invalido para ajuste em lote."
  }),
  MesasController.ajustarEstoqueProdutoLote
);
router.delete(
  "/produtos/:id",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_PRODUTOS_EXCLUIR" }),
  requireSensitivePin({
    acaoFalha: "PIN_SENSIVEL_FALHA_EXCLUIR_PRODUTO",
    mensagemErro: "PIN invalido para excluir produto."
  }),
  MesasController.removerProduto
);

router.get(
  "/historico",
  allowRoles(["GERENTE"], { permission: "APP_HISTORICO_VER" }),
  MesasController.historico
);
router.delete(
  "/historico/:id",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_HISTORICO_EXCLUIR" }),
  requireSensitivePin({
    acaoFalha: "PIN_SENSIVEL_FALHA_EXCLUIR_HISTORICO",
    mensagemErro: "PIN invalido para excluir registro do historico."
  }),
  MesasController.excluirHistorico
);

module.exports = router;
