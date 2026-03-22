const express = require("express");
const FinanceiroController = require("../controllers/FinanceiroController");
const ImpressaoController = require("../controllers/ImpressaoController");
const { allowRoles } = require("../middleware/auth");

const router = express.Router();

router.get(
  "/financeiro/resumo",
  allowRoles(["GERENTE"], { permission: "APP_FINANCEIRO_VER" }),
  FinanceiroController.resumo
);
router.get(
  "/financeiro/relatorios",
  allowRoles(["GERENTE"], { permission: "APP_FINANCEIRO_RELATORIOS" }),
  FinanceiroController.relatorios
);
router.get(
  "/financeiro/caixa",
  allowRoles(["GERENTE"], { permission: "APP_CAIXA_GERIR" }),
  FinanceiroController.caixaAtual
);
router.post(
  "/financeiro/caixa/abrir",
  allowRoles(["GERENTE"], { permission: "APP_CAIXA_GERIR" }),
  FinanceiroController.abrirCaixa
);
router.post(
  "/financeiro/caixa/fechar",
  allowRoles(["GERENTE"], { permission: "APP_CAIXA_GERIR" }),
  FinanceiroController.fecharCaixa
);
router.post(
  "/financeiro/caixa/movimentos",
  allowRoles(["GERENTE"], { permission: "APP_CAIXA_GERIR" }),
  FinanceiroController.movimentarCaixa
);
router.get(
  "/impressao/impressoras",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_IMPRESSAO" }),
  ImpressaoController.listarImpressoras
);
router.post(
  "/impressao/imprimir",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_IMPRESSAO" }),
  ImpressaoController.imprimirTexto
);

module.exports = router;
