// ─── Safeweb API client ────────────────────────────────────────────────────────
// Docs: https://developers.safeweb.com.br
// Auth: Basic (user:pass) → POST /autorizacao/token → JWT token (cached until expiry)
// NOTE: Paths marked [INFERRED] were not available in the Safeweb docs at integration time
//       and follow the Safeweb Microservice URL pattern. Confirm with Safeweb if issues arise.

// ── Base paths ────────────────────────────────────────────────────────────────
const AUTH_PATH = "/Service/Microservice/Shared/HubAutenticacao/Autenticacoes/api/autorizacao/token";
const PRODUCTS_PATH = "/Service/Microservice/Shared/Product/api/GetListProdutoByAR";
const CONSULTA_PATH = "/Service/Microservice/Shared/ConsultaPrevia/api/RealizarConsultaPrevia";
const LOCAIS_IBGE_PATH = "/Service/Microservice/Shared/AttendancePlace/api/GetListByCodigoIBGE";
const LOCAIS_CNPJ_PATH = "/Service/Microservice/Shared/AttendancePlace/api/GetListByCnpjAR";
const ADD_SOLICITACAO_PATH = "/Service/Microservice/Shared/Partner/api/Add";
// Tipos de solicitação: 1=Presencial, 2=Renovação/RenovaçãoOutraAC, 3=Videoconferência, 5=EmissãoOnline
const CANCELAR_PATH = "/Service/Microservice/Shared/Partner/api/Cancel"; // [INFERRED]
const BIOMETRY_VALIDATE_PATH = "/Service/Microservice/Shared/Partner/api/ValidateBiometry";
const BIOMETRY_PSBIO_LOCAL_PATH = "/Service/Microservice/Shared/Partner/api/ConsultPSBioLocal"; // [INFERRED]
const BIOMETRY_PSBIO_GLOBAL_PATH = "/Service/Microservice/Shared/Partner/api/ConsultPSBioGlobal"; // [INFERRED]
const RENEWAL_GET_PATH = "/Service/Microservice/Shared/Renewal/api/GetRenewal"; // [INFERRED]
const RENEWAL_OTHER_AC_PATH = "/Service/Microservice/Shared/Renewal/api/AddOtherAC"; // [INFERRED]
const RENEWAL_RELEASE_PATH = "/Service/Microservice/Shared/Renewal/api/Release"; // [INFERRED]
const EMISSION_GET_PATH = "/Service/Microservice/Shared/Emission/api/GetEmission"; // [INFERRED]
const EMISSION_OTHER_AC_PATH = "/Service/Microservice/Shared/Emission/api/AddOtherAC"; // [INFERRED]
const EMISSION_RELEASE_PATH = "/Service/Microservice/Shared/Emission/api/Release"; // [INFERRED]
const SAFEID_VALIDATE_PATH = "/Service/Microservice/Shared/SafeID/api/ValidateCertificate"; // [INFERRED]
const SAFEID_PRODUCTS_PATH = "/Service/Microservice/Shared/SafeID/api/GetProducts"; // [INFERRED]
const SAFEID_ADD_REQUEST_PATH = "/Service/Microservice/Shared/SafeID/api/AddRequest"; // [INFERRED]
const SAFEID_ADD_CERT_PATH = "/Service/Microservice/Shared/SafeID/api/AddCertificate"; // [INFERRED]
const AGENDA_LIST_PATH = "/Service/Microservice/Shared/Schedule/api/GetAvailableSchedules"; // [INFERRED]
const AGENDA_ADD_PATH = "/Service/Microservice/Shared/Schedule/api/Add"; // [INFERRED]
const AGENDA_CANCEL_PATH = "/Service/Microservice/Shared/Schedule/api/Cancel"; // [INFERRED]
const AGENDA_CONFIG_PATH = "/Service/Microservice/Shared/Schedule/api/GetConfiguration"; // [INFERRED]
const AGENDA_INFO_PATH = "/Service/Microservice/Shared/Schedule/api/GetInformation"; // [INFERRED]
const HOPE_FIRST_EMISSION_PATH = "/Service/Microservice/Shared/Hope/api/FirstEmission"; // [INFERRED]

