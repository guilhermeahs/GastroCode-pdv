(function bootstrap() {
  const statusBox = document.getElementById("statusBox");
  const btnRefreshStatus = document.getElementById("btnRefreshStatus");
  const passphraseInit = document.getElementById("passphraseInit");
  const passphraseInitConfirm = document.getElementById("passphraseInitConfirm");
  const forceRecreateKeys = document.getElementById("forceRecreateKeys");
  const btnInitKeys = document.getElementById("btnInitKeys");
  const btnOpenVault = document.getElementById("btnOpenVault");

  const customer = document.getElementById("customer");
  const deviceId = document.getElementById("deviceId");
  const plan = document.getElementById("plan");
  const days = document.getElementById("days");
  const offlineDays = document.getElementById("offlineDays");
  const expiresAt = document.getElementById("expiresAt");
  const signPassphrase = document.getElementById("signPassphrase");
  const btnGenerateToken = document.getElementById("btnGenerateToken");
  const tokenOutput = document.getElementById("tokenOutput");
  const btnCopyToken = document.getElementById("btnCopyToken");

  const publicTargetPath = document.getElementById("publicTargetPath");
  const btnExportPublicKey = document.getElementById("btnExportPublicKey");

  const issuedList = document.getElementById("issuedList");
  const btnRefreshIssued = document.getElementById("btnRefreshIssued");

  const toast = document.getElementById("toast");
  const PLAN_PRESETS = Object.freeze({
    SEMANAL: 7,
    MENSAL: 30,
    TRIAL_3_DIAS: 3
  });

  function showToast(text, kind = "info") {
    toast.textContent = String(text || "");
    toast.className = `toast ${kind}`;
    setTimeout(() => {
      toast.className = "toast hidden";
    }, 3400);
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("pt-BR");
  }

  function safeText(value) {
    return String(value || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function clampDays(value, fallback = 30) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(3650, Math.trunc(parsed)));
  }

  function normalizePlan(rawPlan) {
    return String(rawPlan || "MENSAL").trim().toUpperCase();
  }

  function setDaysInputValue(nextValue) {
    days.value = String(clampDays(nextValue));
  }

  function syncPlanForm() {
    const selectedPlan = normalizePlan(plan.value);
    const isCustomDays = selectedPlan === "DIAS";
    const isFixedDate = selectedPlan === "DATA_FIXA";

    if (Object.prototype.hasOwnProperty.call(PLAN_PRESETS, selectedPlan)) {
      setDaysInputValue(PLAN_PRESETS[selectedPlan]);
    } else if (selectedPlan === "PERMANENTE") {
      setDaysInputValue(0);
    } else if (selectedPlan === "DATA_FIXA") {
      setDaysInputValue(0);
    }

    days.disabled = !isCustomDays;
    expiresAt.disabled = !isFixedDate;

    if (!isFixedDate) {
      expiresAt.value = "";
    }
  }

  function resolveLicensePayload() {
    const selectedPlan = normalizePlan(plan.value);
    const customDays = clampDays(days.value, 30);
    const typedExpiration = String(expiresAt.value || "").trim();

    if (selectedPlan === "DATA_FIXA") {
      if (!typedExpiration) {
        const error = new Error("No plano Data fixa, informe a data de expiracao.");
        error.statusCode = 400;
        throw error;
      }
      return {
        plan: "DATA_FIXA",
        days: 0,
        expires_at: typedExpiration
      };
    }

    if (selectedPlan === "DIAS") {
      return {
        plan: "DIAS",
        days: customDays,
        expires_at: null
      };
    }

    if (Object.prototype.hasOwnProperty.call(PLAN_PRESETS, selectedPlan)) {
      return {
        plan: selectedPlan,
        days: PLAN_PRESETS[selectedPlan],
        expires_at: null
      };
    }

    if (selectedPlan === "PERMANENTE") {
      return {
        plan: "PERMANENTE",
        days: 0,
        expires_at: null
      };
    }

    return {
      plan: selectedPlan || "MENSAL",
      days: customDays,
      expires_at: null
    };
  }

  async function refreshStatus() {
    try {
      const status = await window.licenseAdmin.getStatus();
      statusBox.textContent =
        `Cofre: ${status.vault_root}\n` +
        `Chave privada: ${status.private_key_exists ? "OK" : "NAO ENCONTRADA"}\n` +
        `Chave publica: ${status.public_key_exists ? "OK" : "NAO ENCONTRADA"}\n` +
        `Fingerprint publica: ${status.public_key_fingerprint || "-"}\n` +
        `Licencas emitidas: ${status.issued_count}\n` +
        `Host: ${status.host} (${status.platform})`;

      if (!publicTargetPath.value) {
        publicTargetPath.value = status.default_public_target_path || "";
      }
    } catch (error) {
      showToast(error.message || "Falha ao carregar status.", "error");
    }
  }

  async function refreshIssued() {
    try {
      const items = await window.licenseAdmin.listIssued({ limit: 60 });
      if (!Array.isArray(items) || items.length === 0) {
        issuedList.innerHTML = `<div class="issued-meta">Nenhuma licenca emitida ainda.</div>`;
        return;
      }

      issuedList.innerHTML = items
        .map((item) => {
          const payload = item.payload || {};
          return `
            <article class="issued-item">
              <strong>${safeText(payload.customer || "-")} - ${safeText(payload.plan || "-")}</strong>
              <div class="issued-meta">Dispositivo: ${safeText(payload.device_id || "-")}</div>
              <div class="issued-meta">Emitida em: ${safeText(formatDate(item.generated_at))}</div>
              <div class="issued-meta">Expira em: ${safeText(formatDate(payload.expires_at))}</div>
              <div class="issued-meta">ID: ${safeText(payload.license_id || "-")}</div>
              <div class="issued-meta mono">${safeText(item.token_preview || "")}</div>
            </article>
          `;
        })
        .join("");
    } catch (error) {
      showToast(error.message || "Falha ao listar historico.", "error");
    }
  }

  async function handleInitKeys() {
    const p1 = String(passphraseInit.value || "");
    const p2 = String(passphraseInitConfirm.value || "");
    if (p1.length < 8) {
      showToast("Use uma senha com no minimo 8 caracteres.", "error");
      return;
    }
    if (p1 !== p2) {
      showToast("As senhas nao conferem.", "error");
      return;
    }

    btnInitKeys.disabled = true;
    try {
      await window.licenseAdmin.initKeys({
        passphrase: p1,
        force: forceRecreateKeys.checked
      });
      passphraseInit.value = "";
      passphraseInitConfirm.value = "";
      forceRecreateKeys.checked = false;
      await refreshStatus();
      showToast("Chaves geradas com sucesso.", "success");
    } catch (error) {
      showToast(error.message || "Falha ao gerar chaves.", "error");
    } finally {
      btnInitKeys.disabled = false;
    }
  }

  async function handleGenerateToken() {
    const deviceCode = String(deviceId.value || "").trim().toUpperCase();
    if (!deviceCode) {
      showToast("Informe o codigo do dispositivo.", "error");
      return;
    }
    if (!String(signPassphrase.value || "").trim()) {
      showToast("Informe a senha da chave privada para assinar.", "error");
      return;
    }

    let planPayload;
    try {
      planPayload = resolveLicensePayload();
    } catch (error) {
      showToast(error.message || "Revise os dados de validade.", "error");
      return;
    }

    const payload = {
      customer: customer.value,
      device_id: deviceCode,
      plan: planPayload.plan,
      days: planPayload.days,
      offline_days: Number(offlineDays.value || 7),
      expires_at: planPayload.expires_at
    };

    btnGenerateToken.disabled = true;
    try {
      const result = await window.licenseAdmin.generateToken({
        ...payload,
        passphrase: signPassphrase.value
      });
      tokenOutput.value = result.token || "";
      signPassphrase.value = "";

      const targetPath = String(publicTargetPath.value || "").trim();
      if (targetPath) {
        await window.licenseAdmin.exportPublicKey({
          target_path: targetPath
        });
      }

      await refreshIssued();
      await refreshStatus();
      showToast("Token gerado e chave publica alinhada com o PDV.", "success");
    } catch (error) {
      showToast(error.message || "Falha ao gerar token.", "error");
    } finally {
      btnGenerateToken.disabled = false;
    }
  }

  async function handleCopyToken() {
    const token = String(tokenOutput.value || "").trim();
    if (!token) {
      showToast("Nenhum token para copiar.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(token);
      showToast("Token copiado.", "success");
    } catch {
      showToast("Nao foi possivel copiar automaticamente.", "error");
    }
  }

  async function handleExportPublicKey() {
    const target = String(publicTargetPath.value || "").trim();
    if (!target) {
      showToast("Informe o caminho de destino da chave publica.", "error");
      return;
    }

    btnExportPublicKey.disabled = true;
    try {
      const result = await window.licenseAdmin.exportPublicKey({
        target_path: target
      });
      showToast(`Chave publica exportada para: ${result.target_path}`, "success");
      await refreshStatus();
    } catch (error) {
      showToast(error.message || "Falha ao exportar chave publica.", "error");
    } finally {
      btnExportPublicKey.disabled = false;
    }
  }

  btnRefreshStatus.addEventListener("click", refreshStatus);
  btnInitKeys.addEventListener("click", handleInitKeys);
  btnOpenVault.addEventListener("click", () => window.licenseAdmin.openVault());

  btnGenerateToken.addEventListener("click", handleGenerateToken);
  btnCopyToken.addEventListener("click", handleCopyToken);

  btnExportPublicKey.addEventListener("click", handleExportPublicKey);

  btnRefreshIssued.addEventListener("click", refreshIssued);
  plan.addEventListener("change", syncPlanForm);

  syncPlanForm();
  refreshStatus();
  refreshIssued();
})();
