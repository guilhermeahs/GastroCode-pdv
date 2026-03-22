const express = require("express");
const UsuariosController = require("../controllers/UsuariosController");
const SistemaController = require("../controllers/SistemaController");
const { allowRoles } = require("../middleware/auth");
const { requireSensitivePin } = require("../middleware/sensitivePin");

const router = express.Router();

router.get(
  "/usuarios",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_USUARIOS_GERIR" }),
  UsuariosController.listar
);
router.post(
  "/usuarios",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_USUARIOS_GERIR" }),
  UsuariosController.criar
);
router.patch(
  "/usuarios/:id",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_USUARIOS_GERIR" }),
  UsuariosController.atualizar
);

router.get(
  "/sistema/backup",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_BACKUP_GERIR" }),
  SistemaController.backup
);
router.post(
  "/sistema/backup/arquivo",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_BACKUP_GERIR" }),
  SistemaController.backupArquivo
);
router.get(
  "/sistema/backups",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_BACKUP_GERIR" }),
  SistemaController.listarBackups
);
router.post(
  "/sistema/backup/auto",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_BACKUP_GERIR" }),
  SistemaController.executarBackupAuto
);
router.get(
  "/sistema/config",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_CONFIG_VER" }),
  SistemaController.configuracoes
);
router.patch(
  "/sistema/config",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_CONFIG_VER" }),
  SistemaController.atualizarConfiguracoes
);
router.post(
  "/sistema/restore",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_BACKUP_GERIR" }),
  requireSensitivePin({
    acaoFalha: "PIN_SENSIVEL_FALHA_RESTORE",
    mensagemErro: "PIN invalido para restaurar backup."
  }),
  SistemaController.restaurar
);
router.post(
  "/sistema/restore/arquivo",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_BACKUP_GERIR" }),
  requireSensitivePin({
    acaoFalha: "PIN_SENSIVEL_FALHA_RESTORE_ARQUIVO",
    mensagemErro: "PIN invalido para restaurar backup por arquivo."
  }),
  SistemaController.restaurarArquivo
);
router.post(
  "/sistema/limpar-dados",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_BACKUP_GERIR" }),
  requireSensitivePin({
    acaoFalha: "PIN_SENSIVEL_FALHA_LIMPAR_DADOS",
    mensagemErro: "PIN invalido para limpar dados."
  }),
  SistemaController.limparDados
);
router.get(
  "/sistema/auditoria",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_AUDITORIA_VER" }),
  SistemaController.auditoria
);
router.get(
  "/sistema/auditoria/exportar",
  allowRoles(["GERENTE"], { allowLegacy: false, permission: "APP_AUDITORIA_VER" }),
  SistemaController.exportarAuditoria
);

module.exports = router;
