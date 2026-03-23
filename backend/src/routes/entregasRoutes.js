const express = require("express");
const EntregasController = require("../controllers/EntregasController");
const { allowRoles } = require("../middleware/auth");

const router = express.Router();

router.get(
  "/entregas/motoboys",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_VER" }),
  EntregasController.listarMotoboys
);
router.get(
  "/entregas/resumo",
  allowRoles(["GARCOM", "GERENTE"], { permission: "APP_ENTREGAS_VER" }),
  EntregasController.resumo
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

module.exports = router;
