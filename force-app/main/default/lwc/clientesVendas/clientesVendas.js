import { LightningElement, api, wire } from 'lwc';
import getClientes from '@salesforce/apex/VeiculoController.getClientes';
import { reduzirErros } from 'c/vendasUtils';

const ATRASO_BUSCA_MS = 300;
const MINIMO_CARACTERES = 2;
const MAXIMO_RESULTADOS = 6;

// Seletor de cliente compacto, usado dentro do painel de negociação.
export default class ClientesVendas extends LightningElement {
    @api clienteSelecionado;

    termoBusca = '';
    // undefined = não busca: o @wire só chama o Apex quando há termo.
    termoAplicado;
    isLoading = false;
    erroMensagem = '';
    clientes = [];
    timeoutBusca;

    @wire(getClientes, { termo: '$termoAplicado' })
    wiredClientes({ data, error }) {
        if (data) {
            this.clientes = data;
            this.erroMensagem = '';
            this.isLoading = false;
        } else if (error) {
            this.clientes = [];
            this.erroMensagem = reduzirErros(error) || 'Não foi possível buscar clientes.';
            this.isLoading = false;
        }
    }

    disconnectedCallback() {
        clearTimeout(this.timeoutBusca);
    }

    get temSelecionado() {
        return Boolean(this.clienteSelecionado);
    }

    get inicialSelecionado() {
        return (this.clienteSelecionado?.Name || '?').charAt(0).toUpperCase();
    }

    get contatoSelecionado() {
        const { Phone, Website } = this.clienteSelecionado || {};
        return [Phone, Website].filter(Boolean).join(', ') || 'Sem telefone ou site';
    }

    get buscou() {
        return Boolean(this.termoAplicado);
    }

    get resultados() {
        return this.clientes.slice(0, MAXIMO_RESULTADOS).map((cliente) => ({
            ...cliente,
            inicial: (cliente.Name || '?').charAt(0).toUpperCase(),
            contato: [cliente.Phone, cliente.Industry].filter(Boolean).join(', ') || 'Sem telefone',
            textoAcao: `Escolher ${cliente.Name}`
        }));
    }

    get temResultados() {
        return this.buscou && this.clientes.length > 0;
    }

    get semResultados() {
        return this.buscou && !this.isLoading && !this.erroMensagem && this.clientes.length === 0;
    }

    handleBusca(event) {
        this.termoBusca = event.target.value;
        clearTimeout(this.timeoutBusca);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.timeoutBusca = setTimeout(() => {
            const termo = this.termoBusca.trim();
            const proximo = termo.length >= MINIMO_CARACTERES ? termo : undefined;
            if (proximo !== this.termoAplicado) {
                this.isLoading = Boolean(proximo);
                this.termoAplicado = proximo;
            }
        }, ATRASO_BUSCA_MS);
    }

    handleSelecionarCliente(event) {
        const cliente = this.clientes.find((item) => item.Id === event.currentTarget.dataset.id);
        if (!cliente) {
            return;
        }
        this.termoBusca = '';
        this.termoAplicado = undefined;
        this.dispatchEvent(new CustomEvent('selecionarcliente', { detail: { ...cliente } }));
    }

    handleTrocarCliente() {
        this.dispatchEvent(new CustomEvent('removercliente'));
    }
}
