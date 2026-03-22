const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const RELEASE_DIR = path.join(ROOT_DIR, "release");
const PUBLICAR_DIR = path.join(ROOT_DIR, "publicar");
const PKG_PATH = path.join(ROOT_DIR, "package.json");
const CHANGELOG_PATH = path.join(ROOT_DIR, "CHANGELOG.md");

function escapeRegex(texto) {
  return String(texto || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lerPackageJson() {
  return JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
}

function lerReleaseNotes(version) {
  const fromEnv = String(process.env.APPGESTAO_RELEASE_NOTES || "").trim();
  if (fromEnv) return fromEnv;

  if (!fs.existsSync(CHANGELOG_PATH)) {
    return `- Melhorias e correcoes gerais da versao ${version}.`;
  }

  const raw = fs.readFileSync(CHANGELOG_PATH, "utf8");
  const linhas = raw.split(/\r?\n/);
  const headerAtual = new RegExp(`^##\\s*\\[?v?${escapeRegex(version)}\\]?\\b`, "i");

  let inicio = -1;
  for (let i = 0; i < linhas.length; i += 1) {
    if (headerAtual.test(linhas[i])) {
      inicio = i + 1;
      break;
    }
  }

  if (inicio < 0) {
    for (let i = 0; i < linhas.length; i += 1) {
      if (/^##\s+/.test(linhas[i])) {
        inicio = i + 1;
        break;
      }
    }
  }

  if (inicio < 0) {
    return `- Melhorias e correcoes gerais da versao ${version}.`;
  }

  let fim = linhas.length;
  for (let i = inicio; i < linhas.length; i += 1) {
    if (/^##\s+/.test(linhas[i])) {
      fim = i;
      break;
    }
  }

  const corpo = linhas
    .slice(inicio, fim)
    .join("\n")
    .replace(/\r/g, "")
    .trim();

  if (!corpo) {
    return `- Melhorias e correcoes gerais da versao ${version}.`;
  }

  return corpo;
}

function atualizarLatestYml(filePath, version, releaseNotes) {
  if (!fs.existsSync(filePath)) return false;

  const raw = fs.readFileSync(filePath, "utf8");
  const linhas = raw.split(/\r?\n/);
  const limpas = [];
  let skipReleaseNotes = false;

  for (const linha of linhas) {
    if (/^releaseName:/.test(linha)) continue;

    if (/^releaseNotes:/.test(linha)) {
      skipReleaseNotes = true;
      continue;
    }

    if (skipReleaseNotes) {
      if (/^\s+/.test(linha) || linha.trim() === "") {
        continue;
      }
      skipReleaseNotes = false;
    }

    limpas.push(linha);
  }

  while (limpas.length > 0 && limpas[limpas.length - 1].trim() === "") {
    limpas.pop();
  }

  limpas.push(`releaseName: 'v${version}'`);
  limpas.push("releaseNotes: |-");

  const notasLinhas = String(releaseNotes || "")
    .replace(/\r/g, "")
    .split("\n");

  if (notasLinhas.length < 1 || !notasLinhas.some((linha) => String(linha || "").trim())) {
    limpas.push("  Sem novidades registradas.");
  } else {
    for (const linha of notasLinhas) {
      limpas.push(`  ${linha}`);
    }
  }

  fs.writeFileSync(filePath, `${limpas.join("\n")}\n`, "utf8");
  return true;
}

function getArquivoInstaladorVersionado(version) {
  const arquivos = fs
    .readdirSync(RELEASE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  const candidatos = arquivos.filter(
    (nome) => nome.toLowerCase().endsWith(".exe") && nome.includes(`Setup ${version}`)
  );

  if (candidatos.length > 0) return candidatos[0];

  const exes = arquivos.filter((nome) => nome.toLowerCase().endsWith(".exe"));
  if (exes.length < 1) return "";

  exes.sort((a, b) => {
    const aTime = fs.statSync(path.join(RELEASE_DIR, a)).mtimeMs;
    const bTime = fs.statSync(path.join(RELEASE_DIR, b)).mtimeMs;
    return bTime - aTime;
  });
  return exes[0];
}

function copyFileIfExists(origem, destino) {
  if (!fs.existsSync(origem)) return false;
  fs.copyFileSync(origem, destino);
  return true;
}

function main() {
  if (!fs.existsSync(RELEASE_DIR)) {
    console.log("[postbuild] Pasta release nao encontrada. Nada a fazer.");
    return;
  }

  const pkg = lerPackageJson();
  const version = String(pkg.version || "").trim();
  if (!version) {
    throw new Error("Versao do package.json invalida.");
  }

  const notes = lerReleaseNotes(version);
  const latestReleasePath = path.join(RELEASE_DIR, "latest.yml");
  const latestPublicarPath = path.join(PUBLICAR_DIR, "latest.yml");

  const atualizouRelease = atualizarLatestYml(latestReleasePath, version, notes);
  if (!atualizouRelease) {
    console.warn("[postbuild] latest.yml nao encontrado em release.");
  } else {
    console.log("[postbuild] latest.yml atualizado com release notes.");
  }

  fs.mkdirSync(PUBLICAR_DIR, { recursive: true });

  const instalador = getArquivoInstaladorVersionado(version);
  if (!instalador) {
    throw new Error("Nao foi encontrado instalador .exe em release.");
  }

  const instaladorPath = path.join(RELEASE_DIR, instalador);
  const blockmapPath = `${instaladorPath}.blockmap`;

  copyFileIfExists(instaladorPath, path.join(PUBLICAR_DIR, instalador));
  copyFileIfExists(blockmapPath, path.join(PUBLICAR_DIR, `${instalador}.blockmap`));
  copyFileIfExists(latestReleasePath, latestPublicarPath);

  const resultado = {
    instalador,
    copiedBlockmap: fs.existsSync(path.join(PUBLICAR_DIR, `${instalador}.blockmap`)),
    copiedLatest: fs.existsSync(latestPublicarPath)
  };

  console.log(`[postbuild] Artefatos copiados para publicar: ${JSON.stringify(resultado)}`);
}

main();
