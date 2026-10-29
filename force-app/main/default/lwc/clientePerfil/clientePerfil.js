import { LightningElement, api, wire } from 'lwc';
import getClientes from '@salesforce/apex/VeiculoController.getClientes';
import getPerfil from '@salesforce/apex/ClienteVendasController.getPerfil';
import { formatarMoeda, formatarMoedaCompacta, reduzirErros } from 'c/vendasUtils';

const ATRASO_BUSCA_MS = 300;

const CLASSE_CLASSIFICACAO = {
    Hot: 'chip-classificacao chip-quente',
    Warm: 'chip-classificacao chip-morno',
    Cold: 'chip-classificacao chip-frio'
};

const ROTULO_CLASSIFICACAO = { Hot: 'Quente', Warm: 'Morno', Cold: 'Frio' };

function formatarData(valor) {
    if (!valor) {
        return '—';
    }
    return new Date(valor).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

// Etapa "Cliente": lista à esquerda, perfil completo à direita.
export default class ClientePerfil extends LightningElement {
    @api clienteSelecionado;

    termoBusca = '';
    termoAplicado = '';
    clientes = [];
    carregandoLista = true;
    erroLista = '';

    idVisualizado;
    perfil;
    carregandoPerfil = false;
    erroPerfil = '';
    timeoutBusca;

    connectedCallback() {
        this.idVisualizado = this.clienteSelecionado?.Id;
    }

    disconnectedCallback() {
        clearTimeout(this.timeoutBusca);
    }

    @wire(getClientes, { termo: '$termoAplicado' })
    wiredClientes({ data, error }) {
        if (data) {
            this.clientes = data;
            this.erroLista = '';
            this.carregandoLista = false;
            if (!this.idVisualizado && data.length) {
                this.visualizar(data[0].Id);
            }
        } else if (error) {
            this.clientes = [];
            this.erroLista = reduzirErros(error) || 'Não foi possível buscar clientes.';
            this.carregandoLista = false;
        }
    }

    @wire(getPerfil, { accountId: '$idVisualizado' })
    wiredPerfil({ data, error }) {
        if (data) {
            this.perfil = data;
            this.erroPerfil = '';
            this.carregandoPerfil = false;
        } else if (error) {
            this.perfil = undefined;
            this.erroPerfil = reduzirErros(error) || 'Não foi possível carregar o perfil.';
            this.carregandoPerfil = false;
        }
    }

    visualizar(id) {
        if (id && id !== this.idVisualizado) {
            this.carregandoPerfil = true;
            this.idVisualizado = id;
        }
    }

    // ---------- Lista ----------

    get listaExibida() {
        return this.clientes.map((cliente) => {
            const visualizado = cliente.Id === this.idVisualizado;
            const escolhido = cliente.Id === this.clienteSelecionado?.Id;
            let classe = 'item';
            if (visualizado) {
                classe += ' item-visualizado';
            }
            return {
                ...cliente,
                classe,
                escolhido,
                inicial: (cliente.Name || '?').charAt(0).toUpperCase(),
                detalhe: [cliente.Industry, cliente.Phone].filter(Boolean).join(', ') || 'Sem dados de contato',
                ariaCurrent: visualizado ? 'true' : null
            };
        });
    }

    get temClientes() {
        return this.clientes.length > 0;
    }

    // ---------- Perfil ----------

    get temPerfil() {
        return Boolean(this.perfil) && !this.carregandoPerfil;
    }

    get inicialPerfil() {
        return (this.perfil?.nome || '?').charAt(0).toUpperCase();
    }

    get perfilEscolhido() {
        return Boolean(this.perfil) && this.perfil.id === this.clienteSelecionado?.Id;
    }

    get rotuloBotaoEscolher() {
        return this.perfilEscolhido ? 'Cliente desta negociação' : 'Escolher para a negociação';
    }

    get classeBotaoEscolher() {
        return this.perfilEscolhido ? 'sc-btn btn-escolhido' : 'sc-btn sc-btn-principal';
    }

    get etiquetas() {
        const p = this.perfil || {};
        const lista = [];
        if (p.segmento) {
            lista.push({ chave: 'segmento', texto: p.segmento, classe: 'chip-info' });
        }
        if (p.tipo) {
            lista.push({ chave: 'tipo', texto: p.tipo, classe: 'chip-info' });
        }
        if (p.classificacao) {
            lista.push({
                chave: 'classificacao',
                texto: `Lead ${ROTULO_CLASSIFICACAO[p.classificacao] || p.classificacao}`,
                classe: CLASSE_CLASSIFICACAO[p.classificacao] || 'chip-info'
            });
        }
        return lista;
    }

    get clienteDesde() {
        return this.perfil?.clienteDesde
            ? new Date(this.perfil.clienteDesde).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
            : '—';
    }

    get indicadores() {
        const p = this.perfil || {};
        return [
            { chave: 'compras', rotulo: 'Compras', valor: String(p.comprasQuantidade || 0) },
            { chave: 'total', rotulo: 'Total comprado', valor: formatarMoedaCompacta(p.comprasTotal) },
            { chave: 'ultima', rotulo: 'Última compra', valor: formatarData(p.ultimaCompra) },
            { chave: 'abertas', rotulo: 'Negociações abertas', valor: String(p.negociacoesAbertas || 0) }
        ];
    }

    get dadosCadastrais() {
        const p = this.perfil || {};
        return [
            { chave: 'tel', rotulo: 'Telefone', valor: p.telefone, icone: 'utility:call' },
            { chave: 'site', rotulo: 'Site', valor: p.site, icone: 'utility:world' },
            { chave: 'end', rotulo: 'Endereço', valor: p.endereco, icone: 'utility:location' },
            {
                chave: 'func',
                rotulo: 'Funcionários',
                valor: p.funcionarios ? p.funcionarios.toLocaleString('pt-BR') : null,
                icone: 'utility:groups'
            },
            {
                chave: 'receita',
                rotulo: 'Receita anual',
                valor: p.receitaAnual ? formatarMoedaCompacta(p.receitaAnual) : null,
                icone: 'utility:moneybag'
            },
            { chave: 'resp', rotulo: 'Responsável', valor: p.responsavel, icone: 'utility:user' }
        ].map((item) => ({
            ...item,
            valor: item.valor || 'Não informado',
            classe: item.valor ? 'dado-valor' : 'dado-valor dado-vazio'
        }));
    }

    get contatos() {
        return (this.perfil?.contatos || []).map((c) => ({
            ...c,
            inicial: (c.nome || '?').charAt(0).toUpperCase(),
            linkEmail: c.email ? `mailto:${c.email}` : null,
            cargoTexto: c.cargo || 'Contato'
        }));
    }

    get temContatos() {
        return this.contatos.length > 0;
    }

    get historico() {
        return (this.perfil?.oportunidades || []).map((o) => {
            let situacao = 'Em aberto';
            let classe = 'marco marco-aberto';
            if (o.ganha) {
                situacao = 'Ganha';
                classe = 'marco marco-ganho';
            } else if (o.fechada) {
                situacao = 'Perdida';
                classe = 'marco marco-perdido';
            }
            return {
                ...o,
                situacao,
                classe,
                valorTexto: o.valor ? formatarMoeda(o.valor) : '—',
                dataTexto: formatarData(o.fechamento)
            };
        });
    }

    get temHistorico() {
        return this.historico.length > 0;
    }

    // ---------- Handlers ----------

    handleBusca(event) {
        this.termoBusca = event.target.value;
        clearTimeout(this.timeoutBusca);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.timeoutBusca = setTimeout(() => {
            const termo = this.termoBusca.trim();
            if (termo !== this.termoAplicado) {
                this.carregandoLista = true;
                this.termoAplicado = termo;
            }
        }, ATRASO_BUSCA_MS);
    }

    handleVisualizar(event) {
        this.visualizar(event.currentTarget.dataset.id);
    }

    handleEscolher() {
        if (!this.perfil || this.perfilEscolhido) {
            return;
        }
        const { id, nome, telefone, site, segmento } = this.perfil;
        this.dispatchEvent(
            new CustomEvent('selecionarcliente', {
                detail: { Id: id, Name: nome, Phone: telefone, Website: site, Industry: segmento }
            })
        );
    }
}
