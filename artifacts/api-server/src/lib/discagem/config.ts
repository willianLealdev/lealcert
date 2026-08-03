// ─────────────────────────────────────────────────────────────────
//  Configurações globais do sistema de discagem automática
//  Estes valores são usados como PADRÕES para novas campanhas.
//  Cada campanha pode sobrescrever individualmente no banco.
// ─────────────────────────────────────────────────────────────────

export const DISCAGEM_TIMEZONE = "America/Sao_Paulo";

// Janela de horário padrão (hora cheia, 24h)
export const DEFAULT_WINDOW_MORNING_START = 9;
export const DEFAULT_WINDOW_MORNING_END = 12;
export const DEFAULT_WINDOW_AFTERNOON_START = 13;
export const DEFAULT_WINDOW_AFTERNOON_END = 16;

// Dias da semana padrão (0=dom, 1=seg, 2=ter, 3=qua, 4=qui, 5=sex, 6=sáb)
// Padrão: segunda a quinta
export const DEFAULT_WINDOW_DAYS = ["mon", "tue", "wed", "thu"];

export const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

// Máximo de chamadas simultâneas padrão
export const DEFAULT_MAX_CONCURRENT = 3;

// Máximo de tentativas por contato
export const DEFAULT_MAX_ATTEMPTS = 2;

// Intervalo do scheduler em ms
export const SCHEDULER_INTERVAL_MS = 5_000;

// Intervalo de poll de status em ms
export const STATUS_POLL_INTERVAL_MS = 3_000;

// Tempo de ring sem resposta antes de considerar "não atendeu" (segundos)
export const NO_ANSWER_TIMEOUT_SECS = 30;

// ─── PLACEHOLDER DO SCRIPT DO AGENTE ────────────────────────────
// Aqui vai o script que o agente usará na conversa.
// Substitua o conteúdo entre as marcas com o script real.
export const AGENT_SYSTEM_PROMPT = `
Você é um assistente de vendas da LealCert, empresa especializada em certificados digitais.

⚠️ SCRIPT DO AGENTE NÃO CONFIGURADO ⚠️
O proprietário do sistema ainda não inseriu o script de abordagem e vendas.
Aguardando configuração do script via painel de administração.

Por enquanto, apenas cumprimente e informe que ligará novamente em breve.
`;
// ────────────────────────────────────────────────────────────────
