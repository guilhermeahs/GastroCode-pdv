const express = require("express");
const EntregasController = require("../controllers/EntregasController");
const { allowRoles } = require("../middleware/auth");

const router = express.Router();

router.post("/entregas/hub/webhook/:token", EntregasController.webhookHub);
router.post("/entregas/hub/webhook", EntregasController.webhookHub);
router.post("/entregas/integracoes/ifood/webhook", EntregasController.webhookIfood);

router.get(
  "/entregas/motoboys",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_VER" }),
  EntregasController.listarMotoboys
);
router.get(
  "/entregas/pedidos-pendentes",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_VER" }),
  EntregasController.listarPendentes
);
router.get(
  "/entregas/resumo",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_VER" }),
  EntregasController.resumo
);
router.get(
  "/entregas/integracoes",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_VER" }),
  EntregasController.listarIntegracoes
);
router.patch(
  "/entregas/integracoes/:provider",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.salvarIntegracao
);
router.post(
  "/entregas/integracoes/:provider/sincronizar",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.sincronizarIntegracao
);
router.get(
  "/entregas/integracoes/ifood/homologacao/status",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.ifoodStatus
);
router.patch(
  "/entregas/integracoes/ifood/homologacao",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.ifoodSalvar
);
router.post(
  "/entregas/integracoes/ifood/homologacao/sincronizar",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.ifoodSincronizar
);
router.get(
  "/entregas/integracoes/ifood/homologacao/eventos",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.ifoodEventos
);
router.post(
  "/entregas/integracoes/ifood/homologacao/token",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.ifoodRenovarToken
);
router.post(
  "/entregas/motoboys",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.criarMotoboy
);
router.patch(
  "/entregas/motoboys/:id",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.atualizarMotoboy
);
router.delete(
  "/entregas/motoboys/:id",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.excluirMotoboy
);
router.post(
  "/entregas/motoboys/:id/pedidos/lote",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.adicionarPedidosLote
);
router.delete(
  "/entregas/pedidos/:pedidoId",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.removerPedido
);
router.get(
  "/entregas/pedidos/:pedidoId/cancelamento-opcoes",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.opcoesCancelamentoPedido
);
router.post(
  "/entregas/pedidos/:pedidoId/confirmar",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.confirmarPedido
);
router.post(
  "/entregas/pedidos/:pedidoId/cancelar",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.cancelarPedido
);
router.post(
  "/entregas/pedidos/:pedidoId/atribuir",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_GERIR" }),
  EntregasController.atribuirPedido
);

module.exports = router;
