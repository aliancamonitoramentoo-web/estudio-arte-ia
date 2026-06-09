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
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
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
  const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&content_filter=high`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${unsplashKey}` }
    });
    const data = await response.json();
    if (data.errors) return res.status(400).json({ error: data.errors[0] });
    res.json({
      url: data.urls?.regular,
      thumb: data.urls?.small,
      credit: data.user?.name,
      creditLink: data.user?.links?.html,
      source: 'unsplash'
    });
  } catch (err) {
    console.error('Erro Unsplash:', err);
    res.status(500).json({ error: 'Erro ao buscar imagem no Unsplash.' });
  }
});

// ── PROXY GOOGLE CUSTOM SEARCH ──
app.get('/api/foto/google', async (req, res) => {
  const googleKey = process.env.GOOGLE_API_KEY;
  const googleCX  = process.env.GOOGLE_CX;
  if (!googleKey || !googleCX) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY ou GOOGLE_CX não configurados.' });
  }

  const query = req.query.q || 'security camera';
  const start = Math.floor(Math.random() * 8) + 1;
  const url = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCX}&q=${encodeURIComponent(query)}&searchType=image&num=5&start=${start}&safe=active&imgSize=large`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ error: 'Nenhuma imagem encontrada.' });
    }
    const item = data.items[Math.floor(Math.random() * data.items.length)];
    res.json({
      url: item.link,
      thumb: item.image?.thumbnailLink || item.link,
      credit: item.displayLink,
      creditLink: item.image?.contextLink || '#',
      source: 'google'
    });
  } catch (err) {
    console.error('Erro Google Search:', err);
    res.status(500).json({ error: 'Erro ao buscar imagem no Google.' });
  }
});

app.get('/api/foto', async (req, res) => {
  res.redirect('/api/foto/unsplash?' + new URLSearchParams(req.query).toString());
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎨 Estúdio de Arte IA rodando em http://localhost:${PORT}`);
});
