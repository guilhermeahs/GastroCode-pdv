const express = require("express");
const LicencaController = require("../controllers/LicencaController");
const { allowRoles } = require("../middleware/auth");
const { requireSensitivePin } = require("../middleware/sensitivePin");

const router = express.Router();

router.get("/licenca/status", LicencaController.status);
router.post("/licenca/ativar", LicencaController.ativar);
router.post(
  "/licenca/bloquear",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_LICENCA_BLOQUEAR" }),
  requireSensitivePin({
    acaoFalha: "PIN_SENSIVEL_FALHA_BLOQUEAR_LICENCA",
    mensagemErro: "PIN invalido para bloquear licenca."
  }),
  LicencaController.bloquear
);

module.exports = router;
