import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import getVeiculos from '@salesforce/apex/VeiculoController.getVeiculos';
import { formatarMoeda, formatarQuilometragem, normalizarTexto, paraNumero, reduzirErros } from 'c/vendasUtils';

const ATRASO_BUSCA_MS = 300;
const STATUS_VENDIDO = 'Vendido';

const CLASSE_STATUS = {
    Disponível: 'status status-disponivel',
    Reservado: 'status status-reservado',
    Vendido: 'status status-vendido'
};

// Amostra de cor ao lado do nome da cor: o vendedor reconhece o carro de relance.
const COR_AMOSTRA = {
    preto: '#16181c',
    branco: '#f7f7f5',
    prata: '#c3c7cc',
    cinza: '#7d838b',
    grafite: '#4a4f57',
    vermelho: '#c0262d',
    azul: '#1f4fbf',
    verde: '#2f7d4f',
    amarelo: '#e8b923',
    marrom: '#6b4a32',
    bege: '#d8c7a8',
    laranja: '#e0701f',
    vinho: '#6d1a2a'
};

const ORDENACOES = {
    recentes: () => 0,
    menorPreco: (a, b) => a.preco - b.preco,
    maiorPreco: (a, b) => b.preco - a.preco,
    maisNovo: (a, b) => String(b.ano).localeCompare(String(a.ano))
};

export default class EstoqueVeiculos extends LightningElement {
    /** Ids dos veículos que o pai já tem na negociação (para marcar o card). */
    @api idsNoCarrinho = [];

    termoBusca = '';
    termoAplicado = '';
    filtroMarca = '';
    filtroAno = '';
    ordenacao = 'recentes';
    isLoading = true;
    erro = '';

    veiculos = [];
    wiredVeiculosResult;
    atualizadoAoAbrir = false;
    timeoutBusca;

    opcoesOrdenacao = [
        { label: 'Mais recentes', value: 'recentes' },
        { label: 'Menor preço', value: 'menorPreco' },
        { label: 'Maior preço', value: 'maiorPreco' },
        { label: 'Ano mais novo', value: 'maisNovo' }
    ];

    @wire(getVeiculos)
    wiredVeiculos(result) {
        this.wiredVeiculosResult = result;
        const { data, error } = result;

        if (data) {
            this.veiculos = data.map((veiculo) => this.montarVeiculo(veiculo));
            this.erro = '';
            this.isLoading = false;
            this.publicarResumo();
            // O wire pode entregar a lista do cache (ex.: antes de uma venda). Ao abrir a
            // vitrine, busca uma vez no servidor para o status dos carros vir atualizado.
            if (!this.atualizadoAoAbrir) {
                this.atualizadoAoAbrir = true;
                refreshApex(result);
            }
        } else if (error) {
            this.erro = reduzirErros(error) || 'Não foi possível carregar o estoque.';
            this.veiculos = [];
            this.isLoading = false;
        }
    }

    disconnectedCallback() {
        clearTimeout(this.timeoutBusca);
    }

    montarVeiculo(veiculo) {
        const cor = COR_AMOSTRA[normalizarTexto(veiculo.cor).split(' ')[0]];
        return {
            ...veiculo,
            vendido: veiculo.status === STATUS_VENDIDO,
            zeroKm: paraNumero(veiculo.quilometragem) === 0,
            precoFormatado: formatarMoeda(veiculo.preco),
            kmFormatado: formatarQuilometragem(veiculo.quilometragem),
            classeStatus: CLASSE_STATUS[veiculo.status] || 'status',
            textoFoto: `Foto do ${veiculo.marca} ${veiculo.modelo}`,
            portasTexto: veiculo.portas ? `${veiculo.portas} portas` : null,
            estiloCor: cor ? `background-color: ${cor};` : null,
            textoBusca: normalizarTexto([veiculo.marca, veiculo.modelo, veiculo.nome, veiculo.placa].join(' '))
        };
    }

    // O pai mostra esses números na abertura da tela.
    publicarResumo() {
        const disponiveis = this.veiculos.filter((v) => !v.vendido);
        this.dispatchEvent(
            new CustomEvent('resumoestoque', {
                detail: {
                    total: this.veiculos.length,
                    disponiveis: disponiveis.length,
                    valorDisponivel: disponiveis.reduce((soma, v) => soma + paraNumero(v.preco), 0)
                }
            })
        );
    }

