import {
    calcularConsorcio,
    calcularFinanciamento,
    calcularParcela,
    calcularResumo,
    formatarMoeda,
    limitarDesconto,
    normalizarTexto,
    reduzirErros
} from 'c/vendasUtils';

const ITENS = [
    { Id: 'a', preco: 100000, custo: 80000, comissao: 2 },
    { Id: 'b', preco: '50000', custo: null, comissao: undefined }
];

describe('c-vendas-utils', () => {
    it('calcula subtotal, comissão, desconto e total', () => {
        const resumo = calcularResumo(ITENS, 10);

        expect(resumo.quantidade).toBe(2);
        expect(resumo.subtotal).toBe(150000);
        expect(resumo.custo).toBe(80000);
        expect(resumo.comissao).toBe(2000);
        expect(resumo.liquidoAposComissao).toBe(148000);
        expect(resumo.valorDesconto).toBe(15000);
        expect(resumo.total).toBe(135000);
    });

    it('trata lista ausente como carrinho vazio', () => {
        expect(calcularResumo(undefined).total).toBe(0);
        expect(calcularResumo(null, 5).quantidade).toBe(0);
    });

    it('limita o desconto entre 0 e 30%', () => {
        expect(limitarDesconto(-5)).toBe(0);
        expect(limitarDesconto('abc')).toBe(0);
        expect(limitarDesconto(12.5)).toBe(12.5);
        expect(limitarDesconto(45)).toBe(30);
        expect(calcularResumo(ITENS, 90).valorDesconto).toBe(45000);
    });

    it('calcula parcela e protege contra divisão por zero', () => {
        expect(calcularParcela(120000, '12')).toBe(10000);
        expect(calcularParcela(120000, '0')).toBe(0);
    });

    it('formata moeda em real', () => {
        expect(formatarMoeda(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
        expect(formatarMoeda(undefined).replace(/\s/g, ' ')).toBe('R$ 0,00');
    });

    it('normaliza texto para busca sem acento', () => {
        expect(normalizarTexto('Citroën ÁGUIA')).toBe('citroen aguia');
        expect(normalizarTexto(null)).toBe('');
    });

    it('extrai mensagens de erro do Apex', () => {
        expect(reduzirErros({ body: { message: 'Falhou' } })).toBe('Falhou');
        expect(reduzirErros([{ body: [{ message: 'A' }, { message: 'B' }] }])).toBe('A, B');
        expect(reduzirErros(new Error('JS'))).toBe('JS');
    });

    it('financia pela tabela Price', () => {
        // 100 mil, 20 mil de entrada, 1% a.m., 48x → parcela de referência 2.106,71
        const r = calcularFinanciamento({ valor: 100000, entrada: 20000, taxaMensal: 1, parcelas: 48 });
        expect(r.financiado).toBe(80000);
        expect(r.parcela).toBeCloseTo(2106.71, 2);
        expect(r.juros).toBeCloseTo(2106.71 * 48 - 80000, 0);
        expect(r.totalPago).toBeCloseTo(20000 + 2106.71 * 48, 0);
    });

    it('financia sem juros quando a taxa é zero e nunca financia valor negativo', () => {
        expect(calcularFinanciamento({ valor: 1200, taxaMensal: 0, parcelas: 12 }).parcela).toBe(100);
        expect(calcularFinanciamento({ valor: 1000, entrada: 5000, taxaMensal: 1, parcelas: 12 }).financiado).toBe(0);
    });

    it('calcula consórcio com taxa de administração', () => {
        const r = calcularConsorcio({ valor: 100000, taxaAdministracao: 15, parcelas: 50 });
        expect(r.totalPago).toBeCloseTo(115000, 6);
        expect(r.parcela).toBeCloseTo(2300, 6);
    });
});
