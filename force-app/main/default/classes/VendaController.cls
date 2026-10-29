/**
 * Fecha a venda do fluxo SalesCar: cria a Opportunity ganha com os veículos como produtos
 * e marca os veículos como vendidos. Tudo numa transação (Savepoint): ou grava tudo, ou nada.
 */
public with sharing class VendaController {
    @TestVisible
    private static final String ESTAGIO_GANHO = 'Closed Won';
    private static final String STATUS_VENDIDO = 'Vendido';
    private static final Integer LIMITE_DESCRICAO = 32000;

    public class DadosVenda {
        public Id clienteId;
        public List<Id> veiculoIds;
        public Decimal percentualDesconto;
        public String formaPagamento;
        public String textoProposta;
    }

    @AuraEnabled
    public static Id fecharVenda(String dados) {
        DadosVenda venda = lerDados(dados);
        Savepoint pontoSeguro = Database.setSavepoint();
        try {
            Map<Id, Product2> veiculos = carregarVeiculos(venda.veiculoIds);
            Account cliente = [SELECT Id, Name FROM Account WHERE Id = :venda.clienteId LIMIT 1];
            Id catalogoId = catalogoPadraoId();
            Map<Id, Id> precoPorVeiculo = garantirPrecos(catalogoId, veiculos.values());

            Opportunity oportunidade = new Opportunity(
                AccountId = cliente.Id,
                Name = nomeDaVenda(cliente.Name, veiculos.values()),
                StageName = ESTAGIO_GANHO,
                CloseDate = Date.today(),
                Pricebook2Id = catalogoId,
                Description = venda.textoProposta == null ? null : venda.textoProposta.left(LIMITE_DESCRICAO)
            );
            insert oportunidade;

            Decimal desconto = venda.percentualDesconto == null ? 0 : venda.percentualDesconto;
            List<OpportunityLineItem> itens = new List<OpportunityLineItem>();
            for (Product2 veiculo : veiculos.values()) {
                itens.add(
                    new OpportunityLineItem(
                        OpportunityId = oportunidade.Id,
                        PricebookEntryId = precoPorVeiculo.get(veiculo.Id),
                        Quantity = 1,
                        UnitPrice = valorOuZero(veiculo.Preco__c),
                        Discount = desconto > 0 ? desconto : null
                    )
                );
                veiculo.Status_Veiculo__c = STATUS_VENDIDO;
            }
            insert itens;
            update veiculos.values();

            return oportunidade.Id;
        } catch (AuraHandledException e) {
            Database.rollback(pontoSeguro);
            throw e;
        } catch (Exception e) {
            Database.rollback(pontoSeguro);
            throw erro('Não foi possível registrar a venda: ' + e.getMessage());
        }
    }

    private static DadosVenda lerDados(String dados) {
        DadosVenda venda;
        try {
            venda = (DadosVenda) JSON.deserialize(dados, DadosVenda.class);
        } catch (Exception e) {
            throw erro('Dados da venda inválidos.');
        }
        if (venda == null || venda.clienteId == null) {
            throw erro('Escolha o cliente antes de finalizar a venda.');
        }
        if (venda.veiculoIds == null || venda.veiculoIds.isEmpty()) {
            throw erro('Adicione ao menos um veículo antes de finalizar a venda.');
        }
        return venda;
    }

    // Trava os veículos (FOR UPDATE) para dois vendedores não venderem o mesmo carro ao mesmo tempo.
    private static Map<Id, Product2> carregarVeiculos(List<Id> ids) {
        Map<Id, Product2> veiculos = new Map<Id, Product2>(
            [
                SELECT Id, Name, Marca__c, Modelo__c, Preco__c, Status_Veiculo__c, IsActive
                FROM Product2
                WHERE Id IN :ids
                FOR UPDATE
            ]
        );
        List<String> indisponiveis = new List<String>();
        for (Id veiculoId : ids) {
            Product2 veiculo = veiculos.get(veiculoId);
            if (veiculo == null || !veiculo.IsActive) {
                indisponiveis.add('veículo removido do estoque');
            } else if (veiculo.Status_Veiculo__c == STATUS_VENDIDO) {
                indisponiveis.add(veiculo.Name + ' já foi vendido');
            }
        }
        if (!indisponiveis.isEmpty()) {
            throw erro(
                'Venda não registrada: ' + String.join(indisponiveis, '; ') + '. Atualize o estoque e revise a negociação.'
            );
        }
        return veiculos;
    }

    private static Id catalogoPadraoId() {
        if (Test.isRunningTest()) {
            return Test.getStandardPricebookId();
        }
        return [SELECT Id FROM Pricebook2 WHERE IsStandard = TRUE LIMIT 1].Id;
    }

    // Veículo sem preço no catálogo padrão ganha um (com o preço do cadastro); preço inativo é reativado.
    private static Map<Id, Id> garantirPrecos(Id catalogoId, List<Product2> veiculos) {
        Map<Id, PricebookEntry> existentes = new Map<Id, PricebookEntry>();
        for (PricebookEntry entrada : [
            SELECT Id, Product2Id, IsActive
            FROM PricebookEntry
            WHERE Pricebook2Id = :catalogoId AND Product2Id IN :veiculos
        ]) {
            existentes.put(entrada.Product2Id, entrada);
        }

        List<PricebookEntry> paraGravar = new List<PricebookEntry>();
        for (Product2 veiculo : veiculos) {
            PricebookEntry entrada = existentes.get(veiculo.Id);
            if (entrada == null) {
                entrada = new PricebookEntry(
                    Pricebook2Id = catalogoId,
                    Product2Id = veiculo.Id,
                    UnitPrice = valorOuZero(veiculo.Preco__c),
                    IsActive = true
                );
                existentes.put(veiculo.Id, entrada);
                paraGravar.add(entrada);
            } else if (!entrada.IsActive) {
                entrada.IsActive = true;
                paraGravar.add(entrada);
            }
        }
        upsert paraGravar;

        Map<Id, Id> resultado = new Map<Id, Id>();
        for (Id veiculoId : existentes.keySet()) {
            resultado.put(veiculoId, existentes.get(veiculoId).Id);
        }
        return resultado;
    }

    private static String nomeDaVenda(String cliente, List<Product2> veiculos) {
        List<String> modelos = new List<String>();
        for (Product2 veiculo : veiculos) {
            String modelo = String.isNotBlank(veiculo.Modelo__c)
                ? String.join(new List<String>{ veiculo.Marca__c, veiculo.Modelo__c }, ' ').trim()
                : veiculo.Name;
            modelos.add(modelo);
        }
        return ('Venda ' + cliente + ' - ' + String.join(modelos, ', ')).left(120);
    }

    // setMessage: sem ele, getMessage() devolve "Script-thrown exception" (testes e logs perdem o motivo).
    private static AuraHandledException erro(String mensagem) {
        AuraHandledException excecao = new AuraHandledException(mensagem);
        excecao.setMessage(mensagem);
        return excecao;
    }

    private static Decimal valorOuZero(Decimal valor) {
        return valor == null ? 0 : valor;
    }
}
