// ===== Barcode produk (Code128 subset B) → SVG, tanpa dependensi =====
// Code128 memuat seluruh ASCII 32–126 sehingga SKU apa pun bisa di-encode.
// Pola per karakter = 6 elemen lebar (bar/space bergantian, mulai bar).
const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];
const C128_START_B = 104, C128_STOP = 106;

function escapeXml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Hitung bar [x,width] untuk sebuah teks Code128.
export function code128Bars(text) {
  const value = String(text == null ? '' : text).slice(0, 48);
  const chars = [...value].filter(ch => {
    const code = ch.charCodeAt(0);
    return code >= 32 && code <= 126;
  });
  if (!chars.length) return { bars: [], width: 0 };
  const codes = [C128_START_B, ...chars.map(ch => ch.charCodeAt(0) - 32)];
  let sum = codes[0];
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103, C128_STOP);
  const bars = [];
  let x = 0;
  codes.forEach(c => {
    const pat = C128[c];
    for (let i = 0; i < pat.length; i++) {
      const w = Number(pat[i]);
      if (i % 2 === 0) bars.push([x, w]);
      x += w;
    }
  });
  return { bars, width: x };
}

export function code128Svg(text, { height = 64, quiet = 10 } = {}) {
  const { bars, width } = code128Bars(text);
  if (!width) return '';
  const total = width + quiet * 2;
  const rects = bars.map(([x, w]) => `<rect x="${quiet + x}" y="0" width="${w}" height="${height}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" width="${total}" height="${height}" role="img" aria-label="Barcode ${escapeXml(text)}"><rect width="${total}" height="${height}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
