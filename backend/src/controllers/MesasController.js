const MesaModel = require("../models/Mesa");
const ProdutoModel = require("../models/Produto");

function toId(value) {
  return Number(value);
}

function normalizarDataRef(dataInput) {
  if (dataInput === undefined || dataInput === null || dataInput === "") {
    return null;
  }

  const value = String(dataInput).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Data invalida. Use o formato YYYY-MM-DD.");
  }

  return value;
}

function normalizarIntervaloDatas(query = {}) {
  const dataRef = normalizarDataRef(query?.data);
  const dataInicio = normalizarDataRef(query?.data_inicio);
  const dataFim = normalizarDataRef(query?.data_fim);

  if (dataRef && (dataInicio || dataFim)) {
    throw new Error("Use 'data' ou 'data_inicio/data_fim', nao os dois juntos.");
  }

  if (dataRef) {
    return {
      data: dataRef,
      data_inicio: null,
      data_fim: null
    };
  }

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new Error("Data inicial nao pode ser maior que a data final.");
  }

  return {
    data: null,
    data_inicio: dataInicio || null,
    data_fim: dataFim || null
  };
}

const MesasController = {
  listarMesas(req, res) {
    try {
      res.json(MesaModel.listarMesas());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  criarMesa(req, res) {
    try {
      const { numero } = req.body || {};
      const mesa = MesaModel.criarMesa(numero);
      res.status(201).json(mesa);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  excluirMesa(req, res) {
    try {
      const forcar =
        String(req.query?.forcar || "").trim() === "1" ||
        req.body?.forcar === true;
      const resultado = forcar
        ? MesaModel.excluirMesaForcada(toId(req.params.id))
        : MesaModel.excluirMesa(toId(req.params.id));
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  listarProdutos(req, res) {
    try {
      res.json(ProdutoModel.listar());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  listarCategoriasProdutos(req, res) {
    try {
      res.json({ categorias: ProdutoModel.listarCategorias() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  criarProduto(req, res) {
    try {
      const produto = ProdutoModel.criar(req.body || {});
      res.status(201).json(produto);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  atualizarProduto(req, res) {
    try {
      const produto = ProdutoModel.atualizar(toId(req.params.id), req.body || {});
      res.json(produto);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  ajustarEstoqueProduto(req, res) {
    try {
      const { estoque } = req.body || {};
      const produto = ProdutoModel.atualizarEstoque(toId(req.params.id), Number(estoque));
      res.json(produto);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  ajustarEstoqueProdutoLote(req, res) {
    try {
      const resultado = ProdutoModel.atualizarEstoqueEmLote(req.body || {});
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  importarProdutosLote(req, res) {
    try {
      const resultado = ProdutoModel.importarEmLote(req.body || {});
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  removerProduto(req, res) {
    try {
      const resultado = ProdutoModel.inativar(toId(req.params.id));
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  atualizarQuantidadeItem(req, res) {
    try {
      const { quantidade } = req.body;
      const resultado = MesaModel.atualizarQuantidadeItem(
        toId(req.params.id),
        toId(req.params.itemId),
        Number(quantidade)
      );
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  removerItem(req, res) {
    try {
      const resultado = MesaModel.removerItem(toId(req.params.id), toId(req.params.itemId));
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  detalheMesa(req, res) {
    try {
      res.json(MesaModel.getMesaComPedido(toId(req.params.id)));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  abrirMesa(req, res) {
    try {
      const { cliente_nome } = req.body;
      const resultado = MesaModel.abrirMesa(toId(req.params.id), cliente_nome);
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  adicionarItem(req, res) {
    try {
      const { produto_id, quantidade } = req.body;
      const resultado = MesaModel.adicionarItem(
        toId(req.params.id),
        Number(produto_id),
        Number(quantidade || 1)
      );
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  fecharMesa(req, res) {
    try {
      const resultado = MesaModel.fecharMesa(toId(req.params.id), req.body || {});
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  retomarFechamento(req, res) {
    try {
      const resultado = MesaModel.retomarFechamento(toId(req.params.id));
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  pagarMesa(req, res) {
    try {
      const resultado = MesaModel.pagarMesa(toId(req.params.id), req.body);
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  reabrirMesa(req, res) {
    try {
      const resultado = MesaModel.reabrirMesa(toId(req.params.id));
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  historico(req, res) {
    try {
      const intervalo = normalizarIntervaloDatas(req.query || {});
      res.json(MesaModel.historico(intervalo));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  excluirHistorico(req, res) {
    try {
      const resultado = MesaModel.excluirHistorico(toId(req.params.id));
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
};

module.exports = MesasController;
