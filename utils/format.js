function countEnglishWords(text) {
  const matches = String(text || '').match(/[A-Za-z]+(?:'[A-Za-z]+)?/g);
  return matches ? matches.length : 0;
}

function summarizeText(text, limit = 56) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '暂无摘要';
  }
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function formatTime(ts) {
  if (!ts) {
    return '';
  }
  const date = new Date(ts);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function uid(prefix = 'session') {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

module.exports = {
  countEnglishWords,
  summarizeText,
  formatTime,
  uid
};
