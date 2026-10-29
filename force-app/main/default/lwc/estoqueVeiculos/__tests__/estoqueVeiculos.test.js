import { createElement } from 'lwc';
import EstoqueVeiculos from 'c/estoqueVeiculos';
import getVeiculos from '@salesforce/apex/VeiculoController.getVeiculos';

jest.mock(
    '@salesforce/apex/VeiculoController.getVeiculos',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

const VEICULOS = [
    { Id: 'v1', marca: 'Toyota', modelo: 'Corolla', ano: '2022', preco: 150000, status: 'Disponível' },
    { Id: 'v2', marca: 'Citroën', modelo: 'C3', ano: '2020', preco: 70000, status: 'Reservado' }
];

function montar(props = {}) {
    const element = createElement('c-estoque-veiculos', { is: EstoqueVeiculos });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}

describe('c-estoque-veiculos', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.useRealTimers();
    });

    it('lista veículos, deriva filtros e bloqueia o que já está no carrinho', async () => {
        const element = montar({ idsNoCarrinho: ['v1'] });
        getVeiculos.emit(VEICULOS);
        await Promise.resolve();

        const botoes = element.shadowRoot.querySelectorAll('.btn-carrinho');
        expect(botoes).toHaveLength(2);
        expect(botoes[0].disabled).toBe(true);
        expect(botoes[1].disabled).toBe(false);

        const chips = [...element.shadowRoot.querySelectorAll('.chip')];
        expect(chips.map((chip) => chip.dataset.valor)).toEqual(['', 'Citroën', 'Toyota']);
    });

    it('busca sem acento com debounce', async () => {
        jest.useFakeTimers();
        const element = montar();
        getVeiculos.emit(VEICULOS);
        await Promise.resolve();

        const busca = element.shadowRoot.querySelector('lightning-input');
        busca.value = 'citroen';
        busca.dispatchEvent(new CustomEvent('change'));
        jest.advanceTimersByTime(300);
        await Promise.resolve();

        expect(element.shadowRoot.querySelectorAll('.btn-carrinho')).toHaveLength(1);
    });

    it('envia o veículo sem campos de apresentação ao adicionar', async () => {
        const element = montar();
        const handler = jest.fn();
        element.addEventListener('addcarrinho', handler);
        getVeiculos.emit(VEICULOS);
        await Promise.resolve();

        element.shadowRoot.querySelector('.btn-carrinho').click();

        const enviado = handler.mock.calls[0][0].detail;
        expect(enviado.Id).toBe('v1');
        expect(enviado.textoBusca).toBeUndefined();
        expect(enviado.classeTag).toBeUndefined();
    });

    it('mostra erro amigável quando o Apex falha', async () => {
        const element = montar();
        getVeiculos.error({ message: 'Sem acesso ao estoque' });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector('.sc-erro').textContent).toContain('Sem acesso ao estoque');
    });
});
