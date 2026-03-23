const EntregaModel = require("../models/Entrega");

function toId(value) {
  return Number(value);
}

const EntregasController = {
  listarMotoboys(req, res) {
    try {
      const q = String(req.query?.q || "").trim();
      const lista = EntregaModel.listarMotoboys(q);
      res.json(lista);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  resumo(req, res) {
    try {
      res.json(EntregaModel.resumo());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  criarMotoboy(req, res) {
    try {
      const novo = EntregaModel.criarMotoboy(req.body || {});
      res.status(201).json(novo);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  atualizarMotoboy(req, res) {
    try {
      const atualizado = EntregaModel.atualizarMotoboy(toId(req.params.id), req.body || {});
      res.json(atualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  excluirMotoboy(req, res) {
    try {
      const resultado = EntregaModel.excluirMotoboy(toId(req.params.id));
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  adicionarPedidosLote(req, res) {
    try {
      const resultado = EntregaModel.adicionarPedidosLote(toId(req.params.id), req.body || {});
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  removerPedido(req, res) {
    try {
      const removido = EntregaModel.removerPedido(toId(req.params.pedidoId));
      res.json(removido);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
};

module.exports = EntregasController;
