/**
 * Controller do fluxo de Força de Vendas (forcaVendasMain e filhos).
 * Leitura apenas: respeita sharing (with sharing) e FLS via Security.stripInaccessible,
 * para que campos sensíveis (ex.: Custo__c, Comissao__c) não cheguem a quem não pode vê-los.
 */
public with sharing class VeiculoController {
    @TestVisible
    private static final Integer LIMITE_VEICULOS = 100;
    @TestVisible
    private static final Integer LIMITE_CLIENTES = 50;
    private static final String STATUS_PADRAO = 'Disponível';

    @AuraEnabled(cacheable=true)
    public static List<Account> getClientes(String termo) {
        try {
            // Bind variable já impede injeção; não usar escapeSingleQuotes (quebraria nomes como "D'Ávila").
            String busca = String.isBlank(termo) ? null : '%' + termo.trim() + '%';
            List<Account> clientes = busca == null
                ? [
                      SELECT Id, Name, Phone, Website, Industry
                      FROM Account
                      ORDER BY Name
                      LIMIT :LIMITE_CLIENTES
                  ]
                : [
                      SELECT Id, Name, Phone, Website, Industry
                      FROM Account
                      WHERE Name LIKE :busca OR Website LIKE :busca OR Phone LIKE :busca
                      ORDER BY Name
                      LIMIT :LIMITE_CLIENTES
                  ];
            return (List<Account>) Security.stripInaccessible(AccessType.READABLE, clientes).getRecords();
        } catch (Exception e) {
            throw new AuraHandledException('Não foi possível carregar os clientes. ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<VeiculoWrapper> getVeiculos() {
        try {
            List<Product2> produtos = [
                SELECT
                    Id,
                    Name,
                    ProductCode,
                    Marca__c,
                    Modelo__c,
                    Ano__c,
                    Cor__c,
                    Quilometragem__c,
                    Preco__c,
                    Custo__c,
                    Comissao__c,
                    Status_Veiculo__c,
                    Placa__c,
                    Combustivel__c,
                    Cambio__c,
                    Portas__c,
                    UrlMin__c,
                    Description
                FROM Product2
                WHERE IsActive = TRUE
                ORDER BY CreatedDate DESC
                LIMIT :LIMITE_VEICULOS
            ];

            List<VeiculoWrapper> veiculos = new List<VeiculoWrapper>();
            for (SObject registro : Security.stripInaccessible(AccessType.READABLE, produtos).getRecords()) {
                veiculos.add(new VeiculoWrapper(registro));
            }
            return veiculos;
        } catch (Exception e) {
            throw new AuraHandledException('Não foi possível carregar o estoque. ' + e.getMessage());
        }
    }

    public class VeiculoWrapper {
        @AuraEnabled public String Id;
        @AuraEnabled public String nome;
        @AuraEnabled public String codigo;
        @AuraEnabled public String marca;
        @AuraEnabled public String modelo;
        @AuraEnabled public String ano;
        @AuraEnabled public String cor;
        @AuraEnabled public Decimal quilometragem;
        @AuraEnabled public Decimal preco;
        @AuraEnabled public Decimal custo;
        @AuraEnabled public Decimal comissao;
        @AuraEnabled public Decimal lucro;
        @AuraEnabled public Boolean financeiroVisivel;
        @AuraEnabled public String status;
        @AuraEnabled public String placa;
        @AuraEnabled public String combustivel;
        @AuraEnabled public String cambio;
        @AuraEnabled public Decimal portas;
        @AuraEnabled public String imagemUrl;
        @AuraEnabled public String descricao;

        // Lê via SObject.get(): aceita o nome com ou sem prefixo de namespace
        // (getPopulatedFieldsAsMap devolve as chaves prefixadas em org com namespace).
        public VeiculoWrapper(SObject p) {
            this.Id = (String) ler(p, 'Id');
            this.nome = (String) ler(p, 'Name');
            this.codigo = (String) ler(p, 'ProductCode');
            this.marca = (String) ler(p, 'Marca__c');
            this.modelo = (String) ler(p, 'Modelo__c');
            this.ano = (String) ler(p, 'Ano__c');
            this.cor = (String) ler(p, 'Cor__c');
            this.quilometragem = (Decimal) ler(p, 'Quilometragem__c');
            this.preco = zeroSeNulo((Decimal) ler(p, 'Preco__c'));
            this.custo = zeroSeNulo((Decimal) ler(p, 'Custo__c'));
            this.comissao = zeroSeNulo((Decimal) ler(p, 'Comissao__c'));
            this.financeiroVisivel = foiConsultado(p, 'Custo__c');
            this.lucro = this.financeiroVisivel ? this.preco - this.custo : null;
            String statusVeiculo = (String) ler(p, 'Status_Veiculo__c');
            this.status = String.isBlank(statusVeiculo) ? STATUS_PADRAO : statusVeiculo;
            this.placa = (String) ler(p, 'Placa__c');
            this.combustivel = (String) ler(p, 'Combustivel__c');
            this.cambio = (String) ler(p, 'Cambio__c');
            this.portas = (Decimal) ler(p, 'Portas__c');
            this.imagemUrl = (String) ler(p, 'UrlMin__c');
            this.descricao = (String) ler(p, 'Description');
        }

        private Decimal zeroSeNulo(Decimal valor) {
            return valor == null ? 0 : valor;
        }
    }

    // Campo removido pelo stripInaccessible (sem FLS) lança SObjectException na leitura.
    private static Object ler(SObject registro, String campo) {
        try {
            return registro.get(campo);
        } catch (SObjectException e) {
            return null;
        }
    }

    private static Boolean foiConsultado(SObject registro, String campo) {
        try {
            registro.get(campo);
            return true;
        } catch (SObjectException e) {
            return false;
        }
    }
}
