// POST /api/avaliacoes/util  { id } → soma +1 no "Foi útil?" (uma vez por visitante)
import { json, visitante, preparaBanco } from "../../../lib/servidor.js";

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ erro: "Envio inválido." }, 400); }
  const id = String(b.id || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ erro: "Avaliação inválida." }, 400);
  try {
    await preparaBanco(env);
    const quem = await visitante(request, env);
    const voto = await env.DB.prepare("INSERT OR IGNORE INTO votos_util (avaliacao_id, visitante) VALUES (?, ?)").bind(id, quem).run();
    if (voto.meta.changes) await env.DB.prepare("UPDATE avaliacoes SET util = util + 1 WHERE id = ? AND status = 'publicado'").bind(id).run();
    const r = await env.DB.prepare("SELECT util FROM avaliacoes WHERE id = ?").bind(id).first();
    return json({ ok: true, util: r?.util ?? 0 });
  } catch {
    return json({ erro: "Não consegui registrar agora." }, 500);
  }
}