// ── Settings ──────────────────────────────────────────────────────────────────
export interface SafewebSettings {
  url: string;
  username: string;
  password: string;
  cnpjAr?: string;
}

// ── Token cache ───────────────────────────────────────────────────────────────
interface TokenCache {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, TokenCache>();

export async function swGetToken(settings: SafewebSettings): Promise<string> {
  const cacheKey = `${settings.url}:${settings.username}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() / 1000 < cached.expiresAt - 60) return cached.token;

  const credentials = Buffer.from(`${settings.username}:${settings.password}`).toString("base64");
  const resp = await fetch(`${settings.url}${AUTH_PATH}`, {
    method: "POST",
    headers: { "Authorization": `Basic ${credentials}`, "Content-Type": "application/json" },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Safeweb auth HTTP ${resp.status}: ${text}`);
  }
  const data = await resp.json() as { tokenAcesso?: string; expiraEm?: number; sucesso?: boolean; mensagem?: string };
  if (!data.tokenAcesso) throw new Error(`Safeweb auth falhou: ${data.mensagem ?? "token não retornado"}`);
  tokenCache.set(cacheKey, { token: data.tokenAcesso, expiresAt: data.expiraEm ?? (Date.now() / 1000 + 3600) });
  return data.tokenAcesso;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function swGet<T>(settings: SafewebSettings, path: string): Promise<T> {
  const token = await swGetToken(settings);
  const resp = await fetch(`${settings.url}${path}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!resp.ok) { const text = await resp.text().catch(() => ""); throw new Error(`Safeweb GET ${path} HTTP ${resp.status}: ${text}`); }
  return resp.json() as Promise<T>;
}

async function swPost<T>(settings: SafewebSettings, path: string, body: unknown): Promise<T> {
  const token = await swGetToken(settings);
  const resp = await fetch(`${settings.url}${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) { const text = await resp.text().catch(() => ""); throw new Error(`Safeweb POST ${path} HTTP ${resp.status}: ${text}`); }
  return resp.json() as Promise<T>;
}

async function swDelete<T>(settings: SafewebSettings, path: string, body?: unknown): Promise<T> {
  const token = await swGetToken(settings);
  const resp = await fetch(`${settings.url}${path}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!resp.ok) { const text = await resp.text().catch(() => ""); throw new Error(`Safeweb DELETE ${path} HTTP ${resp.status}: ${text}`); }
  return resp.json() as Promise<T>;
}

// ── Common types ──────────────────────────────────────────────────────────────
export interface SwResult { sucesso?: boolean; mensagem?: string; [key: string]: unknown }
export interface SwContato { DDD: string; Telefone: string; Email: string }
export interface SwEndereco {
  Logradouro: string; Numero: string; Complemento?: string;
  Bairro: string; UF: string; Cidade: string;
  CodigoIbgeMunicipio?: string; CodigoIbgeUF?: string; CEP: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════
export async function swTestarAutenticacao(settings: SafewebSettings): Promise<{ ok: boolean; tokenPreview: string }> {
  const token = await swGetToken(settings);
  return { ok: true, tokenPreview: `${token.slice(0, 20)}...` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUTOS
// ═══════════════════════════════════════════════════════════════════════════════
export interface SwProduto {
  idProduto: number; Nome: string; Descricao: string;
  idTipoEmissao: number; TipoEmissao: string; ProdutoModelo: string;
  ProdutoValidade: string; ProdutoTipo: string; MidiaTipo: string | null;
  Modelo: number; Validade: number; Tipo: number; Midia: number | null;
  NomeAutoridadeRegistro: string; CnpjAR: string; NomeAutoridadeCertificadora: string;
}

export async function swListarProdutos(settings: SafewebSettings, idTipoEmissao: number, cnpjAr?: string): Promise<SwProduto[]> {
  return swGet<SwProduto[]>(settings, `${PRODUCTS_PATH}/${idTipoEmissao}/${cnpjAr ?? settings.cnpjAr ?? ""}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSULTA PRÉVIA
// ═══════════════════════════════════════════════════════════════════════════════
export interface SwConsultaResult { Codigo: number; Mensagem: string }

export async function swConsultaCPF(settings: SafewebSettings, cpf: string, dataNascimento: string): Promise<SwConsultaResult> {
  return swPost<SwConsultaResult>(settings, CONSULTA_PATH, { CPF: cpf, DocumentoTipo: "1", DtNascimento: dataNascimento });
}
export async function swConsultaCNPJ(settings: SafewebSettings, cnpj: string, cpfResponsavel: string, dataNascimento: string): Promise<SwConsultaResult> {
  return swPost<SwConsultaResult>(settings, CONSULTA_PATH, { CNPJ: cnpj, CPF: cpfResponsavel, DocumentoTipo: "2", DtNascimento: dataNascimento });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAIS DE ATENDIMENTO
// ═══════════════════════════════════════════════════════════════════════════════
export interface SwLocal {
  type: string;
  geometry: { type: string; coordinates: number[] };
  properties: { id: number; UF: string; titulo: string; descricao: string | null; endereco: string; cidade: string; bairro: string; estado: string; numero: string; numeroalternativo: string };
}
export interface SwLocaisResult { type?: string; LocaisAtendimento?: SwLocal[] }

export async function swLocaisPorCnpjAr(settings: SafewebSettings, cnpjAr?: string, idStatus = 1): Promise<SwLocaisResult> {
  return swGet<SwLocaisResult>(settings, `${LOCAIS_CNPJ_PATH}/${cnpjAr ?? settings.cnpjAr ?? ""}?idStatus=${idStatus}`);
}
export async function swLocaisPorIbge(settings: SafewebSettings, codigoIbge: string): Promise<SwLocaisResult> {
  return swPost<SwLocaisResult>(settings, LOCAIS_IBGE_PATH, { CodigoIBGE: codigoIbge });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADICIONAR SOLICITAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
// Tipo 1 — Presencial (PF ou PJ)
export async function swAdicionarPresencial(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  if (!data.CnpjAR) data.CnpjAR = settings.cnpjAr ?? "";
  return swPost<SwResult>(settings, `${ADD_SOLICITACAO_PATH}/1`, data);
}
// Tipo 2 — Renovação própria OU Renovação de outra AC (diferencia pelo campo CnpjACOrigem)
export async function swAdicionarRenovacao(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  if (!data.CnpjAR) data.CnpjAR = settings.cnpjAr ?? "";
  return swPost<SwResult>(settings, `${ADD_SOLICITACAO_PATH}/2`, data);
}
// Tipo 3 — Videoconferência
export async function swAdicionarVideoconferencia(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  if (!data.CnpjAR) data.CnpjAR = settings.cnpjAr ?? "";
  return swPost<SwResult>(settings, `${ADD_SOLICITACAO_PATH}/3`, data);
}
// Tipo 5 — Emissão On-line OU Emissão On-line de outra AC (diferencia pelo campo CnpjACOrigem)
export async function swAdicionarEmissaoOnline(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  if (!data.CnpjAR) data.CnpjAR = settings.cnpjAr ?? "";
  return swPost<SwResult>(settings, `${ADD_SOLICITACAO_PATH}/5`, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANCELAR SOLICITAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
export async function swCancelarSolicitacao(settings: SafewebSettings, idSolicitacao: number, motivo?: string): Promise<SwResult> {
  return swPost<SwResult>(settings, `${CANCELAR_PATH}/${idSolicitacao}`, { idSolicitacao, Motivo: motivo ?? "" });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENOVAÇÃO (workflow pós-solicitação)
// ═══════════════════════════════════════════════════════════════════════════════
export async function swRenovarComProduto(settings: SafewebSettings, idSolicitacao: number): Promise<SwResult> {
  return swGet<SwResult>(settings, `${RENEWAL_GET_PATH}/${idSolicitacao}`);
}
export async function swRenovarOutraAC(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  return swPost<SwResult>(settings, RENEWAL_OTHER_AC_PATH, data);
}
export async function swLiberarRenovacao(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  return swPost<SwResult>(settings, RENEWAL_RELEASE_PATH, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMISSÃO ON-LINE (workflow pós-solicitação)
// ═══════════════════════════════════════════════════════════════════════════════
export async function swEmitirComProduto(settings: SafewebSettings, idSolicitacao: number): Promise<SwResult> {
  return swGet<SwResult>(settings, `${EMISSION_GET_PATH}/${idSolicitacao}`);
}
export async function swEmitirOutraAC(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  return swPost<SwResult>(settings, EMISSION_OTHER_AC_PATH, data);
}
export async function swLiberarEmissao(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  return swPost<SwResult>(settings, EMISSION_RELEASE_PATH, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENOVAÇÃO SAFEID
// ═══════════════════════════════════════════════════════════════════════════════
export async function swSafeIDValidarCertificado(settings: SafewebSettings, cpf: string): Promise<SwResult> {
  return swGet<SwResult>(settings, `${SAFEID_VALIDATE_PATH}/${cpf}`);
}
export async function swSafeIDObterProdutos(settings: SafewebSettings, cnpjAr?: string): Promise<SwResult> {
  return swGet<SwResult>(settings, `${SAFEID_PRODUCTS_PATH}/${cnpjAr ?? settings.cnpjAr ?? ""}`);
}
export async function swSafeIDIncluirSolicitacao(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  if (!data.CnpjAR) data.CnpjAR = settings.cnpjAr ?? "";
  return swPost<SwResult>(settings, SAFEID_ADD_REQUEST_PATH, data);
}
export async function swSafeIDIncluirCertificado(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  if (!data.CnpjAR) data.CnpjAR = settings.cnpjAr ?? "";
  return swPost<SwResult>(settings, SAFEID_ADD_CERT_PATH, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO AGENDA
// ═══════════════════════════════════════════════════════════════════════════════
export async function swAgendaListarHorarios(settings: SafewebSettings, cnpjAr?: string, data?: Record<string, unknown>): Promise<SwResult> {
  const cnpj = cnpjAr ?? settings.cnpjAr ?? "";
  return swGet<SwResult>(settings, `${AGENDA_LIST_PATH}/${cnpj}${data?.idProduto ? `?idProduto=${data.idProduto}` : ""}`);
}
export async function swAgendaAgendar(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  if (!data.CnpjAR) data.CnpjAR = settings.cnpjAr ?? "";
  return swPost<SwResult>(settings, AGENDA_ADD_PATH, data);
}
export async function swAgendaCancelar(settings: SafewebSettings, idAgendamento: number): Promise<SwResult> {
  return swDelete<SwResult>(settings, `${AGENDA_CANCEL_PATH}/${idAgendamento}`);
}
export async function swAgendaConfiguracao(settings: SafewebSettings, cnpjAr?: string): Promise<SwResult> {
  return swGet<SwResult>(settings, `${AGENDA_CONFIG_PATH}/${cnpjAr ?? settings.cnpjAr ?? ""}`);
}
export async function swAgendaInformacoes(settings: SafewebSettings, idAgendamento: number): Promise<SwResult> {
  return swGet<SwResult>(settings, `${AGENDA_INFO_PATH}/${idAgendamento}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO HOPE
// ═══════════════════════════════════════════════════════════════════════════════
export async function swHopePrimeiraEmissao(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  if (!data.CnpjAR) data.CnpjAR = settings.cnpjAr ?? "";
  return swPost<SwResult>(settings, HOPE_FIRST_EMISSION_PATH, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BIOMETRIA
// ═══════════════════════════════════════════════════════════════════════════════
export async function swBiometriaValidar(settings: SafewebSettings, cpf: string): Promise<SwResult> {
  return swGet<SwResult>(settings, `${BIOMETRY_VALIDATE_PATH}/${cpf}`);
}
export async function swBiometriaPSBioLocal(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  return swPost<SwResult>(settings, BIOMETRY_PSBIO_LOCAL_PATH, data);
}
export async function swBiometriaPSBioGlobal(settings: SafewebSettings, data: Record<string, unknown>): Promise<SwResult> {
  return swPost<SwResult>(settings, BIOMETRY_PSBIO_GLOBAL_PATH, data);
}
