const GAR_BASE = "https://gestaoar.com.br/ComercialAPI/api/GarAPIs";

export interface GarSettings {
  apiKey: string;
  hashVendedor?: string;
  hashTabela?: string;
  formaPagamento?: number;
  preferirVideoconferencia?: boolean;
}

async function garPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${GAR_BASE}/${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Gestão AR ${path} HTTP ${resp.status}: ${text}`);
  }
  return resp.json() as Promise<T>;
}

// ── Vendas ──────────────────────────────────────────────────────────────────

export interface GarStatusPedido {
  HashVenda?: string;
  Pedido?: string;
  Protocolo?: string;
  NomeVendedor?: string;
  DocumentoVendedor?: string;
  NomeCliente?: string;
  DocumentoCliente?: string;
  Produto?: string;
  isCNPJ?: string;
  isProtocolo?: string;
  TipoProduto?: string;
  TipoEmissaoProduto?: number;
  TipoEmissao?: string;
  StatusPedido?: string;
  DataStatusPedido?: string;
  StatusFinanceiro?: string;
  LinkFatura?: string;
  FormaPagamento?: number;
  LocalAgendamento?: string;
  DataHoraAgenda?: string;
  LinkAgenda?: string;
  Status?: number;
  Voucher?: number;
  Erros?: { Ocorrencia: string }[];
}

export async function garConsultarStatus(apiKey: string, pedido: string, protocolo?: string): Promise<GarStatusPedido> {
  return garPost<GarStatusPedido>("ConsultaPedidoProtocolo", {
    apiKey,
    Pedido: pedido,
    Protocolo: protocolo ?? "",
  });
}

export interface GarProduto {
  HashProduto: string;
  Nome: string;
  TipoProduto: number;
  TipoProdutoDescricao: string;
  TipoEmissao: number;
  TipoCertificado: string;
  Validade: number;
  TipoEmissaoDescricao: string;
  Agrupador: string;
  ValorVenda: number;
}

export interface GarTabelaPrecos {
  FamiliaProduto?: number;
  TipoProduto?: number;
  TipoEmissao?: number;
  Documento?: string;
  HashVendedor?: string;
  HashTabela?: string;
  Validade?: number;
  Produtos?: GarProduto[];
  Status?: number;
  Erros?: { Ocorrencia: string }[];
}

export async function garTabelaPrecos(
  apiKey: string,
  documento: string,
  tipoProduto?: number,
  tipoEmissao?: number,
  validade?: number,
): Promise<GarTabelaPrecos> {
  return garPost<GarTabelaPrecos>("TabelaPrecos", {
    apiKey,
    Documento: documento,
    familiaProduto: "0",
    validade: validade ? String(validade) : "",
    codigoTabela: "",
    TipoProduto: tipoProduto ?? 0,
    TipoEmissao: tipoEmissao ?? 0,
  });
}

export interface GarFormaPagamento {
  Id: number;
  Nome: string;
}

export async function garFormasPagamento(apiKey: string): Promise<GarFormaPagamento[]> {
  return garPost<GarFormaPagamento[]>("FormasPagamento", { apiKey });
}

export interface GarTipoEmissao {
  TipoEmissao: number;
  TipoEmissaoDescricao: string;
}

export async function garTiposEmissao(apiKey: string, documento?: string): Promise<GarTipoEmissao[]> {
  return garPost<GarTipoEmissao[]>("TipoEmissao", { apiKey, documento: documento ?? "" });
}

export interface GarTipoProduto {
  Produto: string;
  Tipo: number;
}

export async function garTiposProduto(apiKey: string, documento?: string): Promise<GarTipoProduto[]> {
  return garPost<GarTipoProduto[]>("TipoProduto", { apiKey, documento: documento ?? "" });
}

export interface GarValidade {
  Validade: number;
  ValidadeDescricao: string;
}

export async function garValidades(apiKey: string, tipo: number, tipoEmissao: number): Promise<GarValidade[] | null> {
  return garPost<GarValidade[] | null>("Validade", { apiKey, tipo: String(tipo), tipoEmissao: String(tipoEmissao) });
}

export interface GarPsBioResult {
  IsOk: boolean;
}

export async function garPsBio(apiKey: string, cpf: string): Promise<GarPsBioResult> {
  return garPost<GarPsBioResult>("PsBio", { apiKey, CPF: cpf });
}

export interface GarComprarCliente {
  CNPJCPF: string;
  NomeRazaoSocial: string;
  NomeFantasia?: string;
  Email?: string;
  CEP?: string;
  Logradouro?: string;
  Numero?: string;
  Complemento?: string;
  Bairro?: string;
  Cidade?: string;
  UF?: string;
  CodigoIBGE?: string;
  DDD?: string;
  Telefone?: string;
}

export interface GarComprarPedidoItem {
  Pedido: string;
  HashProduto: string;
  Nome: string;
  Validade: number;
  ValorProduto: number;
}

export interface GarComprarResult {
  LinkAgenda?: string;
  FormaPagamento?: number;
  FormaPagamentoDescricao?: string;
  Status?: number;
  Descricao?: string;
  ValorTotal?: number;
  LinkFatura?: string;
  Produtos?: GarComprarPedidoItem[];
  Erros?: { Ocorrencia: string }[];
}

export async function garComprar(
  apiKey: string,
  hashVendedor: string,
  hashTabela: string,
  formaPagamento: number,
  cliente: GarComprarCliente,
  hashProdutos: string[],
  codigoVoucher?: string,
): Promise<GarComprarResult> {
  return garPost<GarComprarResult>("Comprar", {
    apiKey,
    HashVendedor: hashVendedor,
    HashTabela: hashTabela,
    FormaPagamento: formaPagamento,
    CodigoVoucher: codigoVoucher ?? "",
    Cliente: cliente,
    Produtos: hashProdutos.map(h => ({ HashProduto: h })),
  });
}

export interface GarEmitirProtocoloResult {
  ErrorCode: string;
  ErrorDescription: string;
}

export async function garEmitirProtocolo(
  apiKey: string,
  pedido: number,
  cpf: string,
  cnpj?: string,
  dataNascimento?: string,
  isPossuiCNH?: boolean,
  isCNPJ?: boolean,
): Promise<GarEmitirProtocoloResult[]> {
  return garPost<GarEmitirProtocoloResult[]>("EmitirProtocolo", {
    apiKey,
    Pedido: pedido,
    isCNPJ: isCNPJ ? "1" : "0",
    CNPJ: cnpj ?? "",
    CPF: cpf,
    DataNascimento: dataNascimento ?? "",
    IsPossuiCNH: isPossuiCNH ?? false,
  });
}

export interface GarPedidoCliente {
  Pedido: string;
  Protocolo?: string;
  NomeVendedor?: string;
  DocumentoVendedor?: string;
  NomeCliente?: string;
  DocumentoCliente?: string;
  EmailCliente?: string;
  TelefoneCliente?: string;
  Produto?: string;
  TipoProduto?: string;
  TipoEmissao?: string;
  StatusPedido?: string;
  DataStatusPedido?: string;
  StatusFinanceiro?: string;
  LinkFatura?: string;
  Status?: number;
  Erros?: { Ocorrencia: string }[];
}

export async function garConsultarPedido(apiKey: string, pedido: string): Promise<GarPedidoCliente> {
  return garPost<GarPedidoCliente>("Pedido", { apiKey, Pedido: Number(pedido) });
}

export interface GarPedidosClienteResult {
  PossuiPedidosVinculados?: boolean;
  NomeCliente?: string;
  Pedidos?: GarPedidoCliente[];
  Status?: number;
  Erros?: { Ocorrencia: string }[];
}

export async function garPedidosPorCliente(apiKey: string, documento: string): Promise<GarPedidosClienteResult> {
  return garPost<GarPedidosClienteResult>("PedidosCliente", { apiKey, Documento: documento });
}

export interface GarPedidosContadorItem extends GarPedidoCliente {
  NomeCliente?: string;
  DocumentoCliente?: string;
}

export interface GarPedidosContadorResult {
  PossuiPedidosVinculados?: boolean;
  ContadorParceiro?: boolean;
  NomeContadorParceiro?: string;
  Pedidos?: GarPedidosContadorItem[];
  Status?: number;
  Erros?: { Ocorrencia: string }[];
}

export async function garPedidosContador(apiKey: string, documento: string): Promise<GarPedidosContadorResult> {
  return garPost<GarPedidosContadorResult>("DadosContador", { apiKey, Documento: documento });
}

export interface GarRenovacaoItem {
  Pedido?: string;
  idStatusRenovacao?: string;
  StatusRenovacao?: string;
  AutoridadeRegistro?: string;
  HashPA?: string;
  CodigoParceiro?: string;
  PontoAtendimento?: string;
  TelefonePontoAtendimento?: string;
  HashVendedor?: string;
  Vendedor?: string;
  TelefoneVendedor?: string;
  HashProduto?: string;
  Produto?: string;
  ValorProduto?: number;
  Cliente?: string;
  Email?: string;
  Telefone?: string;
  CPF?: string;
  CNPJ?: string;
  RazaoSocial?: string;
  DataEmissao?: string;
  DataExpiracao?: string;
  Observacao?: string;
}

export async function garRenovacoes(apiKey: string, dataInicial: string, dataFinal: string): Promise<GarRenovacaoItem[]> {
  return garPost<GarRenovacaoItem[]>("ExtratoRenovacao", { apiKey, DataInicial: dataInicial, DataFinal: dataFinal });
}

// ── Agenda ───────────────────────────────────────────────────────────────────

export interface GarLocalAgendamento {
  HashPessoa: string;
  HashLocal: string;
  DadosPesquisa: string;
  NomeLocalAgendamento: string;
  NomeCidadeLocalAgendamento: string;
  Endereco: string;
  CEP: string;
  Municipio: string;
  UF: string;
  Telefone: string;
  Email: string;
}

export async function garLocaisAgendamento(apiKey: string, uf?: string, municipio?: string): Promise<GarLocalAgendamento[]> {
  return garPost<GarLocalAgendamento[]>("LocaisAgendamento", {
    apiKey,
    UF: uf ?? "",
    munimunicipio: municipio ?? "",
  });
}

export interface GarSlotAtendimento {
  HashSlot: string;
  NomeSlotAgendamento: string;
}

export async function garSlotsLocal(apiKey: string, hashLocal: string): Promise<GarSlotAtendimento[]> {
  return garPost<GarSlotAtendimento[]>("LocaisAgendamentoSlot", { apiKey, hashLocal });
}

export interface GarUF {
  UF: string;
}

export async function garUFs(apiKey: string): Promise<GarUF[]> {
  return garPost<GarUF[]>("UFs", { apiKey });
}

export interface GarMunicipio {
  UF: string;
  Municipio: string;
}

export async function garMunicipios(apiKey: string, uf: string): Promise<GarMunicipio[]> {
  return garPost<GarMunicipio[]>("Municipios", { apiKey, UF: uf });
}

export interface GarAgendarResult {
  Status?: number;
  Descricao?: string;
  DataHoraAgendamento?: string;
  NomeLocalAgendamento?: string;
  LinkAgenda?: string;
  Erros?: { Ocorrencia: string }[];
}

export async function garAgendar(
  apiKey: string,
  pedido: string,
  protocolo: string,
  hashLocal: string,
  hashSlot: string,
): Promise<GarAgendarResult> {
  return garPost<GarAgendarResult>("AgendarAtendimento", {
    apiKey,
    Pedido: Number(pedido),
    Protocolo: protocolo,
    HashLocal: hashLocal,
    HashSlot: hashSlot,
  });
}

export interface GarDiaSemana {
  Id: number;
  Name: string;
}

export async function garDiasSemana(apiKey: string): Promise<GarDiaSemana[]> {
  return garPost<GarDiaSemana[]>("DiasSemana", { apiKey });
}

export interface GarFamiliaProduto {
  Id: number;
  Nome: string;
  Descricao: string;
  TipoTela: string;
}

export async function garFamilias(apiKey: string): Promise<GarFamiliaProduto[]> {
  return garPost<GarFamiliaProduto[]>("FamiliaProdutos", { apiKey });
}
