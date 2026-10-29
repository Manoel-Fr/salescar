@IsTest
private class VeiculoControllerTest {
    @TestSetup
    static void setup() {
        insert new List<Product2>{
            new Product2(
                Name = 'Corolla XEi',
                IsActive = true,
                Marca__c = 'Toyota',
                Modelo__c = 'Corolla',
                Ano__c = '2022',
                Preco__c = 150000,
                Custo__c = 120000,
                Comissao__c = 2
            ),
            new Product2(Name = 'Sem preço', IsActive = true, Marca__c = 'Fiat', Modelo__c = 'Uno'),
            new Product2(Name = 'Inativo', IsActive = false, Marca__c = 'Ford', Modelo__c = 'Ka')
        };
        insert new List<Account>{
            new Account(Name = 'Auto Center Brasil', Website = 'autocenter.com.br'),
            new Account(Name = 'Locadora Sul', Phone = '5133334444')
        };
    }

    @IsTest
    static void getVeiculosRetornaSomenteAtivosComValoresCalculados() {
        Test.startTest();
        List<VeiculoController.VeiculoWrapper> veiculos = VeiculoController.getVeiculos();
        Test.stopTest();

        Assert.areEqual(2, veiculos.size(), 'Produtos inativos não devem aparecer no estoque');

        Map<String, VeiculoController.VeiculoWrapper> porModelo = new Map<String, VeiculoController.VeiculoWrapper>();
        for (VeiculoController.VeiculoWrapper v : veiculos) {
            porModelo.put(v.modelo, v);
        }

        VeiculoController.VeiculoWrapper corolla = porModelo.get('Corolla');
        Assert.areEqual(30000, corolla.lucro, 'Lucro deve ser preço menos custo');
        Assert.isTrue(corolla.financeiroVisivel, 'Admin enxerga o custo');

        VeiculoController.VeiculoWrapper uno = porModelo.get('Uno');
        Assert.areEqual(0, uno.preco, 'Preço nulo deve virar zero');
        Assert.areEqual('Disponível', uno.status, 'Status vazio assume Disponível');
    }

    @IsTest
    static void getClientesSemTermoRetornaTodosOrdenados() {
        List<Account> clientes = VeiculoController.getClientes(null);

        Assert.areEqual(2, clientes.size());
        Assert.areEqual('Auto Center Brasil', clientes[0].Name, 'Lista deve vir ordenada por nome');
    }

    @IsTest
    static void getClientesFiltraPorNomeWebsiteOuTelefone() {
        Assert.areEqual(1, VeiculoController.getClientes('locadora').size(), 'Busca por nome');
        Assert.areEqual(1, VeiculoController.getClientes('autocenter.com').size(), 'Busca por website');
        Assert.areEqual(1, VeiculoController.getClientes('3333').size(), 'Busca por telefone');
        Assert.areEqual(0, VeiculoController.getClientes('inexistente').size(), 'Sem correspondência');
    }
}
