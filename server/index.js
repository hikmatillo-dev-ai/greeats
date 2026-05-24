const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// api.env faylini o'qish
const envPath = path.join(__dirname, '../api.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const PROVIDERS = {
  gemini: { name: 'Gemini 2.0 Flash', envKey: 'GEMINI_API_KEY', free: true },
  groq:   { name: 'Groq Llama 3.3',   envKey: 'GROQ_API_KEY',   free: true },
  claude: { name: 'Claude Haiku',      envKey: 'ANTHROPIC_API_KEY', free: false },
  openai: { name: 'GPT-4o Mini',       envKey: 'OPENAI_API_KEY', free: false },
};

async function callGemini(messages, apiKey) {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: "Siz Greets nomli AI assistantsiz. Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob bering." }] },
        generationConfig: { maxOutputTokens: 2048 }
      })
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Gemini xatosi');
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callGroq(messages, apiKey) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: "Siz Greets nomli AI assistantsiz. Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob bering." },
        ...messages
      ]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Groq xatosi');
  return data.choices?.[0]?.message?.content || '';
}

async function callClaude(messages, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      system: "Siz Greets nomli AI assistantsiz. Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob bering.",
      messages
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Claude xatosi');
  return data.content?.[0]?.text || '';
}

async function callOpenAI(messages, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: "Siz Greets nomli AI assistantsiz. Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob bering." },
        ...messages
      ]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'OpenAI xatosi');
  return data.choices?.[0]?.message?.content || '';
}

app.post('/api/chat', async (req, res) => {
  const { messages, provider = 'gemini' } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages kerak' });

  const info = PROVIDERS[provider];
  if (!info) return res.status(400).json({ error: `Noma'lum provider: ${provider}` });

  const apiKey = process.env[info.envKey];
  if (!apiKey) return res.status(500).json({ error: `${info.envKey} .env faylida topilmadi` });

  try {
    let reply = '';
    if (provider === 'gemini') reply = await callGemini(messages, apiKey);
    else if (provider === 'groq')   reply = await callGroq(messages, apiKey);
    else if (provider === 'claude') reply = await callClaude(messages, apiKey);
    else if (provider === 'openai') reply = await callOpenAI(messages, apiKey);
    res.json({ reply, providerName: info.name });
  } catch (err) {
    console.error(`[${provider}] xato:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/providers', (req, res) => {
  res.json(Object.entries(PROVIDERS).map(([id, info]) => ({
    id, name: info.name, free: info.free, active: !!process.env[info.envKey]
  })));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Greets server: http://localhost:${PORT}`);
  console.log('\n📡 Providerlar:');
  Object.entries(PROVIDERS).forEach(([id, info]) => {
    console.log(`   ${process.env[info.envKey] ? '✅' : '❌'} ${info.name}`);
  });
});