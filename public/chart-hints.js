/* Prices are shown at the precision supplied by the provider, without
   currency rounding. Sparkline data has no individual timestamps. */
(() => {
  const nearestPoint = (x, width, count) => Math.max(0, Math.min(count - 1,
    Math.round((width > 0 ? x / width : 0) * (count - 1))));
  const exactPrice = value => new Intl.NumberFormat('en-US', {
    maximumSignificantDigits: 21
  }).format(value) + ' USD';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { nearestPoint, exactPrice };
    return;
  }
  const tooltip = document.createElement('div');
  tooltip.id = 'price-tooltip';
  tooltip.className = 'price-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  const caption = document.createElement('span');
  const price = document.createElement('strong');
  tooltip.append(caption, price);
  document.body.append(tooltip);
  let active = null;
  let index = 0;
  function hide() {
    if (active) {
      active.querySelector('.plot-cursor')?.setAttribute('visibility', 'hidden');
      active.querySelector('.plot-dot')?.setAttribute('visibility', 'hidden');
      active.removeAttribute('aria-describedby');
    }
    active = null;
    tooltip.hidden = true;
  }
  function show(svg, requested) {
    const values = JSON.parse(svg.dataset.prices);
    if (!values.length) return;
    if (active && active !== svg) hide();
    active = svg;
    index = Math.max(0, Math.min(values.length - 1, requested));
    const rect = svg.getBoundingClientRect();
    const point = svg.querySelector('polyline').points.getItem(index);
    const box = svg.viewBox.baseVal;
    const line = svg.querySelector('.plot-cursor');
    line.setAttribute('x1', point.x); line.setAttribute('x2', point.x);
    line.setAttribute('visibility', 'visible');
    const dot = svg.querySelector('.plot-dot');
    dot.setAttribute('cx', point.x); dot.setAttribute('cy', point.y);
    dot.setAttribute('visibility', 'visible');
    caption.textContent = `Point ${index + 1} of ${values.length} · 7-day history`;
    price.textContent = exactPrice(values[index]);
    svg.setAttribute('aria-valuenow', String(index + 1));
    svg.setAttribute('aria-valuetext', `Point ${index + 1}: ${price.textContent}`);
    svg.setAttribute('aria-describedby', tooltip.id);
    tooltip.hidden = false;
    const tip = tooltip.getBoundingClientRect();
    const x = rect.left + point.x / box.width * rect.width;
    const y = rect.top + point.y / box.height * rect.height;
    tooltip.style.left = Math.max(8, Math.min(innerWidth - tip.width - 8, x - tip.width / 2)) + 'px';
    const above = y - tip.height - 16;
    tooltip.style.top = Math.max(8, Math.min(innerHeight - tip.height - 8, above >= 8 ? above : y + 18)) + 'px';
  }
  function fromPointer(event) {
    const svg = event.target.closest?.('.price-plot');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    show(svg, nearestPoint(event.clientX - rect.left, rect.width, JSON.parse(svg.dataset.prices).length));
  }
  document.addEventListener('pointermove', fromPointer);
  document.addEventListener('pointerdown', event => {
    if (event.target.closest?.('.price-plot')) fromPointer(event);
    else hide();
  });
  document.addEventListener('pointerout', event => {
    const svg = event.target.closest?.('.price-plot');
    if (event.pointerType === 'mouse' && svg && !svg.contains(event.relatedTarget)) hide();
  });
  document.addEventListener('focusin', event => {
    if (event.target.matches?.('.price-plot')) show(event.target, Number(event.target.getAttribute('aria-valuenow')) - 1);
  });
  document.addEventListener('focusout', event => {
    if (event.target.matches?.('.price-plot')) hide();
  });
  document.addEventListener('keydown', event => {
    const svg = event.target.closest?.('.price-plot');
    if (!svg) return;
    const count = JSON.parse(svg.dataset.prices).length;
    const current = Number(svg.getAttribute('aria-valuenow')) - 1;
    const targets = {ArrowLeft:current-1,ArrowDown:current-1,ArrowRight:current+1,ArrowUp:current+1,Home:0,End:count-1};
    if (event.key === 'Escape') { hide(); return; }
    if (event.key in targets) { event.preventDefault(); show(svg, targets[event.key]); }
  });
  window.addEventListener('resize', hide);
  document.addEventListener('scroll', hide, true);
  new MutationObserver(() => { if (active && !active.isConnected) hide(); })
    .observe(document.querySelector('main'), {childList:true,subtree:true});
})();
