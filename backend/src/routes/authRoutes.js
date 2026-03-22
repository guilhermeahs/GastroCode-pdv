const express = require("express");
const AuthController = require("../controllers/AuthController");
const { allowRoles } = require("../middleware/auth");

const router = express.Router();

router.get("/auth/usuarios", AuthController.listarUsuariosLogin);
router.post("/auth/login", AuthController.login);
router.post("/auth/logout", allowRoles(["GARCOM", "GERENTE"], { allowLegacy: false }), AuthController.logout);
router.get("/auth/me", allowRoles(["GARCOM", "GERENTE"], { allowLegacy: false }), AuthController.me);

module.exports = router;
