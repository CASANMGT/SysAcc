// charts.js — Grafik dashboard (SVG murni, tanpa DOM framework).
// Dipakai oleh app.js via wrapper tipis; state range/toggle milik app.js.

import { computeCashflow, getMonthsBetween, getCategoryLabel } from './reports.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtCompactRp(v) {
  const n = Number(v) || 0;
  if (n >= 1000000000) return `Rp${(n / 1000000000).toFixed(1)}M`;
  if (n >= 1000000) return `Rp${(n / 1000000).toFixed(1)}jt`;
  if (n >= 1000) return `Rp${Math.round(n / 1000)}rb`;
  return `Rp${n}`;
}

export function renderArusKasChart(entries, opts) {
  const range = (opts && opts.range) || 6;
  const show = (opts && opts.show) || { income: true, expense: true };
  const svg = document.getElementById('arusKasChart');
  const monthsEl = document.getElementById('chartMonths');
  const totalEl = document.getElementById('chartTotalMasuk');
  const rataEl = document.getElementById('chartRata');
  const growthEl = document.getElementById('chartGrowth');
  if (!svg) return;
  // sync control UI
  document.querySelectorAll('#arusRange .chip').forEach(b => b.classList.toggle('selected', Number(b.dataset.value) === range));
  document.querySelectorAll('#arusToggle .chip').forEach(b => {
    const on = !!show[b.dataset.value];
    b.classList.toggle('selected', on);
    b.classList.toggle('off', !on);
  });
  const monthly = computeCashflow(entries);
  const now = new Date();
  let endDate = new Date(now.getFullYear(), now.getMonth(), 1);
  if (monthly.length) {
    const last = monthly[monthly.length - 1].month;
    const [y, m] = last.split('-').map(Number);
    if (y && m) endDate = new Date(y, m - 1, 1);
  }
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - (range - 1));
  const keys = getMonthsBetween(startDate, endDate);
  const map = new Map(monthly.map(d => [d.month, d]));
  const data = keys.map(k => map.get(k) || { month: k, income: 0, expense: 0 });
  const hasAny = data.some(d => d.income > 0 || d.expense > 0);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const labels = data.map(d => {
    const m = Number(d.month.split('-')[1]);
    return monthNames[m - 1] || m;
  });
  if (monthsEl) monthsEl.innerHTML = labels.map(l => `<span>${l}</span>`).join('');
  const total = data.reduce((a, b) => a + b.income, 0);
  const activeMonths = data.filter(d => d.income > 0 || d.expense > 0).length || 1;
  if (totalEl) totalEl.textContent = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(total);
  if (rataEl) rataEl.textContent = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Math.round(total / activeMonths));
  if (!hasAny) {
    svg.innerHTML = '<text x="300" y="80" text-anchor="middle" style="fill:var(--chart-axis,#94a3b8)" font-size="12">Belum ada data</text><text x="300" y="100" text-anchor="middle" style="fill:var(--chart-dot-idle,#cbd5e1)" font-size="11">Tambah transaksi untuk melihat tren</text>';
    if (growthEl) { growthEl.textContent = '—'; growthEl.style.color = ''; }
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Grafik arus kas: belum ada data');
    return;
  }
  const W = 600, H = 180, pad = { l: 44, r: 8, t: 10, b: 20 };
  const n = data.length;
  const max = Math.max(...data.flatMap(d => [show.income ? d.income : 0, show.expense ? d.expense : 0]), 1);
  const yMax = max * 1.15;
  const stepX = n > 1 ? (W - pad.l - pad.r) / (n - 1) : 0;
  const y = (v) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);
  const x = (i) => pad.l + i * stepX;
  const incomePts = data.map((d, i) => `${x(i)},${y(d.income)}`).join(' L ');
  const expensePts = data.map((d, i) => `${x(i)},${y(d.expense)}`).join(' L ');
  const lastIdx = n - 1;
  const areaIncome = n > 1 ? `M ${incomePts} L ${x(lastIdx)},${H - pad.b} L ${x(0)},${H - pad.b} Z` : '';
  const yTicks = [0, 1, 2, 3].map(i => {
    const v = (yMax / 3) * i;
    const yy = pad.t + (3 - i) * ((H - pad.t - pad.b) / 3);
    return { v, yy };
  });
  const dots = data.map((d, i) => {
    const tip = `${labels[i]} • Masuk ${fmtCompactRp(d.income)} • Keluar ${fmtCompactRp(d.expense)}`;
    const dotFill = d.income > 0 ? 'var(--chart-income,#10b981)' : 'var(--chart-dot-idle,#cbd5e1)';
    return `<g><title>${tip}</title><circle cx="${x(i)}" cy="${y(d.income)}" r="${i === lastIdx ? 5 : 3.5}" style="fill:${dotFill}" stroke="white" stroke-width="2"><title>${tip}</title></circle></g>`;
  }).join('');
  svg.innerHTML = `
    ${yTicks.map(t => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${t.yy}" y2="${t.yy}" style="stroke:var(--chart-grid,#f1f5f9)" stroke-width="1" stroke-dasharray="4 6"/><text x="${pad.l - 6}" y="${t.yy + 4}" text-anchor="end" style="fill:var(--chart-axis,#94a3b8)" font-size="9">${fmtCompactRp(Math.round(t.v))}</text>`).join('')}
    ${show.income && n > 1 ? `<path d="${areaIncome}" style="fill:var(--chart-income,#10b981)" fill-opacity="0.12"/>` : ''}
    ${show.income && n > 1 ? `<path d="M ${incomePts}" fill="none" style="stroke:var(--chart-income,#10b981)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    ${show.income && n === 1 && data[0].income > 0 ? `<circle cx="${x(0)}" cy="${y(data[0].income)}" r="6" style="fill:var(--chart-income,#10b981)" stroke="white" stroke-width="2"><title>${labels[0]} • ${fmtCompactRp(data[0].income)}</title></circle>` : ''}
    ${show.expense && n > 1 ? `<path d="M ${expensePts}" fill="none" style="stroke:var(--chart-expense,#fb7185)" stroke-width="2" stroke-dasharray="6 6" opacity="0.7"/>` : ''}
    ${dots}
  `;
  if (growthEl) {
    const last = data[lastIdx].income;
    const prev = n > 1 ? data[lastIdx - 1].income : 0;
    if (prev === 0 && last > 0) { growthEl.textContent = '+100%'; growthEl.style.color = 'var(--chart-income,#10b981)'; }
    else if (prev === 0 && last === 0) { growthEl.textContent = '—'; growthEl.style.color = ''; }
    else {
      const pct = Math.round(((last - prev) / (prev || 1)) * 100);
      growthEl.textContent = (pct > 0 ? '+' : '') + pct + '%';
      growthEl.style.color = pct >= 0 ? 'var(--chart-income,#10b981)' : 'var(--chart-expense,#fb7185)';
    }
  }
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Grafik arus kas ${labels[0] || ''}–${labels[lastIdx] || ''}: total pemasukan ${fmtCompactRp(total)}`);
}

export function renderDonut(categories) {
  const totalEl = document.getElementById('donutTotal');
  const legend = document.getElementById('donutLegend');
  const empty = document.getElementById('donutEmpty');
  const arc = document.getElementById('donutArc');
  const expenseCats = (categories || []).filter(c => c.type === 'expense');
  const total = expenseCats.reduce((a, b) => a + b.total, 0);
  if (totalEl) totalEl.textContent = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(total);
  if (!expenseCats.length) {
    if (arc) { arc.setAttribute('stroke-dasharray', '2 8'); arc.setAttribute('stroke', '#e2e8f0'); }
    if (legend) legend.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    const ds = document.querySelector('.donut-svg');
    if (ds) { ds.setAttribute('role', 'img'); ds.setAttribute('aria-label', 'Pengeluaran per kategori: belum ada data'); }
    return;
  }
  if (empty) empty.style.display = 'none';
  // simple donut: first category arc
  const colors = ['#fbbf24', '#60a5fa', '#a78bfa', '#cbd5e1'];
  if (legend) {
    legend.innerHTML = expenseCats.slice(0, 4).map((c, i) => {
      const pct = ((c.total / total) * 100).toFixed(0);
      return `<div class="donut-legend-item"><span><span class="donut-dot" style="background:${colors[i % colors.length]}"></span> ${esc(getCategoryLabel(c.category))}</span><span style="color:#64748b">${pct}%</span></div>`;
    }).join('');
  }
  if (arc) {
    const pct = Math.min(100, Math.round((expenseCats[0].total / total) * 100));
    const circ = 2 * Math.PI * 36;
    const dash = (pct / 100) * circ;
    arc.setAttribute('stroke', colors[0]);
    arc.setAttribute('stroke-dasharray', `${dash} ${circ - dash}`);
    arc.setAttribute('opacity', '1');
  }
  const donutSvg = document.querySelector('.donut-svg');
  if (donutSvg) {
    donutSvg.setAttribute('role', 'img');
    const top = expenseCats[0];
    donutSvg.setAttribute('aria-label', `Pengeluaran per kategori, total ${new Intl.NumberFormat('id-ID').format(total)}; terbesar ${getCategoryLabel(top.category)}`);
  }
}
