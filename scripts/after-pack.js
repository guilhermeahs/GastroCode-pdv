const fs = require("fs");
const path = require("path");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const productFilename =
    context?.packager?.appInfo?.productFilename ||
    context?.packager?.appInfo?.productName ||
    "Gestao de Mesas e Caixa";

  const projectDir = context.appDir || context?.packager?.projectDir || process.cwd();
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(projectDir, "build", "icon.ico");

  if (!fs.existsSync(exePath) || !fs.existsSync(iconPath)) return;

  try {
    const { rcedit } = await import("rcedit");
    await rcedit(exePath, { icon: iconPath });
    console.log(`[afterPack] Icone aplicado no executavel: ${exePath}`);
  } catch (error) {
    console.warn(`[afterPack] Falha ao aplicar icone: ${String(error?.message || error)}`);
  }
};
