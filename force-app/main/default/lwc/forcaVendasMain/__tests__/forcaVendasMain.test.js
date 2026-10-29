import { createElement } from 'lwc';
import ForcaVendasMain from 'c/forcaVendasMain';
import { navegar } from 'lightning/navigation';
import fecharVenda from '@salesforce/apex/VendaController.fecharVenda';

jest.mock('@salesforce/apex/VendaController.fecharVenda', () => ({ default: jest.fn() }), { virtual: true });

// Stub próprio: a versão instalada do sfdx-lwc-jest não expõe getNavigateCalledWith
jest.mock('lightning/navigation', () => {
    const Navigate = Symbol('Navigate');
    const navegar = jest.fn();
    const NavigationMixin = (Base) =>
        class extends Base {
            [Navigate](pageReference) {
                navegar(pageReference);
            }
        };
    NavigationMixin.Navigate = Navigate;
    return { NavigationMixin, navegar };
});

const VEICULO = { Id: 'v1', marca: 'Toyota', modelo: 'Corolla', preco: 150000, comissao: 2 };
const CLIENTE = { Id: 'c1', Name: 'Auto Center Brasil' };
const CHAVE = 'forcaVendas:negociacao';

function montar() {
    const element = createElement('c-forca-vendas-main', { is: ForcaVendasMain });
    document.body.appendChild(element);
    return element;
}

const botaoEtapa = (element, etapa) => element.shadowRoot.querySelector(`[data-etapa="${etapa}"]`);

describe('c-forca-vendas-main', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        window.sessionStorage.clear();
    });

    it('abre com estoque e painel de negociação lado a lado, proposta bloqueada', () => {
        const element = montar();

        expect(element.shadowRoot.querySelector('c-estoque-veiculos')).not.toBeNull();
        expect(element.shadowRoot.querySelector('c-clientes-vendas')).not.toBeNull();
        expect(element.shadowRoot.querySelector('c-carrinho-vendas')).not.toBeNull();
        expect(botaoEtapa(element, 'proposta').disabled).toBe(true);
    });

    it('adiciona veículo sem duplicar e repassa os ids para o estoque e o painel', async () => {
        const element = montar();
        const estoque = element.shadowRoot.querySelector('c-estoque-veiculos');

        estoque.dispatchEvent(new CustomEvent('addcarrinho', { detail: VEICULO }));
        estoque.dispatchEvent(new CustomEvent('addcarrinho', { detail: VEICULO }));
        await Promise.resolve();

        expect(estoque.idsNoCarrinho).toEqual(['v1']);
        expect(element.shadowRoot.querySelector('c-carrinho-vendas').itensCarrinho).toHaveLength(1);
    });

    it('libera as etapas com cliente e veículo sem guardar nada no navegador', async () => {
        const element = montar();
        element.shadowRoot
            .querySelector('c-estoque-veiculos')
            .dispatchEvent(new CustomEvent('addcarrinho', { detail: VEICULO }));
        element.shadowRoot
            .querySelector('c-clientes-vendas')
            .dispatchEvent(new CustomEvent('selecionarcliente', { detail: CLIENTE }));
        await Promise.resolve();

        expect(botaoEtapa(element, 'proposta').disabled).toBe(false);
        expect(window.sessionStorage.getItem(CHAVE)).toBeNull();

        // "Continuar" do painel leva à etapa Cliente; o rodapé leva ao Crédito
        element.shadowRoot.querySelector('c-carrinho-vendas').dispatchEvent(new CustomEvent('finalizar'));
        await Promise.resolve();
        expect(element.shadowRoot.querySelector('c-cliente-perfil')).not.toBeNull();

        botaoEtapa(element, 'credito').click();
        await Promise.resolve();
        expect(element.shadowRoot.querySelector('c-credito-vendas').valorBem).toBe(150000);
    });

    it('ignora e apaga a negociação guardada pela versão antiga', () => {
        window.sessionStorage.setItem(CHAVE, JSON.stringify({ itensCarrinho: [VEICULO], clienteSelecionado: CLIENTE }));
        const element = montar();

        expect(element.shadowRoot.querySelector('c-carrinho-vendas').itensCarrinho).toHaveLength(0);
        expect(window.sessionStorage.getItem(CHAVE)).toBeNull();
        expect(element.shadowRoot.querySelector('.nova-negociacao')).toBeNull();
    });

    it('"Nova negociação" zera carros, cliente e volta para a primeira etapa', async () => {
        const element = montar();
        element.shadowRoot
            .querySelector('c-estoque-veiculos')
            .dispatchEvent(new CustomEvent('addcarrinho', { detail: VEICULO }));
        element.shadowRoot
            .querySelector('c-clientes-vendas')
            .dispatchEvent(new CustomEvent('selecionarcliente', { detail: CLIENTE }));
        await Promise.resolve();
        botaoEtapa(element, 'cliente').click();
        await Promise.resolve();

        element.shadowRoot.querySelector('.nova-negociacao').click();
        await Promise.resolve();

        expect(element.shadowRoot.querySelector('c-estoque-veiculos')).not.toBeNull();
        expect(element.shadowRoot.querySelector('c-carrinho-vendas').itensCarrinho).toHaveLength(0);
        expect(element.shadowRoot.querySelector('c-clientes-vendas').clienteSelecionado).toBeNull();
    });

    it('finaliza a venda no servidor e abre a Opportunity criada', async () => {
        fecharVenda.mockResolvedValue('006000000000001AAA');
        const element = montar();
        element.shadowRoot
            .querySelector('c-estoque-veiculos')
            .dispatchEvent(new CustomEvent('addcarrinho', { detail: VEICULO }));
        element.shadowRoot
            .querySelector('c-clientes-vendas')
            .dispatchEvent(new CustomEvent('selecionarcliente', { detail: CLIENTE }));
        await Promise.resolve();
        botaoEtapa(element, 'proposta').click();
        await Promise.resolve();

        element.shadowRoot.querySelector('c-proposta-vendas').dispatchEvent(
            new CustomEvent('finalizarvenda', {
                detail: {
                    cliente: CLIENTE,
                    veiculos: [VEICULO],
                    percentualDesconto: 5,
                    formaPagamento: 'avista',
                    totalFinal: 142500,
                    textoProposta: 'Proposta'
                }
            })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));

        const enviado = JSON.parse(fecharVenda.mock.calls[0][0].dados);
        expect(enviado).toMatchObject({ clienteId: 'c1', veiculoIds: ['v1'], percentualDesconto: 5 });
        expect(navegar.mock.calls[0][0].attributes).toMatchObject({
            recordId: '006000000000001AAA',
            objectApiName: 'Opportunity'
        });
        expect(element.shadowRoot.querySelector('c-estoque-veiculos')).not.toBeNull();
    });
});
