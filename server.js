const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── PROXY ANTHROPIC ──
app.post('/api/generate', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada.' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Erro Anthropic:', err);
    res.status(500).json({ error: 'Erro ao chamar a API de IA.' });
  }
});

// ── PROXY UNSPLASH ──
app.get('/api/foto/unsplash', async (req, res) => {
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!unsplashKey) return res.status(500).json({ error: 'UNSPLASH_ACCESS_KEY não configurada.' });
  const query = req.query.q || 'storefront';
  const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=${req.query.orientation||'landscape'}&content_filter=high`;
  try {
    const response = await fetch(url, { headers: { Authorization: `Client-ID ${unsplashKey}` } });
    const data = await response.json();
    if (data.errors) return res.status(400).json({ error: data.errors[0] });
    res.json({ url: data.urls?.regular, thumb: data.urls?.small, credit: data.user?.name, creditLink: data.user?.links?.html, source: 'unsplash' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar imagem no Unsplash.' });
  }
});

// ── PROXY UNSPLASH MÚLTIPLAS FOTOS ──
app.get('/api/fotos/unsplash', async (req, res) => {
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!unsplashKey) return res.status(500).json({ error: 'UNSPLASH_ACCESS_KEY não configurada.' });
  const queries = req.query.q ? req.query.q.split('|') : ['storefront'];
  try {
    const results = await Promise.all(queries.map(async (q, i) => {
      const orientation = i === 1 ? 'portrait' : 'landscape';
      const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(q.trim())}&orientation=${orientation}&content_filter=high`;
      const r = await fetch(url, { headers: { Authorization: `Client-ID ${unsplashKey}` } });
      const d = await r.json();
      if (d.errors) return null;
      return { url: d.urls?.regular, thumb: d.urls?.small, credit: d.user?.name, query: q.trim() };
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar imagens.' });
  }
});

// ── PROXY GOOGLE ──
app.get('/api/foto/google', async (req, res) => {
  const googleKey = process.env.GOOGLE_API_KEY;
  const googleCX = process.env.GOOGLE_CX;
  if (!googleKey || !googleCX) return res.status(500).json({ error: 'GOOGLE_API_KEY ou GOOGLE_CX não configurados.' });
  const query = req.query.q || 'security camera';
  const start = Math.floor(Math.random() * 8) + 1;
  const url = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCX}&q=${encodeURIComponent(query)}&searchType=image&num=5&start=${start}&safe=active&imgSize=large`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    if (!data.items?.length) return res.status(404).json({ error: 'Nenhuma imagem encontrada.' });
    const item = data.items[Math.floor(Math.random() * data.items.length)];
    res.json({ url: item.link, thumb: item.image?.thumbnailLink || item.link, credit: item.displayLink, creditLink: item.image?.contextLink || '#', source: 'google' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar imagem no Google.' });
  }
});

app.get('/api/foto', async (req, res) => {
  res.redirect('/api/foto/unsplash?' + new URLSearchParams(req.query).toString());
});

// ── BUSCA DE LOGO DA EMPRESA ──
// Tenta Clearbit → Google → retorna null se não achar
app.get('/api/logo', async (req, res) => {
  const nome = req.query.nome || '';
  const dominio = req.query.dominio || '';

  // Lista de domínios para tentar (do mais específico ao genérico)
  const candidatos = [];
  if (dominio) candidatos.push(dominio);

  // Tenta adivinhar o domínio pelo nome da empresa
  const slug = nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

  const sufixos = ['.com.br', '.com', '.net.br', '.net'];
  for (const s of sufixos) candidatos.push(slug + s);

  // Tenta cada candidato no Clearbit
  for (const d of candidatos.slice(0, 4)) {
    try {
      const url = `https://logo.clearbit.com/${d}?size=400&format=png`;
      const r = await fetch(url, { redirect: 'follow' });
      if (r.ok && r.headers.get('content-type')?.includes('image')) {
        // Retorna a URL diretamente (PNG transparente)
        return res.json({ url, dominio: d, source: 'clearbit', found: true });
      }
    } catch(e) {}
  }

  // Fallback: tenta Google Images para logo PNG
  const googleKey = process.env.GOOGLE_API_KEY;
  const googleCX  = process.env.GOOGLE_CX;
  if (googleKey && googleCX) {
    try {
      const q = `${nome} logo PNG transparent official`;
      const url = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCX}&q=${encodeURIComponent(q)}&searchType=image&num=5&safe=active&imgType=clipart&fileType=png`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.items?.length) {
        const item = d.items[0];
        return res.json({ url: item.link, thumb: item.image?.thumbnailLink, source: 'google', found: true });
      }
    } catch(e) {}
  }

  // Não achou — retorna found: false para o frontend pedir upload ou gerar com IA
  res.json({ found: false, message: 'Logo não encontrada automaticamente.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🎨 Estúdio de Arte IA rodando em http://localhost:${PORT}`));
