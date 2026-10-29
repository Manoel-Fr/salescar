@IsTest
private class VendaControllerTest {
    @TestSetup
    static void setup() {
        insert new Account(Name = 'Auto Center Brasil');
        insert new List<Product2>{
            new Product2(Name = 'Toyota Hilux SRX', IsActive = true, Marca__c = 'Toyota', Modelo__c = 'Hilux', Preco__c = 300000, Status_Veiculo__c = 'Disponível'),
            new Product2(Name = 'Fiat Strada Volcano', IsActive = true, Marca__c = 'Fiat', Modelo__c = 'Strada', Preco__c = 100000, Status_Veiculo__c = 'Disponível'),
            new Product2(Name = 'Chevrolet Onix', IsActive = true, Marca__c = 'Chevrolet', Modelo__c = 'Onix', Preco__c = 90000, Status_Veiculo__c = 'Vendido')
        };
    }

    private static String dados(Id clienteId, List<Id> veiculoIds, Decimal desconto) {
        return JSON.serialize(
            new Map<String, Object>{
                'clienteId' => clienteId,
                'veiculoIds' => veiculoIds,
                'percentualDesconto' => desconto,
                'formaPagamento' => 'financiamento',
                'textoProposta' => '*Proposta SalesCar*\nValor final: R$ 380.000,00'
            }
        );
    }

    @IsTest
    static void criaVendaGanhaComProdutosEMarcaVeiculosComoVendidos() {
        Id clienteId = [SELECT Id FROM Account LIMIT 1].Id;
        List<Id> veiculoIds = new List<Id>(
            new Map<Id, Product2>([SELECT Id FROM Product2 WHERE Status_Veiculo__c = 'Disponível']).keySet()
        );

        Test.startTest();
        Id vendaId = VendaController.fecharVenda(dados(clienteId, veiculoIds, 5));
        Test.stopTest();

        Opportunity venda = [
            SELECT StageName, AccountId, Amount, Name, Description, (SELECT UnitPrice, Discount, TotalPrice FROM OpportunityLineItems)
            FROM Opportunity
            WHERE Id = :vendaId
        ];
        Assert.areEqual(VendaController.ESTAGIO_GANHO, venda.StageName);
        Assert.areEqual(clienteId, venda.AccountId);
        Assert.areEqual(2, venda.OpportunityLineItems.size(), 'Um item por veículo');
        Assert.areEqual(380000, venda.Amount, 'Valor com 5% de desconto sobre 400 mil');
        Assert.isTrue(venda.Name.contains('Auto Center Brasil'));
        Assert.isTrue(venda.Description.contains('Proposta SalesCar'));

        for (Product2 veiculo : [SELECT Status_Veiculo__c FROM Product2 WHERE Id IN :veiculoIds]) {
            Assert.areEqual('Vendido', veiculo.Status_Veiculo__c);
        }
        Assert.areEqual(2, [SELECT COUNT() FROM PricebookEntry WHERE Product2Id IN :veiculoIds], 'Cria o preço que faltava');
    }

    @IsTest
    static void recusaVeiculoJaVendidoSemGravarNada() {
        Id clienteId = [SELECT Id FROM Account LIMIT 1].Id;
        List<Id> veiculoIds = new List<Id>(new Map<Id, Product2>([SELECT Id FROM Product2]).keySet());

        try {
            VendaController.fecharVenda(dados(clienteId, veiculoIds, 0));
            Assert.fail('Deveria recusar veículo vendido');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().contains('já foi vendido'), e.getMessage());
        }
        Assert.areEqual(0, [SELECT COUNT() FROM Opportunity]);
        Assert.areEqual(0, [SELECT COUNT() FROM Product2 WHERE Status_Veiculo__c = 'Vendido' AND Preco__c > 90000]);
    }

    @IsTest
    static void exigeClienteEVeiculo() {
        try {
            VendaController.fecharVenda(dados(null, new List<Id>(), 0));
            Assert.fail('Deveria exigir cliente');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().contains('cliente'), e.getMessage());
        }
    }
}
