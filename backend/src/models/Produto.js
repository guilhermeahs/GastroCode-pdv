const db = require("../config/db");

const produtoByIdStmt = db.prepare(`
  SELECT id, nome, categoria, preco, estoque, estoque_minimo, ativo
  FROM produtos
  WHERE id = ?
`);

const produtosAtivosStmt = db.prepare(`
  SELECT
    id,
    nome,
    categoria,
    preco,
    estoque,
    estoque_minimo,
    ativo,
    CASE WHEN estoque <= estoque_minimo THEN 1 ELSE 0 END AS estoque_baixo
  FROM produtos
  WHERE ativo = 1
  ORDER BY categoria, nome
`);

const categoriasAtivasStmt = db.prepare(`
  SELECT categoria, COUNT(*) AS total
  FROM produtos
  WHERE ativo = 1
  GROUP BY categoria
  ORDER BY categoria
`);

const atualizarProdutoStmt = db.prepare(`
  UPDATE produtos
  SET nome = ?,
      categoria = ?,
      preco = ?,
      estoque = ?,
      estoque_minimo = ?,
      ativo = ?
  WHERE id = ?
`);

function validarTexto(value, field) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`Informe ${field}.`);
  }
  return text;
}

function normalizarNome(value) {
  const nome = validarTexto(value, "nome")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!nome) {
    throw new Error("Informe nome.");
  }

  return nome.slice(0, 90);
}

function normalizarCategoria(value) {
  const categoria = validarTexto(value, "categoria")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!categoria) {
    throw new Error("Informe categoria.");
  }

  return categoria
    .split(" ")
    .map((parte) => {
      if (!parte) return "";
      return parte.charAt(0).toUpperCase() + parte.slice(1);
    })
    .join(" ")
    .slice(0, 60);
}

function normalizarTextoChave(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function montarChaveProduto(nome, categoria) {
  return `${normalizarTextoChave(nome)}::${normalizarTextoChave(categoria)}`;
}

function validarNumero(value, field, min = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) {
    throw new Error(`${field} invalido.`);
  }
  return number;
}

function formatarProdutoListagem(item) {
  let categoriaNormalizada = "Sem categoria";
  try {
    categoriaNormalizada = normalizarCategoria(item.categoria);
  } catch {}
  return {
    ...item,
    categoria: categoriaNormalizada
  };
}