    get veiculosFiltrados() {
        const termo = normalizarTexto(this.termoAplicado);
        const noCarrinho = new Set(this.idsNoCarrinho || []);

        return this.veiculos
            .filter((veiculo) => !termo || veiculo.textoBusca.includes(termo))
            .filter((veiculo) => !this.filtroMarca || veiculo.marca === this.filtroMarca)
            .filter((veiculo) => !this.filtroAno || String(veiculo.ano) === this.filtroAno)
            .sort(ORDENACOES[this.ordenacao])
            .map((veiculo, indice) => {
                const estaNoCarrinho = noCarrinho.has(veiculo.Id);
                let classeCard = 'veiculo';
                let rotuloAcao = 'Adicionar';
                let textoAcao = `Adicionar ${veiculo.marca} ${veiculo.modelo} à negociação`;
                if (veiculo.vendido) {
                    classeCard += ' veiculo-vendido';
                    rotuloAcao = 'Vendido';
                    textoAcao = `${veiculo.marca} ${veiculo.modelo} já foi vendido`;
                } else if (estaNoCarrinho) {
                    classeCard += ' veiculo-escolhido';
                    rotuloAcao = 'Na negociação';
                    textoAcao = `${veiculo.marca} ${veiculo.modelo} já está na negociação`;
                }
                return {
                    ...veiculo,
                    estaNoCarrinho,
                    bloqueado: estaNoCarrinho || veiculo.vendido,
                    classeCard,
                    rotuloAcao,
                    textoAcao,
                    // Entrada escalonada só na primeira pintura da vitrine
                    estiloCard: `animation-delay: ${Math.min(indice, 8) * 40}ms;`
                };
            });
    }

    get temVeiculos() {
        return this.veiculosFiltrados.length > 0;
    }

    get textoResultados() {
        const total = this.veiculosFiltrados.length;
        return total === 1 ? '1 veículo' : `${total} veículos`;
    }

    get temFiltroAtivo() {
        return Boolean(this.termoAplicado || this.filtroMarca || this.filtroAno);
    }

    // Chips de marca com contagem, derivados do próprio estoque carregado.
    get chipsMarca() {
        const contagem = this.veiculos.reduce((mapa, v) => {
            if (v.marca) {
                mapa.set(v.marca, (mapa.get(v.marca) || 0) + 1);
            }
            return mapa;
        }, new Map());

        const chips = [...contagem.entries()]
            .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
            .map(([marca, quantidade]) => ({ valor: marca, rotulo: marca, quantidade }));

        return [{ valor: '', rotulo: 'Todas', quantidade: this.veiculos.length }, ...chips].map((chip) => {
            const ativo = chip.valor === this.filtroMarca;
            return {
                ...chip,
                classe: ativo ? 'chip chip-ativo' : 'chip',
                ariaPressed: ativo ? 'true' : 'false'
            };
        });
    }

    get opcoesAno() {
        const anos = [...new Set(this.veiculos.map((v) => v.ano).filter(Boolean).map(String))].sort((a, b) =>
            b.localeCompare(a)
        );
        return [{ label: 'Todos os anos', value: '' }, ...anos.map((ano) => ({ label: ano, value: ano }))];
    }

    handleBusca(event) {
        this.termoBusca = event.target.value;
        clearTimeout(this.timeoutBusca);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.timeoutBusca = setTimeout(() => {
            this.termoAplicado = this.termoBusca;
        }, ATRASO_BUSCA_MS);
    }

    handleChipMarca(event) {
        this.filtroMarca = event.currentTarget.dataset.valor;
    }

    handleFiltroAno(event) {
        this.filtroAno = event.detail.value;
    }

    handleOrdenacao(event) {
        this.ordenacao = event.detail.value;
    }

    handleLimparFiltros() {
        clearTimeout(this.timeoutBusca);
        this.termoBusca = '';
        this.termoAplicado = '';
        this.filtroMarca = '';
        this.filtroAno = '';
    }

    async handleAtualizar() {
        this.isLoading = true;
        try {
            await refreshApex(this.wiredVeiculosResult);
        } finally {
            this.isLoading = false;
        }
    }

    handleAddCarrinho(event) {
        const veiculo = this.veiculos.find((item) => item.Id === event.currentTarget.dataset.id);
        if (!veiculo || veiculo.vendido) {
            return;
        }

        // Envia só os dados de negócio (sem campos de apresentação desta tela).
        // eslint-disable-next-line no-unused-vars
        const { textoBusca, classeStatus, vendido, zeroKm, textoFoto, portasTexto, estiloCor, ...dados } = veiculo;
        this.dispatchEvent(new CustomEvent('addcarrinho', { detail: dados }));
    }
}
