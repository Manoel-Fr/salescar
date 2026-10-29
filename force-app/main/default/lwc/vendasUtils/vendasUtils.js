// Regras de cálculo e formatação compartilhadas pelo fluxo de Força de Vendas.
// Funções puras: fáceis de testar e sem dependência de DOM ou Apex.

export const DESCONTO_MAXIMO = 30;

const formatadorMoeda = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
});

const formatadorNumero = new Intl.NumberFormat('pt-BR');

const formatadorMoedaCompacta = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 2
});

export function paraNumero(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
}

export function formatarMoeda(valor) {
    return formatadorMoeda.format(paraNumero(valor));
}

// "R$ 1,46 mi" — para indicadores, onde o valor exato não importa.
export function formatarMoedaCompacta(valor) {
    return formatadorMoedaCompacta.format(paraNumero(valor));
}

export function formatarQuilometragem(valor) {
    return `${formatadorNumero.format(paraNumero(valor))} km`;
}

export function limitarDesconto(percentual) {
    return Math.min(Math.max(paraNumero(percentual), 0), DESCONTO_MAXIMO);
}

export function calcularResumo(itens, percentualDesconto = 0) {
    const lista = Array.isArray(itens) ? itens : [];
    const desconto = limitarDesconto(percentualDesconto);

    const subtotal = lista.reduce((soma, item) => soma + paraNumero(item.preco), 0);
    const custo = lista.reduce((soma, item) => soma + paraNumero(item.custo), 0);
    const comissao = lista.reduce(
        (soma, item) => soma + paraNumero(item.preco) * (paraNumero(item.comissao) / 100),
        0
    );
    const valorDesconto = (subtotal * desconto) / 100;

    return {
        quantidade: lista.length,
        subtotal,
        custo,
        comissao,
        liquidoAposComissao: subtotal - comissao,
        valorDesconto,
        total: subtotal - valorDesconto
    };
}

export function calcularParcela(total, parcelas) {
    const quantidade = parseInt(parcelas, 10);
    return quantidade > 0 ? paraNumero(total) / quantidade : 0;
}

/**
 * Financiamento pela tabela Price (parcelas fixas).
 * taxaMensal em % ao mês (ex.: 1.49). Taxa zero vira divisão simples.
 */
export function calcularFinanciamento({ valor, entrada = 0, taxaMensal = 0, parcelas }) {
    const quantidade = parseInt(parcelas, 10) || 0;
    const financiado = Math.max(paraNumero(valor) - paraNumero(entrada), 0);
    const taxa = paraNumero(taxaMensal) / 100;

    let parcela = 0;
    if (quantidade > 0 && financiado > 0) {
        parcela = taxa > 0 ? (financiado * taxa) / (1 - Math.pow(1 + taxa, -quantidade)) : financiado / quantidade;
    }
    const totalParcelas = parcela * quantidade;

    return {
        financiado,
        parcela,
        totalPago: paraNumero(entrada) + totalParcelas,
        juros: Math.max(totalParcelas - financiado, 0)
    };
}

/** Consórcio: carta de crédito + taxa de administração total (%), sem juros. */
export function calcularConsorcio({ valor, taxaAdministracao = 0, parcelas }) {
    const quantidade = parseInt(parcelas, 10) || 0;
    const totalPago = paraNumero(valor) * (1 + paraNumero(taxaAdministracao) / 100);
    return {
        parcela: quantidade > 0 ? totalPago / quantidade : 0,
        totalPago,
        juros: totalPago - paraNumero(valor)
    };
}

export function normalizarTexto(valor) {
    return (valor || '')
        .toString()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
}

export function reduzirErros(erros) {
    const lista = Array.isArray(erros) ? erros : [erros];
    return lista
        .filter(Boolean)
        .flatMap((erro) => {
            if (Array.isArray(erro.body)) {
                return erro.body.map((item) => item.message);
            }
            if (erro.body?.pageErrors?.length) {
                return erro.body.pageErrors.map((item) => item.message);
            }
            if (typeof erro.body?.message === 'string') {
                return [erro.body.message];
            }
            return typeof erro.message === 'string' ? [erro.message] : [];
        })
        .filter(Boolean)
        .join(', ');
}