const ProdutoModel = {
  listar() {
    const rows = produtosAtivosStmt.all();
    return rows.map(formatarProdutoListagem);
  },

  listarCategorias() {
    return categoriasAtivasStmt.all().map((item) => {
      let categoria = "Sem categoria";
      try {
        categoria = normalizarCategoria(item.categoria);
      } catch {}
      return {
        categoria,
        total: Number(item.total || 0)
      };
    });
  },

  criar(dados) {
    const nome = normalizarNome(dados.nome);
    const categoria = normalizarCategoria(dados.categoria);
    const preco = Number(validarNumero(dados.preco, "Preco", 0.01).toFixed(2));
    const estoque = Math.floor(validarNumero(dados.estoque ?? 0, "Estoque", 0));
    const estoqueMinimo = Math.floor(validarNumero(dados.estoque_minimo ?? 0, "Estoque minimo", 0));

    const info = db
      .prepare(`
        INSERT INTO produtos (nome, categoria, preco, estoque, estoque_minimo, ativo)
        VALUES (?, ?, ?, ?, ?, 1)
      `)
      .run(nome, categoria, preco, estoque, estoqueMinimo);

    return produtoByIdStmt.get(info.lastInsertRowid);
  },

  atualizar(produtoId, dados = {}) {
    const produto = produtoByIdStmt.get(produtoId);
    if (!produto) {
      throw new Error("Produto nao encontrado.");
    }

    const nome = dados.nome !== undefined ? normalizarNome(dados.nome) : produto.nome;
    const categoria =
      dados.categoria !== undefined ? normalizarCategoria(dados.categoria) : normalizarCategoria(produto.categoria);
    const preco =
      dados.preco !== undefined
        ? Number(validarNumero(dados.preco, "Preco", 0.01).toFixed(2))
        : Number(produto.preco || 0);
    const estoque =
      dados.estoque !== undefined
        ? Math.floor(validarNumero(dados.estoque, "Estoque", 0))
        : Math.floor(Number(produto.estoque || 0));
    const estoqueMinimo =
      dados.estoque_minimo !== undefined
        ? Math.floor(validarNumero(dados.estoque_minimo, "Estoque minimo", 0))
        : Math.floor(Number(produto.estoque_minimo || 0));
    const ativo = dados.ativo === undefined ? Number(produto.ativo || 1) : dados.ativo ? 1 : 0;

    atualizarProdutoStmt.run(nome, categoria, preco, estoque, estoqueMinimo, ativo, produtoId);
    return produtoByIdStmt.get(produtoId);
  },

  atualizarEstoque(produtoId, estoque) {
    const produto = produtoByIdStmt.get(produtoId);
    if (!produto) {
      throw new Error("Produto nao encontrado.");
    }

    const estoqueFinal = Math.floor(validarNumero(estoque, "Estoque", 0));

    db.prepare(`
      UPDATE produtos
      SET estoque = ?
      WHERE id = ?
    `).run(estoqueFinal, produtoId);

    return produtoByIdStmt.get(produtoId);
  },

  atualizarEstoqueEmLote(dados = {}) {
    const ids = Array.isArray(dados.produto_ids)
      ? dados.produto_ids.map((item) => Number(item)).filter((item) => Number.isFinite(item))
      : [];

    if (ids.length === 0) {
      throw new Error("Selecione produtos para o ajuste em lote.");
    }

    const operacao = String(dados.operacao || "SOMAR").toUpperCase() === "DEFINIR" ? "DEFINIR" : "SOMAR";
    const valor = Number(dados.valor);
    if (!Number.isFinite(valor)) {
      throw new Error("Informe um valor valido para o ajuste em lote.");
    }

    const atualizados = [];
    const tx = db.transaction(() => {
      for (const produtoId of ids) {
        const produto = produtoByIdStmt.get(produtoId);
        if (!produto || produto.ativo !== 1) continue;

        const estoqueAtual = Math.floor(Number(produto.estoque || 0));
        const estoqueFinal =
          operacao === "DEFINIR" ? Math.floor(valor) : Math.floor(estoqueAtual + valor);

        db.prepare(`
          UPDATE produtos
          SET estoque = ?
          WHERE id = ?
        `).run(Math.max(0, estoqueFinal), produtoId);

        atualizados.push(produtoByIdStmt.get(produtoId));
      }
    });

    tx();

    return {
      operacao,
      valor: operacao === "DEFINIR" ? Math.floor(valor) : Number(valor.toFixed(2)),
      total_atualizados: atualizados.length,
      produtos: atualizados
    };
  },

  importarEmLote(dados = {}) {
    const itensEntrada = Array.isArray(dados.itens) ? dados.itens : [];
    if (itensEntrada.length === 0) {
      throw new Error("Nenhum item informado para importacao.");
    }

    const modoEstoque = String(dados.modo_estoque || "SOMAR").toUpperCase() === "DEFINIR" ? "DEFINIR" : "SOMAR";
    const erros = [];
    const itensValidos = [];

    for (let index = 0; index < itensEntrada.length; index += 1) {
      const item = itensEntrada[index] || {};
      try {
        const nome = normalizarNome(item.nome);
        const categoria = normalizarCategoria(item.categoria);
        const preco = Number(validarNumero(item.preco, "Preco", 0.01).toFixed(2));
        const estoque = Math.floor(validarNumero(item.estoque ?? 0, "Estoque", 0));
        const estoqueMinimo = Math.floor(
          validarNumero(item.estoque_minimo ?? item.estoqueMinimo ?? 0, "Estoque minimo", 0)
        );

        itensValidos.push({
          nome,
          categoria,
          preco,
          estoque,
          estoque_minimo: estoqueMinimo
        });
      } catch (error) {
        erros.push({
          linha: index + 1,
          erro: error.message || "Item invalido."
        });
      }
    }

    if (itensValidos.length === 0) {
      const detalhe = erros.length > 0 ? ` Detalhes: ${erros[0].erro}` : "";
      throw new Error(`Nenhum item valido para importar.${detalhe}`);
    }

    const mapaPorChave = new Map(
      produtosAtivosStmt.all().map((item) => [montarChaveProduto(item.nome, item.categoria), item])
    );

    const categoriasAfetadas = new Set();
    const itensAtualizados = [];
    const itensCriados = [];

    const tx = db.transaction(() => {
      for (const item of itensValidos) {
        const chave = montarChaveProduto(item.nome, item.categoria);
        const existente = mapaPorChave.get(chave);

        if (existente && existente.ativo === 1) {
          const estoqueBase = Math.floor(Number(existente.estoque || 0));
          const estoqueFinal = modoEstoque === "DEFINIR" ? item.estoque : estoqueBase + item.estoque;

          atualizarProdutoStmt.run(
            item.nome,
            item.categoria,
            item.preco,
            Math.max(0, estoqueFinal),
            item.estoque_minimo,
            1,
            existente.id
          );

          const atualizado = produtoByIdStmt.get(existente.id);
          itensAtualizados.push(atualizado);
          mapaPorChave.set(chave, atualizado);
          categoriasAfetadas.add(item.categoria);
          continue;
        }

        const info = db
          .prepare(`
            INSERT INTO produtos (nome, categoria, preco, estoque, estoque_minimo, ativo)
            VALUES (?, ?, ?, ?, ?, 1)
          `)
          .run(item.nome, item.categoria, item.preco, item.estoque, item.estoque_minimo);

        const criado = produtoByIdStmt.get(info.lastInsertRowid);
        itensCriados.push(criado);
        mapaPorChave.set(chave, criado);
        categoriasAfetadas.add(item.categoria);
      }
    });

    tx();

    return {
      modo_estoque: modoEstoque,
      total_recebidos: itensEntrada.length,
      total_validos: itensValidos.length,
      total_criados: itensCriados.length,
      total_atualizados: itensAtualizados.length,
      total_erros: erros.length,
      erros: erros.slice(0, 20),
      categorias_afetadas: Array.from(categoriasAfetadas).sort((a, b) => a.localeCompare(b, "pt-BR"))
    };
  },

  inativar(produtoId) {
    const produto = produtoByIdStmt.get(produtoId);
    if (!produto) {
      throw new Error("Produto nao encontrado.");
    }

    if (produto.ativo !== 1) {
      throw new Error("Produto ja esta inativo.");
    }

    db.prepare(`
      UPDATE produtos
      SET ativo = 0
      WHERE id = ?
    `).run(produtoId);

    return { ok: true, produto_id: produtoId };
  },

  estoqueBaixo() {
    return db
      .prepare(`
        SELECT id, nome, categoria, estoque, estoque_minimo
        FROM produtos
        WHERE ativo = 1 AND estoque <= estoque_minimo
        ORDER BY estoque ASC, nome ASC
      `)
      .all();
  }
};

module.exports = ProdutoModel;
