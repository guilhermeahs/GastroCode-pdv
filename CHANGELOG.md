# Changelog - GastroCode Brasil PDV

Todas as mudancas importantes do app ficam registradas aqui.

## [1.0.18] - 2026-04-03

- Correcao no card de pedidos online para nao duplicar selo de cancelamento (mostra apenas um "Cancelado").
- Ajuste de leitura de status iFood: `RECEIVED/PLACED/CREATED` agora aparece como "Recebido" (mais claro no fluxo).
- Melhorias de consistencia visual na aba Online ao exibir status e badges de pedido.

## [1.0.17] - 2026-03-23

- Modulo Entregas/Motoboys com painel unico de lancamento de pedidos (codigo + motoboy + forma de pagamento).
- Remocao dos campos repetidos dentro de cada card de motoboy para fluxo mais rapido e limpo.
- Cada pedido de motoboy agora mostra forma de pagamento diretamente na lista.
- Correcao de tela preta no modulo Entregas (import faltante do SelectField).
- Ajuste no layout dos cards de motoboy para eliminar espacos vazios e esticamento incorreto.
- Controle de caixa ampliado com resumo do caixa aberto: subtotal, taxa, total vendido, vendas, ticket medio e pagamentos por forma.

## [1.0.16] - 2026-03-22

- Nova aba dedicada de Relatorios na topbar, separada do Financeiro.
- Relatorio gerencial completo com filtro por periodo personalizado (data inicial/final).
- KPIs ampliados: faturamento, subtotal, taxa, couvert, ticket medio, vendas, itens, pessoas e tempo medio.
- Novos blocos analiticos: pagamentos detalhados, vendas por hora, desempenho por garcom, status atual de mesas e movimentos de caixa.
- Exportacao de relatorio em CSV e JSON direto pela tela de Relatorios.

## [1.0.15] - 2026-03-22

- Correcao critica no restore de backup para preservar a licenca ativa do dispositivo.
- Limpeza/restauracao de dados nao remove mais o registro de ativacao da licenca local.
- Estabilidade melhorada no fluxo de backup para evitar perda de licenca apos restaurar.

## [1.0.14] - 2026-03-21

- Dashboard financeiro com comparativo de Dia, Semana e Mes.
- Indicadores por periodo com Faturamento, Ticket medio e Vendas.
- Variacao percentual de Faturamento e Ticket frente ao periodo anterior.
- Backend de relatorios atualizado para entregar comparativos padronizados.

## [1.0.13] - 2026-03-21

- Changelog de atualizacao passa a mostrar historico completo de mudancas registradas.
- Timeline de release notes com ordenacao por versao para leitura clara no popup de update.
- Melhoria de estabilidade no fluxo de exibicao de novidades apos atualizar.

## [1.0.12] - 2026-03-21

- Correcao no disparo do changelog para aparecer corretamente no primeiro update apos migracao.
- Compatibilidade adicionada para clientes que tinham apenas chave antiga de versao vista.
- Mais estabilidade no fluxo de aviso de novidades apos atualizar o app.

## [1.0.11] - 2026-03-21

- Janela "Adicionar produtos" ajustada para tamanho fixo e visual estavel durante uso.
- Lista de produtos no modal corrigida para nao esticar cards e botoes quando houver poucos resultados.
- Exibicao do changelog reforcada para abrir automaticamente quando detectar versao nova instalada.

## [1.0.8] - 2026-03-16

- Changelog da versao agora abre automaticamente na tela sempre que o app atualiza.
- Modal de novidades com versao, titulo da release e notas de atualizacao.
- Ajustes no fluxo de deteccao de versao para nao repetir popup na mesma versao.

## [1.0.7] - 2026-03-16

- Melhorias gerais de estabilidade no fluxo de mesas, fechamento e impressao.
- Ajustes de layout para uso touch e escalas diferentes de tela.
- Melhorias no controle de licenca e em mensagens operacionais.
- Aprimoramentos na configuracao e no visual geral do sistema.
