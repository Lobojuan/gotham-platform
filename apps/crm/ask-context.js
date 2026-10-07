/* Keep public chat within free-provider input limits. Never truncate rules or a fact section. */
const bytes = text => Buffer.byteLength(text, 'utf8');
const cost = message => bytes(message.content) + 64;
export function publicAskMessages({ rules, knowledge, sources = '', history = [], question, maxBytes = 22000 }) {
  const last = { role: 'user', content: question };
  let remaining = maxBytes - cost({ content: rules }) - cost(last);
  if (remaining < 0) throw new Error('chat_rules_exceed_budget');
  // Keep recent complete turns; a very long old conversation cannot crowd out verified material.
  const recent = []; let historyBytes = 0;
  for (const message of history.slice(-6).reverse()) {
    const n = cost(message);
    if (historyBytes + n > Math.min(2400, remaining)) break;
    recent.unshift(message); historyBytes += n;
  }
  remaining -= historyBytes;
  const excerpts = [];
  for (const block of sources.trim().split(/\n\n+/).filter(Boolean)) {
    const n = bytes(block) + 2;
    if (n <= remaining && n <= 4200 - excerpts.reduce((sum, text) => sum + bytes(text) + 2, 0)) {
      excerpts.push(block); remaining -= n;
    }
  }
  let query = question.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (/invest|stock|gdp|econom|aktien|rendite|投资|经济|استثمار|اقتصاد/.test(query)) query += ' economic publications research';
  if (/forum|event|ticket|论坛|منتدى/.test(query)) query += ' upcoming forums';
  if (/price|fee|cost|prix|tarif|precio|kosten|preis|价格|费用|رسوم|سعر/.test(query)) query += ' packages prices';
  const words = [...new Set(query.match(/[a-z]{3,}/g) || [])].filter(word => !['the','what','how','can','and','for','explain','sentence','please','tell','about'].includes(word));
  const sections = knowledge.split(/\n(?=## )/).map((text, index) => ({ text, index,
    score: words.reduce((n, word) => n + (text.split('\n')[0].toLowerCase().includes(word) ? 5 : text.toLowerCase().includes(word) ? 1 : 0), 0) }));
  sections.sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = [];
  for (const section of sections) {
    const n = bytes(section.text) + 2;
    if (n <= remaining) { selected.push(section); remaining -= n; }
  }
  selected.sort((a, b) => a.index - b.index);
  const content = [rules, ...selected.map(section => section.text), ...excerpts].join('\n\n');
  const messages = [{ role: 'system', content }, ...recent, last];
  if (messages.reduce((n, message) => n + cost(message), 0) > maxBytes) throw new Error('chat_context_exceeds_budget');
  return messages;
}
