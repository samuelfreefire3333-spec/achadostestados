# Achados Testados

Vitrine de afiliado do Mercado Livre com reviews, vídeos e avaliações.

- `public/` — o site (index.html + logos)
- `netlify/functions/ml-produto.mts` — busca preço e estrelas no Mercado Livre (`/api/ml-produto?id=MLB...`)
- `extras/` — integração com Firebase e regras do Firestore (para depois)

As chaves do Mercado Livre ficam nas variáveis de ambiente da Netlify (`ML_CLIENT_ID`, `ML_CLIENT_SECRET`), nunca no código.
