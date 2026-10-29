import { LightningElement, api } from 'lwc';
import { calcularFinanciamento, formatarMoeda, paraNumero } from 'c/vendasUtils';

/*
 * Etapa "Crédito": SIMULAÇÃO com dados fictícios. Nenhum banco real é consultado.
 * Os resultados são determinísticos (mesmo cliente + mesmas condições = mesma resposta),
 * para a demonstração se comportar igual toda vez.
 */

const BANCOS = [
    { id: 'atlas', nome: 'Atlas Bank', sigla: 'AB', cor: '#16a34a', taxaBase: 1.19, scoreMinimo: 760, entradaMinima: 30 },
    { id: 'aurora', nome: 'Banco Aurora', sigla: 'AU', cor: '#7c3aed', taxaBase: 1.29, scoreMinimo: 650, entradaMinima: 20 },
    { id: 'horizonte', nome: 'Horizonte Financeira', sigla: 'HF', cor: '#0284c7', taxaBase: 1.45, scoreMinimo: 550, entradaMinima: 15 },
    { id: 'rota', nome: 'Rota Crédito', sigla: 'RC', cor: '#ea580c', taxaBase: 1.69, scoreMinimo: 450, entradaMinima: 10 },
    { id: 'pioneira', nome: 'Pioneira Auto', sigla: 'PA', cor: '#e11d48', taxaBase: 1.89, scoreMinimo: 350, entradaMinima: 0 }
];

const PRAZOS = [12, 24, 36, 48, 60];
const COMPROMETIMENTO_MAXIMO = 30; // % da renda que a parcela pode ocupar
const TEMPO_POR_BANCO_MS = 650;

const FAIXAS_SCORE = [
    { minimo: 800, rotulo: 'Excelente', cor: '#16a34a' },
    { minimo: 650, rotulo: 'Bom', cor: '#22c55e' },
    { minimo: 500, rotulo: 'Regular', cor: '#f59e0b' },
    { minimo: 0, rotulo: 'Baixo', cor: '#ef4444' }
];

// Hash simples e estável (djb2) para gerar números "aleatórios" reprodutíveis.
function hash(texto) {
    let h = 5381;
    for (let i = 0; i < texto.length; i++) {
        h = (h * 33) ^ texto.charCodeAt(i);
    }
    return Math.abs(h);
}

