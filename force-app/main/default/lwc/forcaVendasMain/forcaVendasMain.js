import { LightningElement, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import fecharVenda from '@salesforce/apex/VendaController.fecharVenda';
import { calcularResumo, formatarMoeda, formatarMoedaCompacta, reduzirErros } from 'c/vendasUtils';

// Chave da versão antiga, que guardava a negociação no navegador. Só é usada para limpar.
const CHAVE_SESSAO_ANTIGA = 'forcaVendas:negociacao';

// Fonte única das etapas do fluxo: ordem, textos e o que cada uma exige.
const ETAPAS = [
    { nome: 'montagem', titulo: 'Veículos', manchete: 'Monte a negociação', exige: [] },
    { nome: 'cliente', titulo: 'Cliente', manchete: 'Conheça o cliente', exige: ['itens'] },
    { nome: 'credito', titulo: 'Crédito', manchete: 'Consulte o crédito', exige: ['itens', 'cliente'] },
    { nome: 'proposta', titulo: 'Proposta', manchete: 'Feche a proposta', exige: ['itens', 'cliente'] }
];

const DICA_REQUISITO = {
    itens: 'Adicione ao menos um veículo',
    cliente: 'Escolha o cliente'
};

export default class ForcaVendasMain extends NavigationMixin(LightningElement) {
    @api titulo = 'Força de Vendas';

    activeTab = ETAPAS[0].nome;
    clienteSelecionado = null;
    itensCarrinho = [];
    resumoEstoque = null;
    ofertaCredito = null;
    registrandoVenda = false;

    // A negociação vive só na tela: recarregar começa uma nova.
    connectedCallback() {
        this.limparNegociacaoAntiga();
    }

    // ---------- Estado derivado ----------

    get resumo() {
        return calcularResumo(this.itensCarrinho);
    }

    get quantidadeCarrinho() {
        return this.resumo.quantidade;
    }

    get textoQuantidade() {
        return this.quantidadeCarrinho === 1 ? '1 veículo' : `${this.quantidadeCarrinho} veículos`;
    }

    get totalCarrinho() {
        return formatarMoeda(this.resumo.subtotal);
    }

    get idsNoCarrinho() {
        return this.itensCarrinho.map((item) => item.Id);
    }

    get saudacao() {
        const hora = new Date().getHours();
        if (hora < 12) {
            return 'Bom dia';
        }
        return hora < 18 ? 'Boa tarde' : 'Boa noite';
    }

    get manchete() {
        return ETAPAS.find((etapa) => etapa.nome === this.activeTab).manchete;
    }

    get textoDisponiveis() {
        return this.resumoEstoque ? String(this.resumoEstoque.disponiveis) : '—';
    }

    get textoTotalEstoque() {
        return this.resumoEstoque ? `de ${this.resumoEstoque.total} no estoque` : 'carregando estoque';
    }

    get valorDisponivel() {
        return this.resumoEstoque ? formatarMoedaCompacta(this.resumoEstoque.valorDisponivel) : '—';
    }

    get totalNegociacaoCompacto() {
        return formatarMoedaCompacta(this.resumo.subtotal);
    }

    // Nas etapas 2–4 a abertura fica compacta para sobrar altura ao conteúdo
    get classeHero() {
        return this.isMontagem ? 'hero' : 'hero hero-compacto';
    }

    get isMontagem() {
        return this.activeTab === 'montagem';
    }

    get isCliente() {
        return this.activeTab === 'cliente';
    }

    get isCredito() {
        return this.activeTab === 'credito';
    }

    get isProposta() {
        return this.activeTab === 'proposta';
    }

    get valorNegociacao() {
        return this.resumo.subtotal;
    }

    requisitoPendente(etapa) {
        const atendidos = { itens: this.quantidadeCarrinho > 0, cliente: Boolean(this.clienteSelecionado) };
        return etapa.exige.find((requisito) => !atendidos[requisito]);
    }

    get indiceAtivo() {
        return ETAPAS.findIndex((etapa) => etapa.nome === this.activeTab);
    }

    get etapas() {
        return ETAPAS.map((etapa, indice) => {
            const ativa = indice === this.indiceAtivo;
            const pendente = this.requisitoPendente(etapa);
            let classe = 'etapa';
            if (ativa) {
                classe += ' etapa-ativa';
            } else if (indice < this.indiceAtivo) {
                classe += ' etapa-feita';
            }
            return {
                ...etapa,
                numero: indice + 1,
                classe,
                ariaCurrent: ativa ? 'step' : null,
                bloqueada: Boolean(pendente),
                dica: pendente ? DICA_REQUISITO[pendente] : null
            };
        });
    }

    // Rodapé das etapas intermediárias: voltar / continuar
    get etapaAnterior() {
        return ETAPAS[this.indiceAtivo - 1];
    }

    get proximaEtapa() {
        return ETAPAS[this.indiceAtivo + 1];
    }

    get rotuloVoltar() {
        return this.etapaAnterior ? `Voltar: ${this.etapaAnterior.titulo}` : '';
    }

    get rotuloContinuar() {
        return this.proximaEtapa ? `Continuar: ${this.proximaEtapa.titulo}` : '';
    }

    get continuarBloqueado() {
        return !this.proximaEtapa || Boolean(this.requisitoPendente(this.proximaEtapa));
    }

    get dicaContinuar() {
        const pendente = this.proximaEtapa && this.requisitoPendente(this.proximaEtapa);
        return pendente ? DICA_REQUISITO[pendente] : '';
    }

    // ---------- Navegação ----------

    handleNavegar(event) {
        this.navigateToTab(event.currentTarget.dataset.etapa);
    }

    handleVoltar() {
        if (this.etapaAnterior) {
            this.navigateToTab(this.etapaAnterior.nome);
        }
    }

    handleContinuar() {
        if (this.proximaEtapa) {
            this.navigateToTab(this.proximaEtapa.nome);
        }
    }

    handleVerNegociacao() {
        this.refs.negociacao?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    navigateToTab(nomeEtapa) {
        const etapa = ETAPAS.find((item) => item.nome === nomeEtapa);
        if (etapa && !this.requisitoPendente(etapa)) {
            this.activeTab = nomeEtapa;
        }
    }

    // ---------- Eventos dos filhos ----------
    // O painel lateral já mostra cada mudança; toast só para o que o vendedor não vê.

    handleResumoEstoque(event) {
        this.resumoEstoque = event.detail;
    }

    handleAddCarrinho(event) {
        const veiculo = event.detail;
        if (this.itensCarrinho.some((item) => item.Id === veiculo.Id)) {
            return;
        }
        this.itensCarrinho = [...this.itensCarrinho, veiculo];
        this.descartarOferta();
    }

    handleSelecionarCliente(event) {
        this.clienteSelecionado = event.detail;
        this.descartarOferta();
    }

    handleRemoverCliente() {
        this.clienteSelecionado = null;
        this.descartarOferta();
    }

    handleRemoverItem(event) {
        this.itensCarrinho = this.itensCarrinho.filter((item) => item.Id !== event.detail.id);
        this.descartarOferta();
    }

    handleLimparTodoCarrinho() {
        this.itensCarrinho = [];
        this.descartarOferta();
    }

    // Painel da montagem: segue para a etapa Cliente
    handleFinalizar() {
        this.navigateToTab('cliente');
    }

    handleOfertaSelecionada(event) {
        this.ofertaCredito = event.detail;
        this.mostrarToast(
            'Oferta escolhida',
            `${event.detail.banco}: ${event.detail.prazo}x de ${formatarMoeda(event.detail.parcela)}. Condições levadas para a proposta.`,
            'success'
        );
        this.navigateToTab('proposta');
    }

    handlePularCredito() {
        this.navigateToTab('proposta');
    }

    handleCancelarProposta() {
        this.navigateToTab('credito');
    }

    // Oferta de crédito vale para um valor e um cliente; mudou, descarta.
    descartarOferta() {
        this.ofertaCredito = null;
    }

    // Grava a venda (Opportunity ganha + veículos vendidos) e abre o registro criado.
    async handleFinalizarVenda(event) {
        if (this.registrandoVenda) {
            return;
        }
        const proposta = event.detail;
        this.registrandoVenda = true;
        try {
            const vendaId = await fecharVenda({
                dados: JSON.stringify({
                    clienteId: proposta.cliente.Id,
                    veiculoIds: proposta.veiculos.map((veiculo) => veiculo.Id),
                    percentualDesconto: proposta.percentualDesconto,
                    formaPagamento: proposta.formaPagamento,
                    textoProposta: proposta.textoProposta
                })
            });

            this.mostrarToast(
                'Venda registrada',
                `Venda para ${proposta.cliente.Name} no valor de ${formatarMoeda(proposta.totalFinal)}`,
                'success'
            );
            this.handleNovaNegociacao();
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: { recordId: vendaId, objectApiName: 'Opportunity', actionName: 'view' }
            });
        } catch (erro) {
            this.mostrarToast('Venda não registrada', reduzirErros(erro) || 'Tente de novo.', 'error');
        } finally {
            this.registrandoVenda = false;
        }
    }

    // Remove o que a versão anterior deixou guardado no navegador.
    limparNegociacaoAntiga() {
        try {
            window.sessionStorage.removeItem(CHAVE_SESSAO_ANTIGA);
        } catch (e) {
            // Storage indisponível: não há nada para limpar.
        }
    }

    get temNegociacao() {
        return this.quantidadeCarrinho > 0 || Boolean(this.clienteSelecionado);
    }

    handleNovaNegociacao() {
        this.itensCarrinho = [];
        this.clienteSelecionado = null;
        this.ofertaCredito = null;
        this.activeTab = ETAPAS[0].nome;
    }

    mostrarToast(titulo, mensagem, variante) {
        this.dispatchEvent(new ShowToastEvent({ title: titulo, message: mensagem, variant: variante }));
    }
}
