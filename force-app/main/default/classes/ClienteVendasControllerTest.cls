@IsTest
private class ClienteVendasControllerTest {
    @TestSetup
    static void setup() {
        Account conta = new Account(
            Name = 'Auto Center Brasil',
            Phone = '1133334444',
            Industry = 'Retail',
            BillingCity = 'São Paulo',
            BillingState = 'SP'
        );
        insert conta;
        insert new Contact(AccountId = conta.Id, LastName = 'Souza', FirstName = 'Ana', Email = 'ana@exemplo.com');
        insert new List<Opportunity>{
            new Opportunity(AccountId = conta.Id, Name = 'Compra SW4', StageName = 'Closed Won', CloseDate = Date.today().addDays(-30), Amount = 300000),
            new Opportunity(AccountId = conta.Id, Name = 'Compra Civic', StageName = 'Closed Won', CloseDate = Date.today().addDays(-10), Amount = 100000),
            new Opportunity(AccountId = conta.Id, Name = 'Jetta em negociação', StageName = 'Prospecting', CloseDate = Date.today().addDays(15), Amount = 150000)
        };
    }

    @IsTest
    static void montaPerfilComContatosEHistorico() {
        Id contaId = [SELECT Id FROM Account LIMIT 1].Id;

        Test.startTest();
        ClienteVendasController.PerfilCliente perfil = ClienteVendasController.getPerfil(contaId);
        Test.stopTest();

        Assert.areEqual('Auto Center Brasil', perfil.nome);
        Assert.areEqual('São Paulo, SP', perfil.endereco, 'Endereço junta só as partes preenchidas');
        Assert.areEqual(1, perfil.contatos.size());
        Assert.areEqual('ana@exemplo.com', perfil.contatos[0].email);
        Assert.areEqual(3, perfil.oportunidades.size());
        Assert.areEqual(2, perfil.comprasQuantidade, 'Só oportunidades ganhas contam como compra');
        Assert.areEqual(400000, perfil.comprasTotal);
        Assert.areEqual(Date.today().addDays(-10), perfil.ultimaCompra);
        Assert.areEqual(1, perfil.negociacoesAbertas);
    }

    @IsTest
    static void recusaIdVazio() {
        try {
            ClienteVendasController.getPerfil(null);
            Assert.fail('Deveria recusar Id vazio');
        } catch (AuraHandledException e) {
            Assert.isNotNull(e.getMessage());
        }
    }
}