function formatarTaxa(valor) {
    return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export default class CreditoVendas extends LightningElement {
    @api valorBem = 0;
    @api cliente;
    @api ofertaEscolhida;

    entradaPercentual = 20;
    prazo = 48;
    renda = null;
    fase = 'formulario'; // formulario | consultando | resultado
    respostas = {};
    temporizadores = [];

    connectedCallback() {
        if (this.ofertaEscolhida) {
            this.entradaPercentual = this.ofertaEscolhida.entradaPercentual;
            this.prazo = this.ofertaEscolhida.prazo;
        }
    }

    disconnectedCallback() {
        this.limparTemporizadores();
    }

    // ---------- Score simulado ----------

    get score() {
        const base = hash(this.cliente?.Id || this.cliente?.Name || 'cliente');
        return 380 + (base % 560); // 380–939
    }

    get faixaScore() {
        return FAIXAS_SCORE.find((faixa) => this.score >= faixa.minimo);
    }

    get estiloMedidor() {
        const proporcao = (this.score - 300) / 650;
        return `--cor-medidor: ${this.faixaScore.cor}; --proporcao: ${Math.round(proporcao * 100)}%;`;
    }

    // ---------- Condições ----------

    get valorBemFormatado() {
        return formatarMoeda(this.valorBem);
    }

    get valorEntrada() {
        return (paraNumero(this.valorBem) * this.entradaPercentual) / 100;
    }

    get textoEntrada() {
        return `${this.entradaPercentual}% · ${formatarMoeda(this.valorEntrada)}`;
    }

    get prazos() {
        return PRAZOS.map((prazo) => ({
            prazo,
            rotulo: `${prazo}x`,
            classe: prazo === this.prazo ? 'chip chip-ativo' : 'chip',
            ariaPressed: prazo === this.prazo ? 'true' : 'false'
        }));
    }

    get consultando() {
        return this.fase === 'consultando';
    }

    get temResultado() {
        return this.fase !== 'formulario';
    }

    get rotuloConsultar() {
        return this.fase === 'resultado' ? 'Consultar de novo' : `Consultar ${BANCOS.length} bancos`;
    }

    get progresso() {
        const respondidos = Object.keys(this.respostas).length;
        return { respondidos, total: BANCOS.length };
    }

    get estiloProgresso() {
        return `width: ${(this.progresso.respondidos / this.progresso.total) * 100}%;`;
    }

    get textoProgresso() {
        return this.consultando
            ? `Consultando bancos… ${this.progresso.respondidos} de ${this.progresso.total}`
            : `${this.quantidadeAprovadas} de ${this.progresso.total} bancos aprovaram`;
    }

    // ---------- Política simulada de cada banco ----------

    avaliar(banco) {
        const semente = hash(`${banco.id}|${this.cliente?.Id || ''}`);
        const score = this.score;
        let entrada = this.entradaPercentual;
        let condicao = '';

        if (score < banco.scoreMinimo - 80) {
            return { status: 'recusado', motivo: 'Score abaixo da política do banco' };
        }
        if (score < banco.scoreMinimo) {
            return { status: 'analise', motivo: 'Em análise manual, resposta em até 24h' };
        }
        if (entrada < banco.entradaMinima) {
            entrada = banco.entradaMinima;
            condicao = `Exige entrada mínima de ${banco.entradaMinima}%`;
        }

        // Taxa: base do banco + prazo longo + score + entrada alta + variação própria
        let taxa = banco.taxaBase;
        taxa += ((this.prazo - 24) / 12) * 0.04;
        taxa += score < 700 ? 0.15 : -0.05;
        taxa -= entrada >= 40 ? 0.1 : 0;
        taxa += ((semente % 21) - 10) / 100;
        taxa = Math.max(Math.round(taxa * 100) / 100, 0.89);

        const valorEntrada = (paraNumero(this.valorBem) * entrada) / 100;
        const simulacao = calcularFinanciamento({
            valor: this.valorBem,
            entrada: valorEntrada,
            taxaMensal: taxa,
            parcelas: this.prazo
        });

        const renda = paraNumero(this.renda);
        if (renda > 0) {
            const comprometimento = (simulacao.parcela / renda) * 100;
            if (comprometimento > COMPROMETIMENTO_MAXIMO) {
                return {
                    status: 'recusado',
                    motivo: `Parcela compromete ${Math.round(comprometimento)}% da renda (máx. ${COMPROMETIMENTO_MAXIMO}%)`
                };
            }
        }

        return {
            status: condicao ? 'condicionado' : 'aprovado',
            motivo: condicao,
            taxa,
            entradaPercentual: entrada,
            valorEntrada,
            parcela: simulacao.parcela,
            totalPago: simulacao.totalPago,
            cetAnual: (Math.pow(1 + taxa / 100, 12) - 1) * 100
        };
    }

    get quantidadeAprovadas() {
        return Object.values(this.respostas).filter((r) => r.parcela).length;
    }

    get ofertas() {
        const aprovadas = Object.entries(this.respostas).filter(([, r]) => r.parcela);
        const melhor = aprovadas.reduce(
            (atual, [id, r]) => (!atual || r.parcela < atual.parcela ? { id, parcela: r.parcela } : atual),
            null
        );

        const lista = BANCOS.map((banco) => {
            const resposta = this.respostas[banco.id];
            const pendente = !resposta;
            const aprovada = Boolean(resposta?.parcela);
            const escolhida = this.ofertaEscolhida?.bancoId === banco.id;
            const ehMelhor = melhor?.id === banco.id;

            let classe = 'oferta';
            if (pendente) {
                classe += ' oferta-pendente';
            } else if (!aprovada) {
                classe += ' oferta-negada';
            }
            if (ehMelhor) {
                classe += ' oferta-melhor';
            }
            if (escolhida) {
                classe += ' oferta-escolhida';
            }

            const rotuloStatus = {
                aprovado: 'Aprovado',
                condicionado: 'Aprovado com condição',
                analise: 'Em análise',
                recusado: 'Recusado'
            }[resposta?.status];

            return {
                ...banco,
                pendente,
                aprovada,
                escolhida,
                ehMelhor,
                classe,
                estiloLogo: `background: ${banco.cor};`,
                rotuloStatus,
                classeStatus: `status status-${resposta?.status || 'pendente'}`,
                motivo: resposta?.motivo,
                taxaTexto: aprovada ? `${formatarTaxa(resposta.taxa)} a.m.` : '',
                cetTexto: aprovada ? `CET aprox. ${formatarTaxa(resposta.cetAnual)} a.a.` : '',
                parcelaTexto: aprovada ? formatarMoeda(resposta.parcela) : '',
                entradaTexto: aprovada ? `${resposta.entradaPercentual}% · ${formatarMoeda(resposta.valorEntrada)}` : '',
                totalTexto: aprovada ? formatarMoeda(resposta.totalPago) : '',
                rotuloEscolher: escolhida ? 'Oferta escolhida' : 'Escolher oferta',
                ordem: aprovada ? resposta.parcela : Number.MAX_SAFE_INTEGER
            };
        });

        // Depois da consulta, aprovadas primeiro (menor parcela no topo)
        return this.fase === 'resultado' ? lista.sort((a, b) => a.ordem - b.ordem) : lista;
    }

    // ---------- Handlers ----------

    handleEntrada(event) {
        this.entradaPercentual = paraNumero(event.target.value);
        this.invalidar();
    }

    handlePrazo(event) {
        this.prazo = Number(event.currentTarget.dataset.prazo);
        this.invalidar();
    }

    handleRenda(event) {
        this.renda = event.target.value;
        this.invalidar();
    }

    // Mudou a condição: a resposta anterior deixa de valer.
    invalidar() {
        if (this.fase === 'resultado') {
            this.fase = 'formulario';
            this.respostas = {};
        }
    }

    handleConsultar() {
        this.limparTemporizadores();
        this.respostas = {};
        this.fase = 'consultando';

        BANCOS.forEach((banco, indice) => {
            const atraso = TEMPO_POR_BANCO_MS * (indice + 1) + (hash(banco.id) % 400);
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            const temporizador = setTimeout(() => {
                this.respostas = { ...this.respostas, [banco.id]: this.avaliar(banco) };
                if (Object.keys(this.respostas).length === BANCOS.length) {
                    this.fase = 'resultado';
                }
            }, atraso);
            this.temporizadores.push(temporizador);
        });
    }

    handleEscolher(event) {
        const bancoId = event.currentTarget.dataset.id;
        const banco = BANCOS.find((b) => b.id === bancoId);
        const resposta = this.respostas[bancoId];
        if (!banco || !resposta?.parcela) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('ofertaselecionada', {
                detail: {
                    bancoId,
                    banco: banco.nome,
                    taxaMensal: resposta.taxa,
                    prazo: this.prazo,
                    entradaPercentual: resposta.entradaPercentual,
                    parcela: resposta.parcela
                }
            })
        );
    }

    handlePular() {
        this.dispatchEvent(new CustomEvent('pular'));
    }

    limparTemporizadores() {
        this.temporizadores.forEach((t) => clearTimeout(t));
        this.temporizadores = [];
    }
}
