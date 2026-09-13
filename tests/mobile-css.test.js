// @vitest-environment node
// F8 regression: jangan sampai kolom tabel disembunyikan global di HP
// (data hilang) dan guard mobile dasar tetap ada.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(process.cwd(), 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

describe('F8 mobile regressions', () => {
  it('tidak ada aturan global th/td:nth-child(3/4) display:none (data hilang di HP)', () => {
    // Boleh hanya bila discope dengan selector (mis. .dash-panel-table ...).
    expect(css).not.toMatch(/(^|\n)\s*th:nth-child\(3\)\s*,/);
    expect(css).not.toMatch(/(^|\n)\s*th:nth-child\(4\)\s*,/);
  });
  it('viewport-fit=cover untuk safe-area perangkat berponi', () => {
    expect(html).toMatch(/viewport-fit=cover/);
  });
  it('guard mobile: overflow-x, text-size-adjust, target sentuh, sidebar adaptif', () => {
    expect(css).toMatch(/overflow-x: clip/);
    expect(css).toMatch(/text-size-adjust: 100%/);
    expect(css).toMatch(/@media \(pointer: coarse\)/);
    expect(css).toMatch(/min\(280px, 84vw\)/);
    expect(css).toMatch(/\.dashboard-main \{ padding: 16px 12px; \}/);
  });
});
