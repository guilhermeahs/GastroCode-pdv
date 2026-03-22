const { spawn } = require("child_process");

function execPowerShell(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script
      ],
      { windowsHide: true }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Falha ao executar PowerShell (codigo ${code}).`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function escapePsLiteral(value) {
  return String(value || "").replaceAll("'", "''");
}

function normalizarTextoEscPos(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\u202F/g, " ")
    .replace(/[^\x20-\x7E\n]/g, "")
    .trim();
}

async function listarImpressorasSistema() {
  const script = `
    $ErrorActionPreference = 'Stop';
    $lista = Get-Printer | Sort-Object Name | Select-Object -ExpandProperty Name;
    $lista | ConvertTo-Json -Compress
  `;

  const output = await execPowerShell(script);
  if (!output) return [];

  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    if (typeof parsed === "string" && parsed.trim()) return [parsed.trim()];
  } catch {
    return output
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

async function imprimirTextoDireto(texto, nomeImpressora, opcoes = {}) {
  const seguroTexto = normalizarTextoEscPos(texto);
  const seguroNome = String(nomeImpressora || "").trim();
  const larguraPapel = Number(opcoes?.largura_papel_mm) === 58 ? 58 : 80;
  const linhasFeedFinal = Number.isFinite(Number(opcoes?.linhas_feed_final))
    ? Math.max(2, Math.min(12, Number(opcoes.linhas_feed_final)))
    : 6;
  const cortarPapel = opcoes?.cortar_papel !== false;
  const larguraPontos = larguraPapel === 58 ? 384 : 576;
  const larguraNL = larguraPontos & 0xff;
  const larguraNH = (larguraPontos >> 8) & 0xff;
  const conteudoBase64 = Buffer.from(`${seguroTexto}\n`, "utf8").toString("base64");

  if (!seguroTexto) {
    throw new Error("Conteudo de impressao vazio.");
  }

  if (!seguroNome) {
    throw new Error("Impressora nao informada.");
  }

  const script = `
    $ErrorActionPreference = 'Stop';
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDataType;
  }

  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, DOCINFO di);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int count, out int written);
}
"@;

    $conteudo = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${escapePsLiteral(conteudoBase64)}'));
    $conteudo = $conteudo -replace "\`r\`n|\`r|\`n", "\`r\`n";
    if (-not $conteudo.EndsWith("\`r\`n")) { $conteudo += "\`r\`n"; }

    $encoding = [System.Text.Encoding]::GetEncoding(850); # Latin 1 (compativel na maioria das termicas)
    $textoBytes = $encoding.GetBytes($conteudo);

    $payload = New-Object System.Collections.Generic.List[byte];
    [void]$payload.AddRange([byte[]](0x1B,0x40)); # ESC @ init
    [void]$payload.AddRange([byte[]](0x1B,0x74,0x02)); # ESC t 2 (PC850)
    [void]$payload.AddRange([byte[]](0x1B,0x32)); # ESC 2 (line spacing padrao)
    [void]$payload.AddRange([byte[]](0x1B,0x4D,0x00)); # ESC M 0 (font A)
    [void]$payload.AddRange([byte[]](0x1B,0x61,0x00)); # ESC a 0 (left)
    [void]$payload.AddRange([byte[]](0x1D,0x4C,0x00,0x00)); # GS L 0 0 (left margin zero)
    [void]$payload.AddRange([byte[]](0x1D,0x57,${larguraNL},${larguraNH})); # GS W nL nH (print area)
    [void]$payload.AddRange([byte[]](0x1D,0x21,0x00)); # GS ! 0 (size normal)
    [void]$payload.AddRange($textoBytes);
    [void]$payload.AddRange([byte[]](0x1B,0x64,${linhasFeedFinal})); # ESC d n (espaco inferior)
    ${cortarPapel ? "[void]$payload.AddRange([byte[]](0x1D,0x56,0x00)); # GS V 0 (full cut)" : ""}

    $hPrinter = [IntPtr]::Zero;
    if (-not [RawPrinterHelper]::OpenPrinter('${escapePsLiteral(seguroNome)}', [ref]$hPrinter, [IntPtr]::Zero)) {
      throw 'Impressora invalida ou indisponivel.';
    }

    try {
      $docInfo = New-Object RawPrinterHelper+DOCINFO;
      $docInfo.pDocName = 'PDV-TERMICA';
      $docInfo.pDataType = 'RAW';
      $job = [RawPrinterHelper]::StartDocPrinter($hPrinter, 1, $docInfo);
      if ($job -le 0) {
        throw 'Nao foi possivel iniciar o spool RAW.';
      }

      try {
        if (-not [RawPrinterHelper]::StartPagePrinter($hPrinter)) {
          throw 'Nao foi possivel iniciar a pagina de impressao.';
        }
        try {
          $bytes = $payload.ToArray();
          $written = 0;
          if (-not [RawPrinterHelper]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written)) {
            throw 'Falha ao enviar bytes ESC/POS para a impressora.';
          }
          if ($written -lt $bytes.Length) {
            throw 'Impressao incompleta. Nem todos os bytes foram enviados.';
          }
        } finally {
          [RawPrinterHelper]::EndPagePrinter($hPrinter) | Out-Null;
        }
      } finally {
        [RawPrinterHelper]::EndDocPrinter($hPrinter) | Out-Null;
      }
    } finally {
      if ($hPrinter -ne [IntPtr]::Zero) {
        [RawPrinterHelper]::ClosePrinter($hPrinter) | Out-Null;
      }
    }
  `;

  await execPowerShell(script);
}

const ImpressaoController = {
  async listarImpressoras(req, res) {
    try {
      const impressoras = await listarImpressorasSistema();
      res.json({ impressoras });
    } catch (error) {
      res.status(500).json({ error: error.message || "Falha ao listar impressoras." });
    }
  },

  async imprimirTexto(req, res) {
    try {
      const conteudo = req.body?.conteudo;
      const impressora = req.body?.impressora;
      const largura_papel_mm = req.body?.largura_papel_mm;
      const linhas_feed_final = req.body?.linhas_feed_final;
      const cortar_papel = req.body?.cortar_papel;

      await imprimirTextoDireto(conteudo, impressora, {
        largura_papel_mm,
        linhas_feed_final,
        cortar_papel
      });

      res.status(201).json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error.message || "Falha ao enviar impressao." });
    }
  }
};

module.exports = ImpressaoController;
