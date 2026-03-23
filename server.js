
const express = require("express");
const cors = require("cors");

require("./backend/src/config/db");
const BackupService = require("./backend/src/services/backupService");

const mesasRoutes = require("./backend/src/routes/mesasRoutes");
const financeiroRoutes = require("./backend/src/routes/financeiroRoutes");
const authRoutes = require("./backend/src/routes/authRoutes");
const sistemaRoutes = require("./backend/src/routes/sistemaRoutes");
const licencaRoutes = require("./backend/src/routes/licencaRoutes");
const entregasRoutes = require("./backend/src/routes/entregasRoutes");
const auditTrailMiddleware = require("./backend/src/middleware/auditTrail");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "API online" });
});

app.use("/api", auditTrailMiddleware);
app.use("/api", authRoutes);
app.use("/api", licencaRoutes);
app.use("/api", mesasRoutes);
app.use("/api", financeiroRoutes);
app.use("/api", sistemaRoutes);
app.use("/api", entregasRoutes);

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "127.0.0.1";

BackupService.iniciarAgendadorBackupAutomatico();

app.listen(PORT, HOST, () => {
  console.log(`Servidor rodando em http://${HOST}:${PORT}`);
  if (process.env.APPGESTAO_DB_PATH) {
    console.log(`Banco local: ${process.env.APPGESTAO_DB_PATH}`);
  }
  console.log(`Backup local: ${BackupService.BACKUPS_DIR}`);
});
