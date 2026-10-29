import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import {
    DESCONTO_MAXIMO,
    calcularConsorcio,
    calcularFinanciamento,
    calcularResumo,
    formatarMoeda,
    limitarDesconto,
    paraNumero
} from 'c/vendasUtils';

const FORMAS_PAGAMENTO = [
    { valor: 'avista', titulo: 'À vista', descricao: 'Pagamento integral', icone: 'utility:moneybag' },
    { valor: 'financiamento', titulo: 'Financiamento', descricao: 'Entrada + parcelas', icone: 'utility:percent' },
    { valor: 'consorcio', titulo: 'Consórcio', descricao: 'Carta de crédito', icone: 'utility:groups' }
];

const PRAZOS = [12, 24, 36, 48, 60];
const ATALHOS_DESCONTO = [0, 2, 5, 10];
const DIAS_VALIDADE = 7;

// Faixas de margem líquida (lucro após desconto e comissão ÷ valor com desconto).
const MARGEM_BOA = 10;
const MARGEM_ATENCAO = 5;

function dataIso(data) {
    const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function formatarData(iso) {
    if (!iso) {
        return '';
    }
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
}

function formatarPercentual(valor) {
    return `${paraNumero(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

export default class PropostaVendas extends LightningElement {
    @api clienteSelecionado;
    @api itensCarrinho = [];
    /** Oferta escolhida na etapa Crédito: pré-preenche financiamento, taxa, prazo e entrada. */
    @api ofertaCredito;
    /** true enquanto o pai grava a venda: trava o botão e evita venda duplicada. */
    @api registrando = false;

    get rotuloFinalizar() {
        return this.registrando ? 'Registrando venda…' : 'Finalizar venda';
    }

    descontoMaximo = DESCONTO_MAXIMO;

    formaPagamento = 'avista';
    percentualDesconto = 0;
    temTroca = false;
    trocaModelo = '';
    trocaAno = '';
    trocaValor = 0;
    entradaPercentual = 20;
    taxaMensal = 1.49;
    taxaAdministracao = 15;
    numeroParcelas = 48;
    validade = dataIso(new Date(Date.now() + DIAS_VALIDADE * 86400000));
    hoje = dataIso(new Date());
    observacoes = '';

    connectedCallback() {
        const oferta = this.ofertaCredito;
        if (oferta) {
            this.formaPagamento = 'financiamento';
            this.taxaMensal = oferta.taxaMensal;
            this.numeroParcelas = oferta.prazo;
            this.entradaPercentual = oferta.entradaPercentual;
        }
    }

    get textoOferta() {
        const oferta = this.ofertaCredito;
        return oferta
            ? `Crédito aprovado no ${oferta.banco}: ${formatarPercentual(oferta.taxaMensal)} a.m. em ${oferta.prazo}x`
            : '';
    }

    get ofertaAlterada() {
        const oferta = this.ofertaCredito;
        return (
            Boolean(oferta) &&
            (!this.isFinanciamento ||
                oferta.taxaMensal !== this.taxaMensal ||
                oferta.prazo !== this.numeroParcelas ||
                oferta.entradaPercentual > this.entradaPercentual)
        );
    }

    // ---------- Dados de entrada ----------

    get temCliente() {
        return Boolean(this.clienteSelecionado);
    }

    get quantidadeVeiculos() {
        return this.itensCarrinho?.length || 0;
    }

    get semCliente() {
        return !this.temCliente;
    }

    get semVeiculos() {
        return this.quantidadeVeiculos === 0;
    }

    get faltaDados() {
        return this.semCliente || this.semVeiculos;
    }

    get inicialCliente() {
        return (this.clienteSelecionado?.Name || '?').charAt(0).toUpperCase();
    }

    get contatoCliente() {
        const { Phone, Website } = this.clienteSelecionado || {};
        return [Phone, Website].filter(Boolean).join(', ') || 'Sem telefone ou site';
    }

    get veiculosExibidos() {
        return (this.itensCarrinho || []).map((veiculo) => ({
            ...veiculo,
            precoFormatado: formatarMoeda(veiculo.preco)
        }));
    }

    // ---------- Forma de pagamento ----------

    get formas() {
        return FORMAS_PAGAMENTO.map((forma) => {
            const ativa = forma.valor === this.formaPagamento;
            return {
                ...forma,
                ativa,
                classe: ativa ? 'forma forma-ativa' : 'forma'
            };
        });
    }

    get isFinanciamento() {
        return this.formaPagamento === 'financiamento';
    }

    get isConsorcio() {
        return this.formaPagamento === 'consorcio';
    }

    get temParcelamento() {
        return this.isFinanciamento || this.isConsorcio;
    }

    // A seção "Condições" só existe com parcelamento; a numeração acompanha.
    get numeroSecaoAjustes() {
        return this.temParcelamento ? 3 : 2;
    }

    get numeroSecaoDetalhes() {
        return this.numeroSecaoAjustes + 1;
    }

    // ---------- Cálculos ----------

    get resumo() {
        return calcularResumo(this.itensCarrinho, this.percentualDesconto);
    }

    get valorTroca() {
        return this.temTroca ? Math.min(paraNumero(this.trocaValor), this.resumo.total) : 0;
    }

    /** O que o cliente paga em dinheiro: veículos − desconto − troca. */
    get valorFinal() {
        return this.resumo.total - this.valorTroca;
    }

    get valorEntrada() {
        return this.isFinanciamento ? (this.valorFinal * this.entradaPercentual) / 100 : 0;
    }

    simular(parcelas) {
        if (this.isConsorcio) {
            return {
                financiado: this.valorFinal,
                ...calcularConsorcio({ valor: this.valorFinal, taxaAdministracao: this.taxaAdministracao, parcelas })
            };
        }
        return calcularFinanciamento({
            valor: this.valorFinal,
            entrada: this.valorEntrada,
            taxaMensal: this.taxaMensal,
            parcelas
        });
    }

    get simulacao() {
        return this.simular(this.numeroParcelas);
    }

    // Cartões de prazo: o vendedor compara as parcelas lado a lado e escolhe com um clique.
    get prazos() {
        return PRAZOS.map((prazo) => {
            const ativo = prazo === this.numeroParcelas;
            return {
                prazo,
                ativo,
                classe: ativo ? 'prazo prazo-ativo' : 'prazo',
                parcelaFormatada: formatarMoeda(this.simular(prazo).parcela)
            };
        });
    }

    get atalhosDesconto() {
        return ATALHOS_DESCONTO.map((valor) => ({
            valor,
            rotulo: `${valor}%`,
            classe: valor === this.percentualDesconto ? 'atalho atalho-ativo' : 'atalho',
            ariaPressed: valor === this.percentualDesconto ? 'true' : 'false'
        }));
    }

    // ---------- Margem (só para quem enxerga o custo de todos os itens) ----------

    get mostrarMargem() {
        return (
            !this.semVeiculos &&
            this.itensCarrinho.every((item) => item.financeiroVisivel && paraNumero(item.custo) > 0)
        );
    }

    get margem() {
        const { total, custo, comissao } = this.resumo;
        const lucro = total - custo - comissao;
        const percentual = total > 0 ? (lucro / total) * 100 : 0;
        let nivel = 'baixa';
        if (percentual >= MARGEM_BOA) {
            nivel = 'boa';
        } else if (percentual >= MARGEM_ATENCAO) {
            nivel = 'atencao';
        }
        return { lucro, percentual, nivel };
    }

    get margemClasse() {
        return `margem margem-${this.margem.nivel}`;
    }

    get margemEstilo() {
        // Escala visual até 30% de margem
        const largura = Math.min(Math.max(this.margem.percentual, 0) / 30, 1) * 100;
        return `width: ${largura}%;`;
    }

    get margemPercentualTexto() {
        return formatarPercentual(this.margem.percentual);
    }

    get margemLucroTexto() {
        return formatarMoeda(this.margem.lucro);
    }

    get margemAlerta() {
        if (this.margem.nivel === 'baixa') {
            return 'Margem baixa: reveja o desconto antes de fechar.';
        }
        return this.margem.nivel === 'atencao' ? 'Margem apertada.' : '';
    }

    // ---------- Textos do resumo ----------

    get subtotalFormatado() {
        return formatarMoeda(this.resumo.subtotal);
    }

    get temDesconto() {
        return this.percentualDesconto > 0;
    }

    get textoDesconto() {
        return formatarPercentual(this.percentualDesconto);
    }

    get valorDescontoFormatado() {
        return formatarMoeda(this.resumo.valorDesconto);
    }

    get temValorTroca() {
        return this.valorTroca > 0;
    }

    get rotuloTroca() {
        const descricao = [this.trocaModelo, this.trocaAno].filter(Boolean).join(' ');
        return descricao ? `Troca (${descricao})` : 'Troca';
    }

    get valorTrocaFormatado() {
        return formatarMoeda(this.valorTroca);
    }

    get valorFinalFormatado() {
        return formatarMoeda(this.valorFinal);
    }

    get entradaFormatada() {
        return formatarMoeda(this.valorEntrada);
    }

    get financiadoFormatado() {
        return formatarMoeda(this.simulacao.financiado);
    }

    get parcelaFormatada() {
        return formatarMoeda(this.simulacao.parcela);
    }

    get totalPagoFormatado() {
        return formatarMoeda(this.simulacao.totalPago);
    }

    get jurosFormatado() {
        return formatarMoeda(this.simulacao.juros);
    }

    get rotuloJuros() {
        return this.isConsorcio ? 'Taxa de administração' : 'Juros no período';
    }

    get textoTaxa() {
        return this.isConsorcio
            ? `taxa adm. ${formatarPercentual(this.taxaAdministracao)}`
            : `${formatarPercentual(this.taxaMensal)} a.m.`;
    }

    get textoAntesParcela() {
        return this.isFinanciamento
            ? `${this.entradaFormatada} de entrada + ${this.numeroParcelas}x de`
            : `${this.numeroParcelas}x de`;
    }

    get textoEntradaPercentual() {
        return formatarPercentual(this.entradaPercentual);
    }

    get validadeFormatada() {
        return formatarData(this.validade);
    }

    get textoProposta() {
        const linhas = ['*Proposta SalesCar*', `Cliente: ${this.clienteSelecionado?.Name || ''}`, '', 'Veículos:'];
        (this.itensCarrinho || []).forEach((v) => {
            const nome = [v.marca, v.modelo, v.ano].filter(Boolean).join(' ');
            linhas.push(`• ${nome}: ${formatarMoeda(v.preco)}`);
        });
        linhas.push('', `Valor dos veículos: ${this.subtotalFormatado}`);
        if (this.temDesconto) {
            linhas.push(`Desconto (${this.textoDesconto}): - ${this.valorDescontoFormatado}`);
        }
        if (this.temValorTroca) {
            linhas.push(`${this.rotuloTroca}: - ${this.valorTrocaFormatado}`);
        }
        linhas.push(`*Valor final: ${this.valorFinalFormatado}*`);
        if (this.isFinanciamento) {
            linhas.push(
                `Financiamento: entrada de ${this.entradaFormatada} + ${this.numeroParcelas}x de ${this.parcelaFormatada} (${this.textoTaxa})`
            );
        } else if (this.isConsorcio) {
            linhas.push(`Consórcio: ${this.numeroParcelas}x de ${this.parcelaFormatada} (${this.textoTaxa})`);
        } else {
            linhas.push('Pagamento à vista');
        }
        linhas.push(`Válida até ${this.validadeFormatada}`);
        if (this.observacoes) {
            linhas.push('', `Obs.: ${this.observacoes}`);
        }
        return linhas.join('\n');
    }

    // wa.me exige DDI; telefone brasileiro de 10–11 dígitos ganha o 55.
    get linkWhatsapp() {
        const digitos = (this.clienteSelecionado?.Phone || '').replace(/\D/g, '');
        let numero = '';
        if (digitos.length === 10 || digitos.length === 11) {
            numero = `55${digitos}`;
        } else if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
            numero = digitos;
        }
        return `https://wa.me/${numero}?text=${encodeURIComponent(this.textoProposta)}`;
    }

    // ---------- Handlers ----------

    handleFormaPagamento(event) {
        this.formaPagamento = event.target.value;
    }

    handlePrazo(event) {
        this.numeroParcelas = Number(event.target.value);
    }

    handleDesconto(event) {
        this.percentualDesconto = limitarDesconto(event.target.value);
    }

    handleAtalhoDesconto(event) {
        this.percentualDesconto = Number(event.currentTarget.dataset.valor);
    }

    handleTroca(event) {
        this.temTroca = event.target.checked;
    }

    handleCampo(event) {
        const { campo } = event.target.dataset;
        const { type, value } = event.target;
        this[campo] = type === 'number' || type === 'range' ? paraNumero(value) : value;
    }

    async handleCopiar() {
        try {
            await navigator.clipboard.writeText(this.textoProposta);
            this.avisar('Resumo copiado', 'Cole na conversa com o cliente.', 'success');
        } catch (e) {
            this.avisar('Não foi possível copiar', 'O navegador bloqueou a área de transferência.', 'warning');
        }
    }

    handleCancelar() {
        this.dispatchEvent(new CustomEvent('cancelar'));
    }

    handleFinalizarVenda() {
        if (this.registrando) {
            return;
        }
        const campos = [...this.template.querySelectorAll('lightning-input, lightning-textarea')];
        const valido = campos.reduce((ok, campo) => campo.reportValidity() && ok, true);
        if (!valido || this.faltaDados) {
            return;
        }

        const { subtotal, valorDesconto } = this.resumo;
        this.dispatchEvent(
            new CustomEvent('finalizarvenda', {
                detail: {
                    cliente: { ...this.clienteSelecionado },
                    veiculos: this.itensCarrinho.map((veiculo) => ({ ...veiculo })),
                    formaPagamento: this.formaPagamento,
                    percentualDesconto: this.percentualDesconto,
                    valorDesconto,
                    subtotal,
                    troca: this.temTroca
                        ? { modelo: this.trocaModelo, ano: this.trocaAno, valor: this.valorTroca }
                        : null,
                    totalFinal: this.valorFinal,
                    entrada: this.isFinanciamento ? this.valorEntrada : null,
                    taxaMensal: this.isFinanciamento ? this.taxaMensal : null,
                    taxaAdministracao: this.isConsorcio ? this.taxaAdministracao : null,
                    numeroParcelas: this.temParcelamento ? this.numeroParcelas : null,
                    valorParcela: this.temParcelamento ? this.simulacao.parcela : null,
                    validade: this.validade,
                    observacoes: this.observacoes,
                    textoProposta: this.textoProposta
                }
            })
        );
    }

    avisar(titulo, mensagem, variante) {
        this.dispatchEvent(new ShowToastEvent({ title: titulo, message: mensagem, variant: variante }));
    }
}
