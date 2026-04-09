const EntregaModel = require("../models/Entrega");
const EntregasIntegracaoService = require("../services/entregasIntegracaoService");

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

  listarPendentes(req, res) {
    try {
      const q = String(req.query?.q || "").trim();
      const lista = EntregaModel.listarPendentes(q);
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

  listarIntegracoes(req, res) {
    try {
      res.json(EntregasIntegracaoService.listarIntegracoes());
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  salvarIntegracao(req, res) {
    try {
      const result = EntregasIntegracaoService.salvarIntegracao(req.params.provider, req.body || {});
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async sincronizarIntegracao(req, res) {
    try {
      const result = await EntregasIntegracaoService.sincronizar(req.params.provider, req.body || {});
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  webhookHub(req, res) {
    try {
      const token =
        String(req.params?.token || "").trim() ||
        String(req.query?.token || "").trim() ||
        String(req.headers["x-hub-token"] || "").trim();
      const source = String(req.query?.source || req.headers["x-delivery-source"] || "").trim();
      const provider = String(req.query?.provider || req.headers["x-delivery-provider"] || source || "").trim();
      const payment = String(req.query?.payment || req.headers["x-delivery-payment"] || "").trim();
      const motoboy = String(req.query?.motoboy || req.headers["x-delivery-motoboy"] || "").trim();

      const result = EntregasIntegracaoService.receberWebhookHub(req.body || {}, {
        token,
        provider,
        source,
        payment,
        motoboy
      });

      res.status(202).json({
        ok: true,
        ...(result || {})
      });
    } catch (error) {
      const status = Number(error?.statusCode || 400);
      res.status(status).json({ error: error.message });
    }
  },

  async webhookIfood(req, res) {
    try {
      const signature = String(req.headers["x-ifood-signature"] || req.headers["x-webhook-signature"] || "").trim();
      const result = await EntregasIntegracaoService.webhookIfood(req.body || {}, {
        headers: req.headers || {},
        signature,
        rawBody: String(req.rawBody || "")
      });
      res.status(200).json({
        ok: true,
        ...(result || {})
      });
    } catch (error) {
      const status = Number(error?.statusCode || 400);
      res.status(status).json({ error: error.message });
    }
  },

  ifoodStatus(req, res) {
    try {
      res.json(EntregasIntegracaoService.getIfoodHomologacaoStatus());
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  ifoodSalvar(req, res) {
    try {
      const result = EntregasIntegracaoService.salvarIfoodHomologacao(req.body || {});
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async ifoodSincronizar(req, res) {
    try {
      const result = await EntregasIntegracaoService.sincronizarIfoodHomologacao(req.body || {});
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  ifoodEventos(req, res) {
    try {
      const limit = Number(req.query?.limit || req.body?.limit || 60);
      res.json({
        items: EntregasIntegracaoService.listarIfoodEventos(limit)
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async ifoodRenovarToken(req, res) {
    try {
      const force = req.body?.force !== undefined ? Boolean(req.body.force) : true;
      const result = await EntregasIntegracaoService.renovarIfoodToken(force);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
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
  },

  async opcoesCancelamentoPedido(req, res) {
    try {
      const pedidoId = toId(req.params.pedidoId);
      const pedidoAtual = EntregaModel.obterPedido(pedidoId);
      const result = await EntregasIntegracaoService.listarOpcoesCancelamentoManual(pedidoAtual);
      res.json(result || { items: [] });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async confirmarPedido(req, res) {
    try {
      const pedidoId = toId(req.params.pedidoId);
      const pedidoAtual = EntregaModel.obterPedido(pedidoId);
      const confirmResult = await EntregasIntegracaoService.confirmarPedidoManual(pedidoAtual, req.body || {});
      const atualizado = EntregaModel.atualizarPedido(pedidoId, {
        status: confirmResult?.status || pedidoAtual?.status || "CONFIRMED",
        detalhes: confirmResult?.detalhes || pedidoAtual?.detalhes || {}
      });
      res.json({
        ...atualizado,
        confirm_result: confirmResult || null
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async cancelarPedido(req, res) {
    try {
      const pedidoId = toId(req.params.pedidoId);
      const pedidoAtual = EntregaModel.obterPedido(pedidoId);
      const cancelResult = await EntregasIntegracaoService.cancelarPedidoManual(pedidoAtual, req.body || {});
      const atualizado = EntregaModel.atualizarPedido(pedidoId, {
        status: cancelResult?.status || "CANCELLED",
        detalhes: cancelResult?.detalhes || pedidoAtual?.detalhes || {}
      });
      res.json({
        ...atualizado,
        cancel_result: cancelResult || null
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async atribuirPedido(req, res) {
    try {
      const pedidoId = toId(req.params.pedidoId);
      const motoboyId = toId(req.body?.motoboy_id);
      let atualizado = EntregaModel.atribuirPedido(motoboyId, pedidoId, req.body || {});
      const autoDispatch = await EntregasIntegracaoService.autoDespacharAoAtribuir(atualizado);

      if (autoDispatch?.applied) {
        atualizado = EntregaModel.atribuirPedido(motoboyId, pedidoId, {
          ...(req.body || {}),
          source: atualizado.source,
          payment: atualizado.payment,
          whenISO: atualizado.data_iso,
          external_id: atualizado.external_id,
          status: autoDispatch.status,
          detalhes: autoDispatch.detalhes
        });
      }

      res.json({
        ...atualizado,
        auto_dispatch: autoDispatch || { applied: false }
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
};

module.exports = EntregasController;
