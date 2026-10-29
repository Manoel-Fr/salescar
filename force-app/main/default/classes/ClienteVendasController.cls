/**
 * Perfil completo do cliente para a etapa "Cliente" do fluxo de Força de Vendas.
 * Leitura apenas: with sharing + Security.stripInaccessible (campo sem FLS volta vazio, não quebra).
 * Devolve DTO com nomes neutros: SObject chega ao LWC com chaves prefixadas em org com namespace.
 */
public with sharing class ClienteVendasController {
    @TestVisible
    private static final Integer LIMITE_CONTATOS = 5;
    @TestVisible
    private static final Integer LIMITE_OPORTUNIDADES = 6;

    @AuraEnabled(cacheable=true)
    public static PerfilCliente getPerfil(Id accountId) {
        if (accountId == null) {
            throw new AuraHandledException('Informe o cliente.');
        }
        try {
            List<Account> contas = [
                SELECT
                    Id,
                    Name,
                    Phone,
                    Website,
                    Industry,
                    Type,
                    Rating,
                    AnnualRevenue,
                    NumberOfEmployees,
                    BillingStreet,
                    BillingCity,
                    BillingState,
                    BillingPostalCode,
                    Description,
                    CreatedDate,
                    Owner.Name,
                    (
                        SELECT Id, Name, Title, Email, Phone, MobilePhone
                        FROM Contacts
                        ORDER BY CreatedDate
                        LIMIT :LIMITE_CONTATOS
                    ),
                    (
                        SELECT Id, Name, StageName, Amount, CloseDate, IsWon, IsClosed
                        FROM Opportunities
                        ORDER BY CloseDate DESC
                        LIMIT :LIMITE_OPORTUNIDADES
                    )
                FROM Account
                WHERE Id = :accountId
                LIMIT 1
            ];
            if (contas.isEmpty()) {
                throw new AuraHandledException('Cliente não encontrado ou sem acesso.');
            }
            Account conta = (Account) Security.stripInaccessible(AccessType.READABLE, contas).getRecords()[0];

            PerfilCliente perfil = new PerfilCliente(conta);
            preencherCompras(perfil, accountId);
            return perfil;
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Não foi possível carregar o perfil do cliente. ' + e.getMessage());
        }
    }

    private static void preencherCompras(PerfilCliente perfil, Id accountId) {
        AggregateResult ganhos = [
            SELECT COUNT(Id) quantidade, SUM(Amount) total, MAX(CloseDate) ultima
            FROM Opportunity
            WHERE AccountId = :accountId AND IsWon = TRUE
        ];
        perfil.comprasQuantidade = (Integer) ganhos.get('quantidade');
        perfil.comprasTotal = (Decimal) ganhos.get('total');
        perfil.ultimaCompra = (Date) ganhos.get('ultima');
        perfil.negociacoesAbertas = [
            SELECT COUNT()
            FROM Opportunity
            WHERE AccountId = :accountId AND IsClosed = FALSE
        ];
    }

    // Campo removido pelo stripInaccessible lança SObjectException na leitura.
    private static Object ler(SObject registro, String campo) {
        try {
            return registro.get(campo);
        } catch (SObjectException e) {
            return null;
        }
    }

    private static List<SObject> filhos(SObject registro, String relacao) {
        try {
            List<SObject> lista = registro.getSObjects(relacao);
            return lista == null ? new List<SObject>() : lista;
        } catch (SObjectException e) {
            return new List<SObject>();
        }
    }

    public class PerfilCliente {
        @AuraEnabled public String id;
        @AuraEnabled public String nome;
        @AuraEnabled public String telefone;
        @AuraEnabled public String site;
        @AuraEnabled public String segmento;
        @AuraEnabled public String tipo;
        @AuraEnabled public String classificacao;
        @AuraEnabled public Decimal receitaAnual;
        @AuraEnabled public Integer funcionarios;
        @AuraEnabled public String endereco;
        @AuraEnabled public String descricao;
        @AuraEnabled public Datetime clienteDesde;
        @AuraEnabled public String responsavel;
        @AuraEnabled public Integer comprasQuantidade = 0;
        @AuraEnabled public Decimal comprasTotal;
        @AuraEnabled public Date ultimaCompra;
        @AuraEnabled public Integer negociacoesAbertas = 0;
        @AuraEnabled public List<Contato> contatos = new List<Contato>();
        @AuraEnabled public List<Oportunidade> oportunidades = new List<Oportunidade>();

        PerfilCliente(Account conta) {
            this.id = conta.Id;
            this.nome = (String) ler(conta, 'Name');
            this.telefone = (String) ler(conta, 'Phone');
            this.site = (String) ler(conta, 'Website');
            this.segmento = (String) ler(conta, 'Industry');
            this.tipo = (String) ler(conta, 'Type');
            this.classificacao = (String) ler(conta, 'Rating');
            this.receitaAnual = (Decimal) ler(conta, 'AnnualRevenue');
            this.funcionarios = (Integer) ler(conta, 'NumberOfEmployees');
            this.descricao = (String) ler(conta, 'Description');
            this.clienteDesde = (Datetime) ler(conta, 'CreatedDate');
            this.endereco = montarEndereco(conta);

            SObject dono = conta.getSObject('Owner');
            this.responsavel = dono == null ? null : (String) ler(dono, 'Name');

            for (SObject c : filhos(conta, 'Contacts')) {
                this.contatos.add(new Contato(c));
            }
            for (SObject o : filhos(conta, 'Opportunities')) {
                this.oportunidades.add(new Oportunidade(o));
            }
        }

        private String montarEndereco(Account conta) {
            List<String> partes = new List<String>();
            for (String campo : new List<String>{ 'BillingStreet', 'BillingCity', 'BillingState', 'BillingPostalCode' }) {
                String valor = (String) ler(conta, campo);
                if (String.isNotBlank(valor)) {
                    partes.add(valor);
                }
            }
            return partes.isEmpty() ? null : String.join(partes, ', ');
        }
    }

    public class Contato {
        @AuraEnabled public String id;
        @AuraEnabled public String nome;
        @AuraEnabled public String cargo;
        @AuraEnabled public String email;
        @AuraEnabled public String telefone;

        Contato(SObject c) {
            this.id = (String) ler(c, 'Id');
            this.nome = (String) ler(c, 'Name');
            this.cargo = (String) ler(c, 'Title');
            this.email = (String) ler(c, 'Email');
            String celular = (String) ler(c, 'MobilePhone');
            this.telefone = String.isNotBlank(celular) ? celular : (String) ler(c, 'Phone');
        }
    }

    public class Oportunidade {
        @AuraEnabled public String id;
        @AuraEnabled public String nome;
        @AuraEnabled public String fase;
        @AuraEnabled public Decimal valor;
        @AuraEnabled public Date fechamento;
        @AuraEnabled public Boolean ganha;
        @AuraEnabled public Boolean fechada;

        Oportunidade(SObject o) {
            this.id = (String) ler(o, 'Id');
            this.nome = (String) ler(o, 'Name');
            this.fase = (String) ler(o, 'StageName');
            this.valor = (Decimal) ler(o, 'Amount');
            this.fechamento = (Date) ler(o, 'CloseDate');
            this.ganha = (Boolean) ler(o, 'IsWon');
            this.fechada = (Boolean) ler(o, 'IsClosed');
        }
    }
}
