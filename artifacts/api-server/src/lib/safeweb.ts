const AUTH_PATH = "/Service/Microservice/Shared/HubAutenticacao/Autenticacoes/api/autorizacao/token";
const PRODUCTS_PATH = "/Service/Microservice/Shared/Product/api/GetListProdutoByAR";
const CONSULTA_PATH = "/Service/Microservice/Shared/ConsultaPrevia/api/RealizarConsultaPrevia";
const LOCAIS_IBGE_PATH = "/Service/Microservice/Shared/AttendancePlace/api/GetListByCodigoIBGE";
const LOCAIS_CNPJ_PATH = "/Service/Microservice/Shared/AttendancePlace/api/GetListByCnpjAR";
const ADD_SOLICITACAO_PATH = "/Service/Microservice/Shared/Partner/api/Add";

export interface SafewebSettings {
  url: string;
  username: string;
  password: string;
  cnpjAr?: string;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

async function getToken(settings: SafewebSettings): Promise<string> {
  const cacheKey = `${settings.url}:${settings.username}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() / 1000 < cached.expiresAt - 60) {
    return cached.token;
  }

  const credentials = Buffer.from(`${settings.username}:${settings.password}`).toString("base64");
  const resp = await fetch(`${settings.url}${AUTH_PATH}`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Safeweb auth HTTP ${resp.status}: ${text}`);
  }

  const data = await resp.json() as { tokenAcesso?: string; expiraEm?: number; sucesso?: boolean; mensagem?: string };

  if (!data.tokenAcesso) {
    throw new Error(`Safeweb auth falhou: ${data.mensagem ?? "token não retornado"}`);
  }

  tokenCache.set(cacheKey, {
    token: data.tokenAcesso,
    expiresAt: data.expiraEm ?? (Date.now() / 1000 + 3600),
  });

  return data.tokenAcesso;
}

async function swGet<T>(settings: SafewebSettings, path: string): Promise<T> {
  const token = await getToken(settings);
  const resp = await fetch(`${settings.url}${path}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Safeweb GET ${path} HTTP ${resp.status}: ${text}`);
  }
  return resp.json() as Promise<T>;
}

async function swPost<T>(settings: SafewebSettings, path: string, body: Record<string, unknown>): Promise<T> {
  const token = await getToken(settings);
  const resp = await fetch(`${settings.url}${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Safeweb POST ${path} HTTP ${resp.status}: ${text}`);
  }
  return resp.json() as Promise<T>;
}

export interface SafewebProduto {
  idProduto: number;
  Nome: string;
  Descricao: string;
  idTipoEmissao: number;
  TipoEmissao: string;
  ProdutoModelo: string;
  ProdutoValidade: string;
  ProdutoTipo: string;
  MidiaTipo: string | null;
  Modelo: number;
  Validade: number;
  Tipo: number;
  Midia: number | null;
  NomeAutoridadeRegistro: string;
  CnpjAR: string;
  NomeAutoridadeCertificadora: string;
}

export async function swListarProdutos(
  settings: SafewebSettings,
  idTipoEmissao: number,
  cnpjAr?: string,
): Promise<SafewebProduto[]> {
  const cnpj = cnpjAr ?? settings.cnpjAr ?? "";
  return swGet<SafewebProduto[]>(settings, `${PRODUCTS_PATH}/${idTipoEmissao}/${cnpj}`);
}

export interface SafewebConsultaResult {
  Codigo: number;
  Mensagem: string;
}

export async function swConsultaCPF(
  settings: SafewebSettings,
  cpf: string,
  dataNascimento: string,
): Promise<SafewebConsultaResult> {
  return swPost<SafewebConsultaResult>(settings, CONSULTA_PATH, {
    CPF: cpf,
    DocumentoTipo: "1",
    DtNascimento: dataNascimento,
  });
}

export async function swConsultaCNPJ(
  settings: SafewebSettings,
  cnpj: string,
  cpfResponsavel: string,
  dataNascimento: string,
): Promise<SafewebConsultaResult> {
  return swPost<SafewebConsultaResult>(settings, CONSULTA_PATH, {
    CNPJ: cnpj,
    CPF: cpfResponsavel,
    DocumentoTipo: "2",
    DtNascimento: dataNascimento,
  });
}

export interface SafewebLocalAtendimento {
  id: number;
  UF: string;
  titulo: string;
  descricao: string | null;
  endereco: string;
  cidade: string;
  bairro: string;
  estado: string;
  numero: string;
  numeroalternativo: string;
}

export interface SafewebLocaisResult {
  type?: string;
  LocaisAtendimento?: Array<{
    type: string;
    geometry: { type: string; coordinates: number[] };
    properties: SafewebLocalAtendimento;
  }>;
}

export async function swLocaisPorCnpjAr(
  settings: SafewebSettings,
  cnpjAr?: string,
  idStatus?: number,
): Promise<SafewebLocaisResult> {
  const cnpj = cnpjAr ?? settings.cnpjAr ?? "";
  const status = idStatus ?? 1;
  return swGet<SafewebLocaisResult>(settings, `${LOCAIS_CNPJ_PATH}/${cnpj}?idStatus=${status}`);
}

export async function swLocaisPorIbge(
  settings: SafewebSettings,
  codigoIbge: string,
): Promise<SafewebLocaisResult> {
  return swPost<SafewebLocaisResult>(settings, LOCAIS_IBGE_PATH, { CodigoIBGE: codigoIbge });
}

export interface SafewebSolicitacaoContato {
  DDD: string;
  Telefone: string;
  Email: string;
}

export interface SafewebSolicitacaoEndereco {
  Logradouro: string;
  Numero: string;
  Complemento?: string;
  Bairro: string;
  UF: string;
  Cidade: string;
  CodigoIbgeMunicipio?: string;
  CodigoIbgeUF?: string;
  CEP: string;
}

export interface SafewebSolicitacaoCPF {
  CnpjAR: string;
  idProduto: string;
  Nome: string;
  CPF: string;
  DataNascimento: string;
  Contato: SafewebSolicitacaoContato;
  Endereco: SafewebSolicitacaoEndereco;
  CPFContador?: string;
}

export interface SafewebSolicitacaoCNPJ {
  CnpjAR: string;
  idProduto: string;
  CNPJ: string;
  RazaoSocial: string;
  NomeFantasia?: string;
  Nome: string;
  CPF: string;
  DataNascimento: string;
  Contato: SafewebSolicitacaoContato;
  Endereco: SafewebSolicitacaoEndereco;
  CPFContador?: string;
}

export interface SafewebSolicitacaoResult {
  idSolicitacao?: number;
  Protocolo?: string;
  sucesso?: boolean;
  mensagem?: string;
  [key: string]: unknown;
}

export async function swAdicionarSolicitacaoCPF(
  settings: SafewebSettings,
  data: SafewebSolicitacaoCPF,
): Promise<SafewebSolicitacaoResult> {
  return swPost<SafewebSolicitacaoResult>(settings, `${ADD_SOLICITACAO_PATH}/1`, data as unknown as Record<string, unknown>);
}

export async function swAdicionarSolicitacaoCNPJ(
  settings: SafewebSettings,
  data: SafewebSolicitacaoCNPJ,
): Promise<SafewebSolicitacaoResult> {
  return swPost<SafewebSolicitacaoResult>(settings, `${ADD_SOLICITACAO_PATH}/1`, data as unknown as Record<string, unknown>);
}

export async function swTestarAutenticacao(settings: SafewebSettings): Promise<{ ok: boolean; token: string }> {
  const token = await getToken(settings);
  return { ok: true, token: `${token.slice(0, 20)}...` };
}
