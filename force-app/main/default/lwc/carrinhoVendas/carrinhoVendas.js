import { LightningElement, api } from 'lwc';
import { calcularResumo, formatarMoeda } from 'c/vendasUtils';

// Itens, totais e o botão de avançar do painel de negociação.
export default class CarrinhoVendas extends LightningElement {
    @api itensCarrinho = [];
    @api clienteSelecionado;

    get resumo() {
        return calcularResumo(this.itensCarrinho);
    }

    get itensExibidos() {
        return (this.itensCarrinho || []).map((item) => ({
            ...item,
            precoFormatado: formatarMoeda(item.preco),
            detalhe: [item.ano, item.placa].filter(Boolean).join(', '),
            textoRemover: `Remover ${item.marca} ${item.modelo} da negociação`
        }));
    }

    get temItens() {
        return this.resumo.quantidade > 0;
    }

    get rotuloVeiculos() {
        const quantidade = this.resumo.quantidade;
        return quantidade === 1 ? 'Veículo (1)' : `Veículos (${quantidade})`;
    }

    get subtotalFormatado() {
        return formatarMoeda(this.resumo.subtotal);
    }

    get comissaoFormatado() {
        return formatarMoeda(this.resumo.comissao);
    }

    get temComissao() {
        return this.resumo.comissao > 0;
    }

    // Lucro só aparece se o usuário enxerga o custo (FLS em Custo__c) e todo item tem custo
    // cadastrado — sem custo, o "lucro" seria o próprio preço.
    get mostrarLucro() {
        return (
            this.temItens &&
            this.itensCarrinho.every((item) => item.financeiroVisivel && Number(item.custo) > 0)
        );
    }

    get lucroFormatado() {
        return formatarMoeda(this.resumo.subtotal - this.resumo.custo);
    }

    // O cliente pode ser escolhido aqui ou na etapa Cliente; para avançar basta ter veículo.
    get pendencia() {
        return this.temItens ? '' : 'Adicione ao menos um veículo do estoque.';
    }

    get bloqueado() {
        return Boolean(this.pendencia);
    }

    handleFinalizar() {
        this.dispatchEvent(new CustomEvent('finalizar'));
    }

    handleRemoverItem(event) {
        this.dispatchEvent(
            new CustomEvent('removeritem', {
                detail: { id: event.currentTarget.dataset.id }
            })
        );
    }

    handleLimparCarrinho() {
        this.dispatchEvent(new CustomEvent('limparcarrinho'));
    }
}
