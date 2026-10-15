// GET  /api/avaliacoes?produto=ID  → avaliações publicadas (sem produto: todas, para as notas dos cards)
// POST /api/avaliacoes             → nova avaliação. SOMENTE TEXTO, sem links.
// Moderação: variável MODERAR = "sim" faz novas avaliações esperarem aprovação.
// Para ocultar/excluir: painel da Cloudflare → D1 → achados-db → tabela "avaliacoes" (mude status para "oculto").
import { json, clean, hasLink, visitante, preparaBanco, novoId } from "../../lib/servidor.js";

const PRODUTO_ID = /^[a-z0-9-]{2,80}$/;
const publico = r => ({ id: r.id, produtoId: r.produto_id, nome: r.nome, nota: r.nota, texto: r.texto, comprou: !!r.comprou, util: r.util, status: r.status, criadoEm: r.criado_em });

export async function onRequestGet({ request, env }) {
  const produto = new URL(request.url).searchParams.get("produto") || "";
  if (produto && !PRODUTO_ID.test(produto)) return json({ erro: "Produto inválido." }, 400);
  try {
    await preparaBanco(env);
    const q = produto
      ? env.DB.prepare("SELECT * FROM avaliacoes WHERE status = 'publicado' AND produto_id = ? ORDER BY criado_em DESC LIMIT 200").bind(produto)
      : env.DB.prepare("SELECT * FROM avaliacoes WHERE status = 'publicado' ORDER BY criado_em DESC LIMIT 1000");
    const { results } = await q.all();
    return json({ avaliacoes: results.map(publico) }, 200, { "cache-control": "public, max-age=30" });
  } catch {
    return json({ erro: "Avaliações indisponíveis no momento." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ erro: "Envio inválido." }, 400); }
  if (b.website) return json({ ok: true, status: "publicado" }); // honeypot

  const produtoId = String(b.produtoId || "");
  const nome = clean(b.nome, 40), texto = clean(b.texto, 600), nota = Number(b.nota);
  if (!PRODUTO_ID.test(produtoId)) return json({ erro: "Produto inválido." }, 400);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) return json({ erro: "Escolha uma nota de 1 a 5 estrelas." }, 400);
  if (nome.length < 2) return json({ erro: "Digite seu nome ou apelido (mínimo 2 letras)." }, 400);
  if (texto.length < 10) return json({ erro: "Escreva pelo menos 10 caracteres." }, 400);
  if (hasLink(`${nome} ${texto}`)) return json({ erro: "Links e endereços de sites não são permitidos." }, 400);

  try {
    await preparaBanco(env);
    const quem = await visitante(request, env);
    const agora = Date.now();
    const ja = await env.DB.prepare("SELECT COUNT(*) AS n FROM avaliacoes WHERE visitante = ? AND produto_id = ?").bind(quem, produtoId).first();
    if (ja?.n > 0) return json({ erro: "Você já avaliou este produto." }, 409);
    const recente = await env.DB.prepare("SELECT COUNT(*) AS n FROM avaliacoes WHERE visitante = ? AND criado_em > ?").bind(quem, agora - 30_000).first();
    if (recente?.n > 0) return json({ erro: "Aguarde 30 segundos entre avaliações." }, 429);

    const status = String(env.MODERAR || "").toLowerCase() === "sim" ? "pendente" : "publicado";
    const r = { id: novoId(), produto_id: produtoId, nome, nota, texto, comprou: b.comprou ? 1 : 0, util: 0, status, visitante: quem, criado_em: agora };
    await env.DB.prepare("INSERT INTO avaliacoes (id, produto_id, nome, nota, texto, comprou, util, status, visitante, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(r.id, r.produto_id, r.nome, r.nota, r.texto, r.comprou, r.util, r.status, r.visitante, r.criado_em).run();
    return json({ ok: true, status, avaliacao: publico(r) });
  } catch {
    return json({ erro: "Não consegui salvar agora. Tente de novo em alguns minutos." }, 500);
  }
}
