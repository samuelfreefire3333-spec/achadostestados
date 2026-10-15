// Utilidades compartilhadas pelas funções da Cloudflare (fora da pasta functions/, então não vira rota).
export const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

// Limpa texto: tira caracteres de controle e corta no tamanho máximo. Nada vira HTML.
export const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F‪-‮]/g, "").trim().slice(0, max);
export const hasLink = s => /(https?:\/\/|www\.|\b[\w-]+\.(com|br|net|org|ly|io|me|la)\b)/i.test(s);
export const isMercadoLivre = u => {
  try { const p = new URL(u); return p.protocol === "https:" && (/(^|\.)mercadoli(vre|bre)\.(com\.br|com|com\.ar|com\.mx)$/.test(p.hostname) || /(^|\.)meli\.la$/.test(p.hostname)); }
  catch { return false; }
};

// Identifica o visitante sem guardar o IP: só um hash com "sal".
export async function visitante(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "0";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode((env.SALT || "achados-testados") + ip));
  return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Cria as tabelas na primeira chamada (não precisa rodar SQL na mão).
let pronto = false;
export async function preparaBanco(env) {
  if (!env.DB) throw new Error("Banco de dados DB não está ligado ao projeto.");
  if (pronto) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS avaliacoes (
      id TEXT PRIMARY KEY, produto_id TEXT NOT NULL, nome TEXT NOT NULL, nota INTEGER NOT NULL,
      texto TEXT NOT NULL, comprou INTEGER NOT NULL DEFAULT 0, util INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'publicado', visitante TEXT NOT NULL, criado_em INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_aval_produto ON avaliacoes (produto_id, status)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS votos_util (avaliacao_id TEXT NOT NULL, visitante TEXT NOT NULL, PRIMARY KEY (avaliacao_id, visitante))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sugestoes (
      id TEXT PRIMARY KEY, produto TEXT NOT NULL, motivo TEXT, link TEXT, nome TEXT,
      visitante TEXT NOT NULL, criado_em INTEGER NOT NULL, lida INTEGER NOT NULL DEFAULT 0)`)
  ]);
  pronto = true;
}

export const novoId = () => crypto.randomUUID();
