// Single-series time chart drawn as SVG: 2px line, hairline grid, direct labels on the
// latest and best sessions, and a touch/keyboard crosshair with a readout.
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

function text(parent, x, y, str, attrs = {}) {
  const t = el('text', { x, y, ...attrs }, parent);
  t.textContent = str;
  return t;
}

function niceStep(range, count) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

const fmtDate = (ms, long) =>
  new Date(ms).toLocaleDateString('en-GB', long ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });

/**
 * points: [{ x: ms, y: number, sub: string }] oldest first.
 * tick(v) formats axis numbers; value(v) formats labels and the readout (with unit).
 */
export function lineChart(host, points, { tick = String, value = String, label = '', height = 200 } = {}) {
  host.replaceChildren();
  if (!points.length) return;

  const W = Math.max(260, Math.round(host.clientWidth || 320));
  const H = height;
  const pad = { t: 24, r: 10, b: 24, l: 36 };
  const ys = points.map((p) => p.y);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  let lo = yMin;
  let hi = yMax;
  if (hi === lo) {
    const d = Math.max(1, Math.abs(hi) * 0.1);
    lo -= d;
    hi += d;
  }
  const headroom = (hi - lo) * 0.15;
  lo = Math.max(yMin >= 0 ? 0 : -Infinity, lo - headroom);
  hi += headroom;
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const x0 = points[0].x;
  const x1 = points[points.length - 1].x;
  const plotW = W - pad.l - pad.r;
  const sx = (x) => (x1 === x0 ? pad.l + plotW / 2 : pad.l + ((x - x0) / (x1 - x0)) * plotW);
  const sy = (y) => pad.t + (1 - (y - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const base = H - pad.b;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': label });

  const grid = el('g', { class: 'c-grid' }, svg);
  for (let v = lo; v <= hi + step / 2; v += step) {
    const y = Math.round(sy(v)) + 0.5;
    el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y }, grid);
    text(grid, pad.l - 7, y + 4, tick(v), { 'text-anchor': 'end', class: 'c-tick' });
  }

  // X labels: first, last and one or two between, spaced in time.
  const longSpan = x1 - x0 > 300 * 864e5;
  const xTicks = x1 === x0 ? [x0] : [0, 1 / 3, 2 / 3, 1].map((f) => x0 + (x1 - x0) * f);
  const shown = plotW < 300 && xTicks.length === 4 ? [xTicks[0], xTicks[2], xTicks[3]] : xTicks;
  shown.forEach((x, i) => {
    const anchor = shown.length === 1 ? 'middle' : i === 0 ? 'start' : i === shown.length - 1 ? 'end' : 'middle';
    text(svg, sx(x), H - 5, fmtDate(x, longSpan), { 'text-anchor': anchor, class: 'c-tick' });
  });

  const pts = points.map((p) => [sx(p.x), sy(p.y)]);
  if (pts.length > 1) {
    el('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(''), class: 'c-line' }, svg);
  }

  // Markers: every session when sparse, otherwise only the best and the latest.
  const last = points.length - 1;
  let bestI = 0;
  ys.forEach((y, i) => { if (y >= ys[bestI]) bestI = i; });
  points.forEach((p, i) => {
    if (points.length <= 20 || i === last || i === bestI) {
      el('circle', { cx: pts[i][0], cy: pts[i][1], r: i === last ? 5 : 4, class: 'c-dot' }, svg);
    }
  });

  const labelAt = (i, str, cls) => {
    const [x, y] = pts[i];
    const anchor = x > W - 60 ? 'end' : x < pad.l + 40 ? 'start' : 'middle';
    const ly = y - 11 < 12 ? y + 21 : y - 11;
    text(svg, x + (anchor === 'end' ? 4 : anchor === 'start' ? -4 : 0), ly, str, { 'text-anchor': anchor, class: cls });
  };
  labelAt(last, value(points[last].y), 'c-label');
  if (bestI !== last && Math.abs(pts[bestI][0] - pts[last][0]) > 70 && points[bestI].y > points[last].y) {
    labelAt(bestI, `best ${value(points[bestI].y)}`, 'c-label c-label-best');
  }

  const cross = el('g', { visibility: 'hidden' }, svg);
  const vline = el('line', { y1: pad.t - 6, y2: base, class: 'c-xhair' }, cross);
  const hdot = el('circle', { r: 5.5, class: 'c-dot c-dot-on' }, cross);
  const hit = el('rect', { x: pad.l - 10, y: 0, width: plotW + 20, height: H, fill: 'transparent', tabindex: 0, class: 'c-hit', 'aria-label': `${label}. Left and right arrow keys read each session.` }, svg);

  host.appendChild(svg);
  const tip = document.createElement('div');
  tip.className = 'c-tip';
  tip.hidden = true;
  const tipV = document.createElement('strong');
  const tipD = document.createElement('span');
  const tipS = document.createElement('span');
  tip.append(tipV, tipD, tipS);
  host.appendChild(tip);

  let active = -1;
  const show = (i) => {
    active = Math.max(0, Math.min(last, i));
    const [x, y] = pts[active];
    vline.setAttribute('x1', x);
    vline.setAttribute('x2', x);
    hdot.setAttribute('cx', x);
    hdot.setAttribute('cy', y);
    cross.setAttribute('visibility', 'visible');
    tipV.textContent = value(points[active].y);
    tipD.textContent = new Date(points[active].x).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    tipS.textContent = points[active].sub || '';
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(W - tw, x - tw / 2))}px`;
  };
  const hide = () => {
    active = -1;
    cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  const nearest = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p[0] - px) < Math.abs(pts[best][0] - px)) best = i; });
    return best;
  };
  hit.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  hit.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) show(nearest(e.clientX)); });
  hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  hit.addEventListener('blur', hide);
  hit.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      show(active < 0 ? last : active + (e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.key === 'Escape') hide();
  });
}
