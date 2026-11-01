/* =========================================================================
   Renderizado Háptico en Cirugía Robótica · La Barrera de 1 kHz
   Motion graphics 100 % deterministas: todo (DOM + Canvas + SVG) se deriva
   del tiempo de una única línea de tiempo GSAP de 270 s (4:30), permitiendo
   reproducción continua automática, pausa y salto libre a cualquier instante.
   ========================================================================= */
(() => {
  'use strict';

  const DUR = 270;                 // 4 min 30 s exactos
  const TAU = Math.PI * 2;
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const C = { ink: '#141413', orange: '#F9572A', blue: '#0284C7', red: '#E5172F', bg: '#F4F4F0', paper: '#FFFFFF' };
  const clamp  = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp   = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const fmt    = s => { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const MONO = '"JetBrains Mono", Consolas, monospace';
  const BODY = '"Space Grotesk", "Segoe UI", sans-serif';

  if (!window.gsap) { document.body.innerHTML = '<p style="color:#fff;padding:40px;font:20px sans-serif">No se pudo cargar GSAP.</p>'; return; }

  /* ---------------------------------------------------------------- KaTeX */
  $$('[data-tex]').forEach(el => {
    const tex = el.dataset.tex;
    if (window.katex) {
      try { katex.render(tex, el, { throwOnError: false, strict: false }); }
      catch (e) { el.textContent = tex; }
    } else el.textContent = tex;
  });

  // Garantiza que ninguna ecuación se recorte jamás dentro de su tarjeta
  function fitEquations() {
    $$('.card .eq').forEach(el => {
      el.style.transform = '';
      const parent = el.parentElement;
      if (!parent) return;
      const cs = getComputedStyle(parent);
      const avail = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 6;
      const w = Math.max(el.scrollWidth, el.offsetWidth);
      if (avail > 0 && w > avail) el.style.transform = `scale(${(avail / w).toFixed(3)})`;
    });
  }

  /* ---------------------------------------------------------------- Canvas */
  const canvases = [];
  function regCanvas(id, maxRatio = 2) {
    const el = document.getElementById(id);
    const w = +el.getAttribute('width'), h = +el.getAttribute('height');
    el.style.width = w + 'px'; el.style.height = h + 'px';
    const c = { el, ctx: el.getContext('2d'), w, h, r: 0, maxRatio };
    canvases.push(c);
    return c;
  }
  const cv = {
    bg:     regCanvas('bg', 1.5),
    vision: regCanvas('cvVision'),
    touch:  regCanvas('cvTouch'),
    tissue: regCanvas('cvTissue'),
    graph:  regCanvas('cvGraph')
  };
  function setRatio(r) {
    canvases.forEach(c => {
      const rr = Math.min(r, c.maxRatio);
      if (c.r === rr) return;
      c.r = rr;
      c.el.width = Math.round(c.w * rr);
      c.el.height = Math.round(c.h * rr);
      c.ctx.setTransform(rr, 0, 0, rr, 0, 0);
    });
  }

  /* ---------------------------------------------------------------- Escalado */
  const vp = $('#viewport'), stage = $('#stage');
  let prompterReady = false;
  function fit() {
    const s = Math.min(vp.clientWidth / 1920, vp.clientHeight / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
    const dpr = window.devicePixelRatio || 1;
    setRatio(Math.round(clamp(dpr * s, 1, 2) * 4) / 4);
    fitEquations();
    if (prompterReady) scrollPrompter();
  }
  new ResizeObserver(fit).observe(vp);
  window.addEventListener('resize', fit);

  /* ---------------------------------------------------------------- Estado animable determinista */
  const S_INIT = {
    approach: 0, pen: 0, labM: 0, labV: 0, springA: 0, damperA: 0, dxA: 0, forceA: 0, velA: 0,
    fk: 0, fb: 0, ft: 0, g1: 0, g2: 0, gAnn: 0,
    path1: 0, path2: 0, packets1: 0, packets2: 0, cubic: 0,
    check: 0, typed: 0, motor: 0
  };
  const S = { ...S_INIT };
  const curS = { ...S_INIT };

  /* =================================================================
     LÍNEA DE TIEMPO MAESTRA (0 – 270 s)
     ================================================================= */
  gsap.set('.scene', { autoAlpha: 0 });
  gsap.set('#s1', { autoAlpha: 1 });
  gsap.set('.wipe', { scaleX: 0 });
  gsap.set('#s2Scrim', { autoAlpha: 0 });
  gsap.set(['#k1', '#k2', '#b1', '#b2', '#b3'], { transformOrigin: '0% 50%' });

  const tl = gsap.timeline({ paused: true });
  tl.set(S, { ...S_INIT }, 0);
  const EL = 'elastic.out(1, 0.55)';
  const BK = 'back.out(1.8)';

  function pop(target, at, from = {}, o = {}) {
    const st = o.stagger || 0;
    tl.fromTo(target, { scale: .35, y: 60, x: 0, rotation: 0, ...from },
      { scale: 1, y: 0, x: 0, rotation: o.rot || 0, duration: o.dur || 1.2, ease: o.ease || EL, stagger: st }, at);
    tl.fromTo(target, { autoAlpha: 0 }, { autoAlpha: 1, duration: .25, ease: 'none', stagger: st }, at);
  }
  function out(target, at, o = {}) {
    tl.fromTo(target,
      { autoAlpha: 1, y: 0, scale: 1 },
      { autoAlpha: 0, y: o.y ?? -50, scale: o.scale ?? .92, duration: o.dur || .45, ease: 'power2.in', stagger: o.stagger || 0, immediateRender: false },
      at);
  }
  function sv(props, at, dur = 1, ease = 'power2.inOut') {
    const fromVars = {};
    for (const k of Object.keys(props)) { fromVars[k] = curS[k]; curS[k] = props[k]; }
    tl.fromTo(S, fromVars, { ...props, duration: dur, ease, immediateRender: false }, at);
  }
  function slideUp(target, at, dur = .9) {
    tl.fromTo(target, { yPercent: 125 }, { yPercent: 0, duration: dur, ease: 'expo.out' }, at);
  }
  // Cortinilla de 3 colores: 100 % determinista ante cualquier salto en la barra
  function wipeTo(from, to, boundary) {
    const p = $$('.wipe');
    const tIn = boundary - .68, tSwap = boundary - .12, tOut = boundary - .08;
    tl.fromTo(p,
      { transformOrigin: '0% 50%', scaleX: 0 },
      { transformOrigin: '0% 50%', scaleX: 1, duration: .44, ease: 'power3.inOut', stagger: .06, immediateRender: false },
      tIn);
    tl.fromTo(from, { autoAlpha: 1 }, { autoAlpha: 0, duration: .01, ease: 'none', immediateRender: false }, tSwap);
    tl.fromTo(to,   { autoAlpha: 0 }, { autoAlpha: 1, duration: .01, ease: 'none', immediateRender: false }, tSwap);
    tl.fromTo(p,
      { transformOrigin: '100% 50%', scaleX: 1 },
      { transformOrigin: '100% 50%', scaleX: 0, duration: .44, ease: 'power3.inOut', stagger: { each: .06, from: 'end' }, immediateRender: false },
      tOut);
  }
  function sectionIntro(id, at) {
    pop(`${id} .sec-num`, at, { scale: 2.4, y: 0 }, { dur: 1.2 });
    pop(`${id} .sec-title span`, at + .3, { y: 90, scale: .9 }, { stagger: .18, ease: BK, dur: .9 });
    pop(`${id} .sec-sub`, at + 1.1, { y: 40 }, { dur: .9 });
    out(id, at + 4.3, { y: -80, scale: 1.05 });
  }

  /* --------------------------- ESCENA 1 · INTRODUCCIÓN (0 – 50) --------- */
  pop('#s1Kicker', .2, { y: -40 });
  slideUp('#s1L1', .5);
  slideUp('#s1L2', .8);
  pop('#s1Sub', 1.3, { y: 40, scale: .8 }, { ease: BK, dur: .8 });
  pop('#s1Badge', 1.8, { rotation: -14, scale: .2 }, { dur: 1.3 });
  pop('#s1Authors > *', 2.4, { y: 36, scale: .6 }, { stagger: .12, ease: BK, dur: .8 });
  tl.fromTo('#s1Badge', { scale: 1 }, { scale: 1.08, duration: .22, yoyo: true, repeat: 3, ease: 'power1.inOut', immediateRender: false }, 4.6);
  tl.fromTo(['#s1L1', '#s1L2'], { yPercent: 0 }, { yPercent: -125, duration: .6, ease: 'power3.in', stagger: .08, immediateRender: false }, 7.0);
  out(['#s1Kicker', '#s1Sub', '#s1Badge', '#s1Authors'], 7.0, { y: 40 });

  pop('#s1Head', 7.9, { x: -80, y: 0, scale: .8 }, { ease: BK, dur: .8 });
  pop('#slotVision', 8.3, { x: -260, y: 40, rotation: -6, scale: .8 }, { dur: 1.4 });
  pop('#slotTouch', 19.6, { x: 260, y: 40, rotation: 6, scale: .8 }, { dur: 1.4 });
  pop('#vsBadge', 20.6, { scale: 0, rotation: -180, y: 0 }, { dur: 1.2 });
  pop('#alert', 31.6, { y: 160, scale: .9 }, { dur: 1.2 });
  pop('#s1Sticker', 35.5, { rotation: -40, scale: 0, y: 0 }, { rot: 5 });
  out(['#s1Head', '#slotVision', '#vsBadge', '#slotTouch', '#s1Sticker', '#alert'], 48.5, { stagger: .06, y: 60 });
  wipeTo('#s1', '#s2', 50);

  /* --------------------------- ESCENA 2 · TEORÍA (50 – 125) ------------- */
  sectionIntro('#s2Intro', 50.3);
  pop('#s2Head', 55.5, { x: -80, y: 0, scale: .8 }, { ease: BK, dur: .8 });
  pop('#s2Card', 55.9, { y: 120, scale: .85 }, { dur: 1.4 });
  sv({ approach: 1 }, 57.2, 2.2);
  sv({ pen: 1 }, 59.4, 2.2);
  sv({ labM: 1 }, 60.3, .6, 'back.out(2.5)');
  sv({ labV: 1 }, 68.8, .6, 'back.out(2.5)');

  // Superpone cada ecuación en grande en el centro y luego la acopla a la derecha
  function eqPop(sel, at, top, h) {
    const dx = 960 - (1124 + 362), dy = 540 - (top + h / 2);
    tl.fromTo('#s2Scrim', { autoAlpha: 0 }, { autoAlpha: 1, duration: .4, immediateRender: false }, at - .2);
    tl.fromTo(sel,
      { autoAlpha: 0, x: dx, y: dy + 90, scale: .3, zIndex: 30 },
      { autoAlpha: 1, x: dx, y: dy, scale: 1.38, zIndex: 30, duration: 1.2, ease: EL },
      at);
    tl.fromTo(sel,
      { x: dx, y: dy, scale: 1.38, zIndex: 30 },
      { x: 0, y: 0, scale: 1, zIndex: 9, duration: 1.2, ease: 'power3.inOut', immediateRender: false },
      at + 5.2);
    tl.fromTo('#s2Scrim', { autoAlpha: 1 }, { autoAlpha: 0, duration: .6, immediateRender: false }, at + 5.2);
  }
  eqPop('#eqHooke', 79.2, 196, 220);
  sv({ springA: 1 }, 80.2, .8);
  sv({ dxA: 1 }, 86.0, .6);
  eqPop('#eqDamp', 94.2, 436, 220);
  sv({ damperA: 1 }, 95.2, .8);
  sv({ velA: 1 }, 100.3, .6);
  eqPop('#eqMaster', 108.2, 676, 304);
  sv({ forceA: 1 }, 109.2, .8);
  pop('#dof span', 115.0, { y: 30, scale: .4 }, { stagger: .15, ease: BK, dur: .6 });
  pop('#s2Sticker', 121.0, { rotation: 25, scale: 0, y: 0 }, { rot: -3 });
  tl.fromTo('#eqMaster', { scale: 1 }, { scale: 1.05, duration: .3, yoyo: true, repeat: 1, ease: 'power1.inOut', immediateRender: false }, 121.6);
  out(['#s2Head', '#s2Card', '#eqHooke', '#eqDamp', '#eqMaster'], 123.6, { stagger: .05 });
  wipeTo('#s2', '#s3', 125);

  /* --------------------------- ESCENA 3 · SIMULACIÓN (125 – 215) -------- */
  sectionIntro('#s3Intro', 125.3);
  pop('#s3Head', 129.8, { x: -80, y: 0, scale: .8 }, { ease: BK, dur: .8 });
  pop('#params .param', 131.8, { y: 40, scale: .5 }, { stagger: 2.7, ease: BK, dur: .7 });

  pop('#calc1', 143.8, { y: 120, rotation: -4, scale: .7 }, { dur: 1.3 });
  pop('#sub1', 145.6, { x: -40, y: 0, scale: .9 }, { ease: BK, dur: .6 });
  sv({ fk: -4.8 }, 147.0, 2.4, 'power2.out');
  pop('#calc2', 151.8, { y: 120, rotation: 4, scale: .7 }, { dur: 1.3 });
  pop('#sub2', 153.4, { x: -40, y: 0, scale: .9 }, { ease: BK, dur: .6 });
  sv({ fb: -1.5 }, 155.0, 2.0, 'power2.out');
  pop('#calc3', 158.8, { y: 120, rotation: -4, scale: .7 }, { dur: 1.3 });
  pop('#sub3', 160.2, { x: -40, y: 0, scale: .9 }, { ease: BK, dur: .6 });
  sv({ ft: -6.3 }, 161.2, 2.6, 'power2.out');
  tl.fromTo('#calc3', { scale: 1 }, { scale: 1.06, duration: .25, yoyo: true, repeat: 1, ease: 'power1.inOut', immediateRender: false }, 163.9);
  pop('#signNote', 165.0, { y: 50, scale: .8 }, { ease: BK, dur: .8 });
  out(['#params', '#calc1', '#calc2', '#calc3', '#signNote'], 167.2, { stagger: .06, y: -60 });

  pop('#graphCard', 168.0, { y: 140, scale: .85 }, { dur: 1.3 });
  pop('#leg1', 169.0, { x: 30, y: 0, scale: .8 }, { ease: BK, dur: .6 });
  sv({ g1: 1 }, 169.2, 7.5, 'none');
  pop('#leg2', 177.4, { x: 30, y: 0, scale: .8 }, { ease: BK, dur: .6 });
  sv({ g2: 1 }, 177.6, 7.5, 'none');
  sv({ gAnn: 1 }, 183.2, .8);
  out(['#s3Head', '#graphCard'], 187.3, { y: -60 });

  pop('#s3Head2', 188.4, { x: -80, y: 0, scale: .8 }, { ease: BK, dur: .8 });
  pop('#node1', 189.0, { x: -120, y: 0, rotation: -5, scale: .7 }, { dur: 1.3 });
  tl.fromTo('#pipeGhost', { autoAlpha: 0 }, { autoAlpha: 1, duration: .6 }, 189.2);
  sv({ path1: 1 }, 196.0, 1.8);
  sv({ packets1: 1 }, 197.6, .5);
  pop('#node2', 197.8, { y: -120, scale: .7 }, { dur: 1.3 });
  pop('#ar0', 199.2, { x: -40, y: 0, scale: .9 }, { ease: BK, dur: .6 });
  pop('#ar1', 201.4, { x: -40, y: 0, scale: .9 }, { ease: BK, dur: .6 });
  pop('#ar2', 203.4, { x: -40, y: 0, scale: .9 }, { ease: BK, dur: .6 });
  pop('#ar3', 205.2, { scale: 0, rotation: -10, y: 0 }, { dur: 1.1 });
  sv({ path2: 1 }, 206.8, 1.6);
  pop('#node3', 208.4, { x: 120, y: 0, rotation: 5, scale: .7 }, { dur: 1.3 });
  sv({ packets2: 1 }, 208.8, .5);
  sv({ cubic: 1 }, 209.4, 2.6, 'power1.inOut');
  pop('#tagline', 210.8, { y: 60, scale: .8 }, { ease: BK, dur: .9 });
  out(['#s3Head2', '#pipeGhost', '#node1', '#node2', '#node3', '#tagline'], 213.7, { stagger: .04, y: 50 });
  sv({ packets1: 0, packets2: 0 }, 213.7, .35);
  wipeTo('#s3', '#s4', 215);

  /* --------------------------- ESCENA 4 · CONCLUSIONES (215 – 270) ------ */
  sectionIntro('#s4Intro', 215.3);
  tl.fromTo('#k1', { autoAlpha: 0, scale: 2.6 }, { autoAlpha: 1, scale: 1, duration: .7, ease: 'expo.out' }, 219.1);
  pop('#k2', 219.8, { x: -300, y: 0, rotation: -6, scale: .8 }, { dur: 1.3 });
  pop('#shield', 220.6, { scale: 0, rotation: -30, y: 0 }, { dur: 1.4 });
  sv({ check: 1 }, 221.6, .8, 'power2.out');
  pop('#st1', 222.8, { y: 120, scale: .7 }, { dur: 1.2 });
  pop('#st2', 224.8, { y: 120, scale: .7 }, { dur: 1.2 });
  pop('#st3', 226.8, { y: 120, scale: .7 }, { dur: 1.2 });
  pop('#kline', 230.2, { y: 60, scale: .9 }, { ease: BK, dur: .8 });
  pop('#verbs .chip', 231.6, { y: 40, scale: .5 }, { stagger: 1.6, ease: BK, dur: .7 });
  out(['#k1', '#k2', '#shield', '#st1', '#st2', '#st3', '#kline', '#verbs'], 239.2, { stagger: .04, y: -60 });

  pop('#s4chip', 240.1, { x: -60, y: 0, scale: .8 }, { ease: BK, dur: .7 });
  tl.fromTo('#b1', { autoAlpha: 0, scale: 2.2 }, { autoAlpha: 1, scale: 1, duration: .6, ease: 'expo.out' }, 241.0);
  tl.fromTo('#b2', { autoAlpha: 0, x: -400 }, { autoAlpha: 1, x: 0, duration: 1.1, ease: EL }, 242.4);
  pop('#b3', 243.6, { y: 80, rotation: -3, scale: .7 }, { dur: 1.3 });
  pop('#codeCard', 244.6, { y: 140, scale: .8 }, { dur: 1.3 });
  sv({ typed: 1 }, 245.6, 6.6, 'none');
  pop('#bigArrow', 252.2, { x: -60, y: 0, scale: .3 }, { dur: 1 });
  pop('#motorCard', 252.6, { x: 140, y: 0, rotation: 5, scale: .7 }, { dur: 1.3 });
  sv({ motor: 1 }, 253.4, 2.2, 'power2.out');
  pop('#motorChips .chip', 255.6, { y: 30, scale: .4 }, { stagger: 1.8, ease: BK, dur: .7 });
  out(['#s4chip', '#b1', '#b2', '#b3', '#codeCard', '#bigArrow', '#motorCard'], 261.3, { stagger: .04, y: -60 });

  tl.fromTo('#finalMs', { autoAlpha: 0, scale: 3 }, { autoAlpha: 1, scale: 1, duration: .8, ease: 'expo.out' }, 262.2);
  tl.fromTo('#finalBar', { autoAlpha: 0, scaleX: 0 }, { autoAlpha: 1, scaleX: 1, duration: 1, ease: 'expo.inOut' }, 263.0);
  pop('#finalSub', 263.6, { y: 60, scale: .8 }, { dur: 1.2 });
  pop('#finalThanks', 265.6, { y: 40, scale: .5 }, { ease: BK, dur: .8 });
  pop('#finalCred', 267.0, { y: 40, scale: .8 }, { ease: BK, dur: .8 });
  tl.fromTo('#finalMs', { scale: 1 }, { scale: 1.04, duration: .35, yoyo: true, repeat: 3, ease: 'power1.inOut', immediateRender: false }, 268.0);

  tl.set({}, {}, DUR); // duración exacta 4:30

  /* =================================================================
     UTILIDADES DE DIBUJO
     ================================================================= */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function grid(ctx, w, h, s, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = s; x < w; x += s) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); }
    for (let y = s; y < h; y += s) { ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); }
    ctx.stroke();
  }
  // Bisturí sólido con la punta en (0,0) apuntando hacia abajo
  function scalpel(ctx, x, y, ang, s) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-20, -38, -12, -78);
    ctx.lineTo(10, -78); ctx.lineTo(10, -34);
    ctx.quadraticCurveTo(8, -12, 0, 0);
    ctx.closePath();
    ctx.fillStyle = '#E2E2DC'; ctx.fill();
    ctx.lineWidth = 3.5; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, -20); ctx.quadraticCurveTo(-10, -45, -6, -70);
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = C.ink; rr(ctx, -9, -96, 22, 20, 4); ctx.fill();
    rr(ctx, -11, -250, 26, 156, 10); ctx.fill();
    ctx.fillStyle = C.orange;
    for (let i = 0; i < 5; i++) { rr(ctx, -11, -232 + i * 14, 26, 6, 3); ctx.fill(); }
    ctx.restore();
  }
  // Silueta fantasma del bisturí en la posición real de la mano (P_mano)
  function scalpelGhost(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-20, -38, -12, -78);
    ctx.lineTo(10, -78); ctx.lineTo(10, -34);
    ctx.quadraticCurveTo(8, -12, 0, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(249,87,42,.18)'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = C.orange; ctx.stroke();
    rr(ctx, -11, -250, 26, 172, 10);
    ctx.fillStyle = 'rgba(249,87,42,.10)'; ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  // Píldora con texto y subíndices: parts = [{t:'P'},{t:'mano',sub:1}]
  function pill(ctx, x, y, parts, o = {}) {
    const size = o.size || 26, align = o.align || 'left';
    const fMain = `700 ${size}px ${BODY}`, fSub = `700 ${Math.round(size * .62)}px ${BODY}`;
    let W = 0;
    parts.forEach(p => { ctx.font = p.sub ? fSub : fMain; p.w = ctx.measureText(p.t).width; W += p.w; });
    const padX = 16, H = size + 18, bw = W + padX * 2;
    const x0 = align === 'right' ? x - bw : align === 'center' ? x - bw / 2 : x;
    const y0 = y - H / 2;
    ctx.fillStyle = C.ink; rr(ctx, x0 + 4, y0 + 4, bw, H, H / 2); ctx.fill();
    ctx.fillStyle = o.bg || C.paper; rr(ctx, x0, y0, bw, H, H / 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
    let cx = x0 + padX;
    ctx.fillStyle = o.fg || C.ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    parts.forEach(p => { ctx.font = p.sub ? fSub : fMain; ctx.fillText(p.t, cx, p.sub ? y + size * .24 : y + 1); cx += p.w; });
  }
  function arrow(ctx, x1, y1, x2, y2, col, wid = 6, head = 20) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = wid; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(a) * head * .7, y2 - Math.sin(a) * head * .7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - .45) * head, y2 - Math.sin(a - .45) * head);
    ctx.lineTo(x2 - Math.cos(a + .45) * head, y2 - Math.sin(a + .45) * head);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = C.ink; ctx.stroke();
  }
  function spring(ctx, x, y1, y2, coils, wid) {
    const lead = 10, n = coils * 2, seg = (y2 - y1 - 2 * lead) / n;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y1 + lead);
    for (let i = 0; i < n; i++) ctx.lineTo(x + (i % 2 ? -wid : wid), y1 + lead + seg * (i + .5));
    ctx.lineTo(x, y2 - lead); ctx.lineTo(x, y2); ctx.stroke();
  }
  function damper(ctx, x, y1, y2, wid) {
    const L = y2 - y1, a = y1 + 8, cylH = L * .6, plate = a + L * .42;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(2,132,199,.22)'; ctx.fillRect(x - wid, a, wid * 2, cylH);
    ctx.strokeStyle = C.blue; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, a);
    ctx.moveTo(x - wid, a + cylH); ctx.lineTo(x - wid, a); ctx.lineTo(x + wid, a); ctx.lineTo(x + wid, a + cylH);
    ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.beginPath(); ctx.moveTo(x - wid + 5, plate); ctx.lineTo(x + wid - 5, plate);
    ctx.moveTo(x, plate); ctx.lineTo(x, y2); ctx.stroke();
  }
  function marker(ctx, x, y, col, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a);
    const r = 12 * a;
    ctx.beginPath(); ctx.arc(x, y, r + 6, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = col; ctx.fill();
    ctx.restore();
  }

  /* =================================================================
     FONDO · cuadrícula radial giratoria
     ================================================================= */
  function drawBG(c, t) {
    const { ctx, w, h } = c;
    ctx.clearRect(0, 0, w, h);
    const a = t * .05;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(20,20,19,.065)';
    ctx.beginPath();
    for (let r = 90; r < 1150; r += 90) { ctx.moveTo(r, 0); ctx.arc(0, 0, r, 0, TAU); }
    ctx.stroke();
    ctx.rotate(a);
    ctx.beginPath();
    for (let i = 0; i < 36; i++) {
      const g = i * TAU / 36;
      ctx.moveTo(Math.cos(g) * 90, Math.sin(g) * 90);
      ctx.lineTo(Math.cos(g) * 1150, Math.sin(g) * 1150);
    }
    ctx.stroke();
    // marcas en el anillo de 1 kHz
    ctx.strokeStyle = 'rgba(20,20,19,.16)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 120; i++) {
      const g = i * TAU / 120, r1 = 540, r2 = i % 10 === 0 ? 566 : 552;
      ctx.moveTo(Math.cos(g) * r1, Math.sin(g) * r1); ctx.lineTo(Math.cos(g) * r2, Math.sin(g) * r2);
    }
    ctx.stroke();
    ctx.rotate(-a * 2.6);
    ctx.setLineDash([16, 22]); ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(249,87,42,.20)'; ctx.beginPath(); ctx.arc(0, 0, 400, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(2,132,199,.16)'; ctx.beginPath(); ctx.arc(0, 0, 720, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* =================================================================
     ESCENA 1 · Vista 60 Hz  vs  Tacto 1 000 Hz / 50 Hz
     ================================================================= */
  const ALERT_T = 31;
  const hzAt  = tt => smooth(clamp((tt - ALERT_T) / .8, 0, 1));
  const dSm   = tt => 30 + 18 * Math.sin(tt * 2.1) + 5 * Math.sin(tt * 5.3);
  const STEP  = .18;                                  // 20 ms en cámara lenta didáctica
  const held  = tt => dSm(Math.floor(tt / STEP) * STEP);
  const jit   = tt => 9 * Math.sin(tt * 53) * Math.sin(tt * 7.3) + 5 * Math.sin(tt * 91.7);
  const dAt   = tt => { const k = hzAt(tt); return k <= 0 ? dSm(tt) : lerp(dSm(tt), held(tt) + jit(tt), k); };

  function drawVision(c, t) {
    const { ctx, w, h } = c;
    ctx.fillStyle = '#EAF5FB'; ctx.fillRect(0, 0, w, h);
    grid(ctx, w, h, 40, 'rgba(2,132,199,.13)');

    // Campo quirúrgico virtual: guía de incisión completa sobre tejido virtual
    const P = tt => ({ x: w / 2 + 265 * Math.sin(tt * 1.1), y: 248 + 52 * Math.sin(tt * 2.2) });
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(w / 2, 248, 330, 96, 0, 0, TAU);
    ctx.fillStyle = 'rgba(252,213,197,.55)'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(20,20,19,.22)'; ctx.stroke();
    ctx.setLineDash([9, 9]);
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const u = i / 120 * TAU / 1.1;
      const gp = P(u);
      i ? ctx.lineTo(gp.x, gp.y) : ctx.moveTo(gp.x, gp.y);
    }
    ctx.strokeStyle = 'rgba(2,132,199,.28)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) { const p = P(t - i * .015); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    ctx.strokeStyle = C.blue; ctx.lineWidth = 7; ctx.stroke();
    for (let k = 5; k >= 1; k--) {
      const p = P(t - k * .1);
      ctx.globalAlpha = .08 + .04 * (5 - k);
      scalpel(ctx, p.x, p.y, -.35 * Math.cos((t - k * .1) * 1.1), .55);
    }
    ctx.globalAlpha = 1;
    const p = P(t);
    scalpel(ctx, p.x, p.y, -.35 * Math.cos(t * 1.1), .55);

    // Tira de cuadros a 60 FPS (16.7 ms)
    const sy = 356, sh = 84, cw = 100, off = (t * 50) % cw;
    ctx.fillStyle = C.ink; ctx.fillRect(0, sy, w, sh);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 15px ${MONO}`;
    for (let x = -off; x < w; x += cw) {
      ctx.fillStyle = '#EAF5FB'; rr(ctx, x + 8, sy + 17, cw - 16, sh - 34, 6); ctx.fill();
      ctx.fillStyle = '#F4F4F0';
      for (let s = 0; s < 3; s++) { ctx.fillRect(x + 14 + s * 28, sy + 4, 14, 7); ctx.fillRect(x + 14 + s * 28, sy + sh - 11, 14, 7); }
      ctx.fillStyle = C.blue; ctx.fillText('16.7 ms', x + cw / 2, sy + sh / 2 + 1);
    }
    ctx.textAlign = 'left'; ctx.font = `800 17px ${MONO}`;
    ctx.fillStyle = C.blue; ctx.beginPath(); ctx.arc(24, 28, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = C.ink; ctx.fillText('MONITOR QUIRÚRGICO · 60 FPS ✓ FLUIDO', 40, 29);
    ctx.textAlign = 'right';
    ctx.fillText('FRAME ' + String(Math.floor(t * 60)).padStart(5, '0'), w - 20, 29);
  }

  function drawTouch(c, t) {
    const { ctx, w, h } = c;
    const k = hzAt(t);
    const split = 262, y0 = 140;
    ctx.fillStyle = '#FFF6F1'; ctx.fillRect(0, 0, w, h);
    const d = dAt(t);
    const tx = w / 2 + k * 8 * Math.sin(t * 67);
    const surf = (x, off) => y0 + off + d * Math.exp(-off / 90) * Math.exp(-(((x - tx) / (70 + off)) ** 2));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, split); ctx.clip();
    grid(ctx, w, split, 40, 'rgba(249,87,42,.10)');
    [[0, '#FCD5C5'], [38, '#FBB096'], [86, '#F98563']].forEach(([off, col], i) => {
      ctx.beginPath(); ctx.moveTo(0, split);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, surf(x, off));
      ctx.lineTo(w, split); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) x ? ctx.lineTo(x, surf(x, off)) : ctx.moveTo(x, surf(x, off));
      ctx.lineWidth = i ? 1.5 : 4; ctx.strokeStyle = i ? 'rgba(20,20,19,.25)' : C.ink; ctx.stroke();
    });
    if (k > .05) {
      ctx.strokeStyle = C.red; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const ph = (t * 3 + i / 3) % 1;
        ctx.globalAlpha = k * (1 - ph);
        ctx.beginPath(); ctx.ellipse(tx, y0 + d, 20 + ph * 84, 6 + ph * 22, 0, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    scalpel(ctx, tx, y0 + d - 2, k * .08 * Math.sin(t * 71), .55);

    // Vector de fuerza de reacción sobre el bisturí robótico
    const fLen = clamp(24 + d * 1.45, 24, 118);
    const fCol = k > .5 ? C.red : C.blue;
    arrow(ctx, tx + 54, y0 + d - 8, tx + 54, y0 + d - 8 - fLen, fCol, 6, 18);
    ctx.font = `800 15px ${MONO}`; ctx.fillStyle = fCol; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(k > .5 ? 'F tardía!' : 'F estable', tx + 68, y0 + d - 8 - fLen * .5);

    ctx.font = `800 16px ${MONO}`; ctx.textAlign = 'left';
    ctx.fillStyle = C.ink; ctx.fillText('BISTURÍ ROBÓTICO · TEJIDO BLANDO', 18, 24);
    ctx.textAlign = 'right'; ctx.fillStyle = k > .5 ? C.red : C.orange;
    ctx.fillText(k > .5 ? '⚠ ALERTA 50 Hz' : 'LAZO 1,000 Hz', w - 18, 24);
    ctx.restore();

    // Gráfica F(t)
    ctx.fillStyle = C.ink; ctx.fillRect(0, split, w, 4);
    const gy0 = split + 4, gh = h - gy0;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, gy0, w, gh);
    grid(ctx, w, gh, 30, 'rgba(20,20,19,.06)');
    const WIN = 4, mapY = v => gy0 + gh - 16 - clamp((v + 5) / 75, 0, 1) * (gh - 44);
    ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    let curRed = null;
    ctx.beginPath();
    for (let px = 0; px <= w; px += 2) {
      const tt = t - WIN + px / w * WIN;
      const red = tt > ALERT_T + .4;
      const y = mapY(dAt(tt));
      if (red !== curRed) {
        if (curRed !== null) { ctx.lineTo(px, y); ctx.strokeStyle = curRed ? C.red : C.blue; ctx.stroke(); ctx.beginPath(); }
        curRed = red; ctx.moveTo(px, y);
      } else ctx.lineTo(px, y);
    }
    ctx.strokeStyle = curRed ? C.red : C.blue; ctx.stroke();
    ctx.font = `800 16px ${MONO}`; ctx.textBaseline = 'middle';
    ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.fillText('F(t) → mano', 14, gy0 + 20);
    ctx.textAlign = 'right'; ctx.fillStyle = k > .5 ? C.red : C.blue;
    ctx.fillText(k > .5 ? 'Δt = 20 ms ⚠ VIBRACIÓN' : 'Δt = 1 ms ✓ ESTABLE', w - 14, gy0 + 20);
    if (k > 0) { ctx.fillStyle = `rgba(229,23,47,${(k * (.05 + .05 * Math.sin(t * 14))).toFixed(3)})`; ctx.fillRect(0, 0, w, h); }
  }

  const touchCard = $('#touchCard'), touchHead = $('#touchHead'), touchHz = $('#touchHz'),
        touchMs = $('#touchMs'), touchMsg = $('#touchMsg'), alertTint = $('#alertTint');
  let touchRed = null;
  function setTouchMode(red) {
    if (red === touchRed) return;
    touchRed = red;
    touchHead.classList.toggle('red', red);
    touchHead.classList.toggle('orange', !red);
    touchHz.textContent = red ? '50 Hz' : '1,000 Hz';
    touchMs.textContent = red ? '20 ms' : '1 ms';
    touchMs.style.color = red ? C.red : '';
    touchMsg.innerHTML = red ? 'entre correcciones · el bisturí <b>vibra y rebota</b>' : 'por actualización · contacto <b>sólido y estable</b>';
  }

  /* =================================================================
     ESCENA 2 · Tejido virtual, P_mano, P_virtual, resorte y amortiguador
     ================================================================= */
  function drawTissue(c, t) {
    const { ctx, w, h } = c;
    ctx.fillStyle = '#FFFDF8'; ctx.fillRect(0, 0, w, h);
    grid(ctx, w, h, 50, 'rgba(20,20,19,.05)');
    const y0 = 300, cx = 458;
    const lt = t - 61.6;
    const depth = S.pen * (125 + 54 * Math.sin(lt * .9));
    const vel = S.pen * 54 * .9 * Math.cos(lt * .9);          // px/s
    const handY = y0 - (1 - S.approach) * 118 + depth;
    const pen = Math.max(0, handY - y0);
    const dent = Math.min(pen * .22, 36);
    const contact = pen > .5;
    const pm = { x: cx, y: handY };
    const pv = { x: cx, y: contact ? y0 + dent : handY };

    const layers = [
      { off: 0,   col: '#FCD9CB', name: 'PIEL' },
      { off: 60,  col: '#FBB89F', name: 'GRASA' },
      { off: 165, col: '#F98C6B', name: 'MÚSCULO' },
      { off: 360, col: '#ECE6DA', name: 'HUESO' }
    ];
    const surfY = (x, off) => y0 + off + dent * Math.exp(-off / 170) * Math.exp(-(((x - cx) / (120 + off * .5)) ** 2));
    layers.forEach((l, i) => {
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) ctx.lineTo(x, surfY(x, l.off));
      ctx.lineTo(w, h); ctx.closePath();
      ctx.fillStyle = l.col; ctx.fill();
      if (i === 3) {
        ctx.save(); ctx.clip();
        ctx.strokeStyle = 'rgba(20,20,19,.16)'; ctx.lineWidth = 2; ctx.beginPath();
        for (let x = -h; x < w; x += 22) { ctx.moveTo(x, h); ctx.lineTo(x + h, 0); }
        ctx.stroke(); ctx.restore();
      }
      if (i === 2) {
        ctx.strokeStyle = 'rgba(20,20,19,.10)'; ctx.lineWidth = 2; ctx.beginPath();
        for (let r = 1; r < 6; r++) {
          const yy = y0 + 165 + r * 32;
          for (let x = 0; x <= w; x += 10) { const y = yy + 4 * Math.sin(x * .03 + r); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        }
        ctx.stroke();
      }
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) { const y = surfY(x, l.off); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.lineWidth = i === 0 ? 5 : 2; ctx.strokeStyle = i === 0 ? C.ink : 'rgba(20,20,19,.3)'; ctx.stroke();
      ctx.fillStyle = 'rgba(20,20,19,.55)'; ctx.font = `800 16px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(l.name, 24, y0 + l.off + 28);
    });

    // Silueta fantasma de la herramienta real penetrando el tejido
    const gap = pm.y - pv.y;
    if (contact && gap > 10) scalpelGhost(ctx, pm.x, pm.y);

    // Resorte + amortiguador entre P_virtual y P_mano
    if (contact && gap > 6) {
      const sx = cx - 40, dx = cx + 40;
      const A = Math.max(S.springA, S.damperA);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (A > 0) {
        ctx.globalAlpha = A; ctx.strokeStyle = C.ink; ctx.lineWidth = 5;
        const x2 = S.damperA > 0 ? dx : cx;
        ctx.beginPath(); ctx.moveTo(sx, pv.y); ctx.lineTo(x2, pv.y); ctx.moveTo(sx, pm.y); ctx.lineTo(x2, pm.y); ctx.stroke();
      }
      if (S.springA > 0) { ctx.globalAlpha = S.springA; ctx.strokeStyle = C.orange; ctx.lineWidth = 5; spring(ctx, sx, pv.y, pm.y, 6, 15); }
      if (S.damperA > 0) { ctx.globalAlpha = S.damperA; damper(ctx, dx, pv.y, pm.y, 15); }
      ctx.globalAlpha = 1;
      if (S.labM > 0 && S.springA <= 0) {
        ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(20,20,19,.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, pv.y); ctx.lineTo(cx, pm.y); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // Avatar god-object (siempre sobre la superficie)
    scalpel(ctx, pv.x, pv.y, 0, 1);

    // Marcadores P_mano y P_virtual
    if (S.labM > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, S.labM);
      ctx.strokeStyle = C.orange; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pm.x - 30, pm.y); ctx.lineTo(pm.x + 30, pm.y); ctx.moveTo(pm.x, pm.y - 30); ctx.lineTo(pm.x, pm.y + 30); ctx.stroke();
      ctx.restore();
    }
    marker(ctx, pm.x, pm.y, C.orange, S.labM);
    marker(ctx, pv.x, pv.y, C.blue, S.labV);

    // Etiquetas y vectores físicos
    ctx.save();
    if (S.labM > 0) {
      ctx.globalAlpha = Math.min(1, S.labM);
      pill(ctx, cx - 64, pm.y, [{ t: 'P' }, { t: 'mano', sub: 1 }], { align: 'right', bg: C.orange, fg: '#fff' });
      ctx.fillStyle = C.ink; ctx.font = `700 15px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText('mano real del cirujano', cx - 64, pm.y + 40);
    }
    if (S.labV > 0) {
      ctx.globalAlpha = Math.min(1, S.labV);
      pill(ctx, cx + 62, pv.y - 50, [{ t: 'P' }, { t: 'virtual', sub: 1 }, { t: ' · god-object' }], { align: 'left', bg: C.blue, fg: '#fff' });
      ctx.fillStyle = C.ink; ctx.font = `700 15px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('avatar · nunca atraviesa la superficie', cx + 62, pv.y - 12);
    }
    if (S.dxA > 0 && contact && gap > 20) {
      ctx.globalAlpha = S.dxA;
      const bx = cx + 112;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx - 10, pv.y + 6); ctx.lineTo(bx + 10, pv.y + 6); ctx.moveTo(bx, pv.y + 6); ctx.lineTo(bx, pm.y);
      ctx.moveTo(bx - 10, pm.y); ctx.lineTo(bx + 10, pm.y); ctx.stroke();
      pill(ctx, bx + 18, (pv.y + pm.y) / 2 + 3, [{ t: 'Δx' }], { size: 24 });
    }
    if (S.velA > 0 && contact && Math.abs(vel) > 4) {
      ctx.globalAlpha = S.velA;
      const vy = pm.y + 46;
      arrow(ctx, cx + 76, vy, cx + 76, vy + vel * 1.1, C.ink, 5, 16);
      pill(ctx, cx + 98, vy + 6, [{ t: 'V' }, { t: 'mano', sub: 1 }], { size: 22 });
    }
    if (S.forceA > 0 && contact && gap > 10) {
      ctx.globalAlpha = S.forceA;
      const ax = cx - 148, L = 30 + gap * 1.1;
      arrow(ctx, ax, pm.y - 36, ax, pm.y - 36 - L, C.blue, 9, 26);
      pill(ctx, ax - 18, pm.y - 36 - L + 10, [{ t: 'F' }, { t: 'háptica', sub: 1 }], { align: 'right', size: 24, bg: C.ink, fg: '#fff' });
      const dxm = gap * 0.03 / 1000;
      const dvm = vel * 0.03 / 1000;
      const F = -(1200 * dxm + 15 * dvm);
      pill(ctx, 22, h - 40, [{ t: `Δx = ${(dxm * 1000).toFixed(1)} mm · F = −${Math.abs(F).toFixed(2)} N` }], { size: 19, bg: C.paper });
    }
    ctx.restore();

    pill(ctx, w - 22, 34, [{ t: contact ? 'CONTACTO: SÍ' : 'CONTACTO: NO' }], { align: 'right', size: 18, bg: contact ? C.orange : C.paper, fg: contact ? '#fff' : C.ink });
  }

  /* =================================================================
     ESCENA 3 · Gráfica 1 000 Hz vs 50 Hz
     ================================================================= */
  const Fs = ms => { const e = 1 - Math.exp(-ms / 30); return 6.3 * e + .35 * Math.sin(ms / 200 * TAU * 3) * e; };
  const stepVal = k => clamp(Fs(k * 20) + (k > 0 ? .17 * k * (k % 2 ? 1 : -1) : 0), 0, 8);

  function drawGraph(c) {
    const { ctx, w, h } = c;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    const L = 110, R = 50, T = 46, B = 82, pw = w - L - R, ph = h - T - B;
    const X = ms => L + ms / 200 * pw, Y = f => T + ph - f / 8 * ph;
    ctx.lineWidth = 1.5; ctx.font = `700 17px ${MONO}`; ctx.fillStyle = 'rgba(20,20,19,.6)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let ms = 0; ms <= 200; ms += 20) {
      ctx.strokeStyle = 'rgba(20,20,19,.08)'; ctx.beginPath(); ctx.moveTo(X(ms), T); ctx.lineTo(X(ms), T + ph); ctx.stroke();
      ctx.fillText(ms, X(ms), T + ph + 12);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let f = 0; f <= 8; f++) {
      ctx.strokeStyle = 'rgba(20,20,19,.08)'; ctx.beginPath(); ctx.moveTo(L, Y(f)); ctx.lineTo(L + pw, Y(f)); ctx.stroke();
      ctx.fillText(f, L - 16, Y(f));
    }
    ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.lineJoin = 'miter';
    ctx.beginPath(); ctx.moveTo(L, T - 14); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw + 24, T + ph); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.font = `800 20px ${MONO}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('t (ms)', L + pw + 20, T + ph + 44);
    ctx.save(); ctx.translate(36, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('|F| (N)', 0, 0); ctx.restore();

    // Línea objetivo 6.3 N
    ctx.setLineDash([10, 10]); ctx.strokeStyle = 'rgba(249,87,42,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(L, Y(6.3)); ctx.lineTo(L + pw, Y(6.3)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.orange; ctx.font = `800 17px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('6.3 N', L + 10, Y(6.3) - 6);

    const g1ms = S.g1 * 200, g2ms = S.g2 * 200;
    // Peine de muestras sobre el eje de tiempo
    ctx.strokeStyle = 'rgba(2,132,199,.6)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let ms = 0; ms <= g1ms; ms += 1) { ctx.moveTo(X(ms), T + ph); ctx.lineTo(X(ms), T + ph - 10); }
    ctx.stroke();
    ctx.strokeStyle = C.red; ctx.lineWidth = 4; ctx.beginPath();
    for (let ms = 0; ms <= g2ms; ms += 20) { ctx.moveTo(X(ms), T + ph); ctx.lineTo(X(ms), T + ph - 26); }
    ctx.stroke();

    ctx.lineCap = 'round';
    if (S.g1 > 0) {
      ctx.beginPath();
      for (let ms = 0; ms <= g1ms; ms += .5) { const x = X(ms), y = Y(Fs(ms)); ms ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = C.blue; ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.stroke();
      if (S.g1 < 1) { ctx.beginPath(); ctx.arc(X(g1ms), Y(Fs(g1ms)), 10, 0, TAU); ctx.fillStyle = C.blue; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke(); }
    }
    if (S.g2 > 0) {
      ctx.beginPath(); ctx.moveTo(X(0), Y(0));
      let last = 0;
      for (let k = 0; k < 10; k++) {
        const a = k * 20; if (a > g2ms) break;
        const b = Math.min((k + 1) * 20, g2ms), v = stepVal(k);
        ctx.lineTo(X(a), Y(v)); ctx.lineTo(X(b), Y(v)); last = v;
      }
      ctx.strokeStyle = C.red; ctx.lineWidth = 6; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'; ctx.stroke();
      if (S.g2 < 1) { ctx.beginPath(); ctx.arc(X(g2ms), Y(last), 10, 0, TAU); ctx.fillStyle = C.red; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke(); }
    }
    if (S.gAnn > 0) {
      ctx.save(); ctx.globalAlpha = S.gAnn;
      const v6 = stepVal(6), by = Y(v6) + 38;
      ctx.strokeStyle = C.red; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(X(120), by - 12); ctx.lineTo(X(120), by); ctx.lineTo(X(140), by); ctx.lineTo(X(140), by - 12); ctx.stroke();
      pill(ctx, X(130), by + 34, [{ t: 'Δt = 20 ms' }], { align: 'center', size: 21, bg: C.red, fg: '#fff' });
      pill(ctx, X(28), Y(7.55), [{ t: '⚠ cada salto = un golpe en la mano' }], { align: 'left', size: 21, bg: C.paper, fg: C.red });
      // Etiqueta azul en zona despejada inferior con flecha hacia la curva de 1 000 Hz
      arrow(ctx, X(166), Y(2.75) - 26, X(152), Y(Fs(152)) + 12, C.blue, 5, 16);
      pill(ctx, X(166), Y(2.75), [{ t: 'Δt = 1 ms → continuo y real' }], { align: 'center', size: 21, bg: C.blue, fg: '#fff' });
      ctx.restore();
    }
  }

  /* =================================================================
     ESCENA 3 · Arquitectura de 3 hilos (SVG)
     ================================================================= */
  const pipe1 = $('#pipe1'), pipe2 = $('#pipe2');
  const len1 = pipe1.getTotalLength(), len2 = pipe2.getTotalLength();
  const packetsG = $('#packets'), NS = 'http://www.w3.org/2000/svg';
  const pk1 = [], pk2 = [];
  for (let i = 0; i < 2; i++) {
    const cc = document.createElementNS(NS, 'circle');
    cc.setAttribute('r', 11); cc.setAttribute('fill', C.orange);
    cc.setAttribute('stroke', C.ink); cc.setAttribute('stroke-width', 4);
    packetsG.appendChild(cc); pk1.push(cc);
  }
  for (let i = 0; i < 5; i++) {
    const cc = document.createElementNS(NS, 'circle');
    cc.setAttribute('r', 9); cc.setAttribute('fill', C.blue);
    cc.setAttribute('stroke', C.ink); cc.setAttribute('stroke-width', 3.5);
    packetsG.appendChild(cc); pk2.push(cc);
  }
  // Curva cúbica (Catmull-Rom → Bézier) del Hilo 3
  (function buildCubic() {
    const pts = [[20, 64], [100, 26], [180, 46], [260, 14], [340, 32]];
    let d = `M${pts[0]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1} ${c2} ${p2}`;
    }
    $('#cubicPath').setAttribute('d', d);
    let ticks = '';
    for (let x = 20; x <= 340; x += 4) ticks += `<line x1="${x}" y1="80" x2="${x}" y2="${x % 80 === 20 ? 70 : 76}"/>`;
    $('#combTicks').innerHTML = ticks;
    $('#cubicDots').innerHTML = pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="7" stroke="#fff" stroke-width="2"/>`).join('');
  })();
  const cubicPath = $('#cubicPath');

  /* =================================================================
     ESCENA 4 · código tecleado + motor
     ================================================================= */
  const CODE = [
    [['c', '// Hilo 3 · lazo háptico a 1 kHz']],
    [['k', 'while'], ['p', ' (robot.'], ['f', 'activo'], ['p', ') {']],
    [['p', '  dx = p_mano - p_virtual;']],
    [['p', '  dv = v_mano - v_virtual;']],
    [['p', '  F  = '], ['o', '-kt*dx - bt*dv'], ['p', ';   '], ['c', '// newtons']],
    [['p', '  motor.'], ['f', 'aplicar'], ['p', '(F);    '], ['c', '// energía real']],
    [['p', '  '], ['f', 'esperar'], ['p', '('], ['n', '1'], ['p', ' ms);']],
    [['p', '}']]
  ];
  const CODE_LEN = CODE.reduce((a, l, idx) => a + l.reduce((b, tk) => b + tk[1].length, 0) + (idx < CODE.length - 1 ? 1 : 0), 0);
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const codeEl = $('#codeTyped');
  let lastTyped = -1;
  function renderCode(n) {
    if (n === lastTyped) return;
    lastTyped = n;
    let left = n, html = '';
    for (let li = 0; li < CODE.length; li++) {
      if (left <= 0) break;
      for (const [cls, txt] of CODE[li]) {
        if (left <= 0) break;
        const part = txt.slice(0, left); left -= part.length;
        html += cls === 'p' ? esc(part) : `<span class="${cls}">${esc(part)}</span>`;
      }
      if (li < CODE.length - 1 && left > 0) { html += '\n'; left--; }
    }
    codeEl.innerHTML = html + '<span class="caret"></span>';
  }
  const rotor = $('#rotor'), fArrow = $('#fArrow'), fRead = $('#fRead'), shieldCheck = $('#shieldCheck');

  /* =================================================================
     BUCLE DE RENDER (lee el tiempo de la línea maestra)
     ================================================================= */
  const fkNum = $('#fkNum'), fbNum = $('#fbNum'), ftNum = $('#ftNum');
  const fkBar = $('#fkBar'), fbBar = $('#fbBar'), ftBar = $('#ftBar');
  const fN = v => (v < -0.0001 ? '−' : '') + Math.abs(v).toFixed(1);
  let lastNums = '';

  function frame() {
    const t = tl.time();
    drawBG(cv.bg, t);

    if (t < 50.2) {
      drawVision(cv.vision, t);
      drawTouch(cv.touch, t);
      const k = hzAt(t);
      touchCard.style.transform = k > .001
        ? `translate(${(k * 5 * Math.sin(t * 83)).toFixed(2)}px, ${(k * 4 * Math.sin(t * 101 + 1)).toFixed(2)}px) rotate(${(k * .5 * Math.sin(t * 57)).toFixed(3)}deg)`
        : '';
      setTouchMode(k > .5);
      alertTint.style.opacity = (k * (.035 + .035 * Math.sin(t * 12))).toFixed(3);
    } else alertTint.style.opacity = 0;

    if (t > 49.8 && t < 125.2) drawTissue(cv.tissue, t);

    if (t > 124.8 && t < 215.2) {
      const nums = S.fk.toFixed(2) + S.fb.toFixed(2) + S.ft.toFixed(2);
      if (nums !== lastNums) {
        lastNums = nums;
        fkNum.textContent = fN(S.fk); fbNum.textContent = fN(S.fb); ftNum.textContent = fN(S.ft);
        fkBar.style.width = Math.abs(S.fk) / 8 * 100 + '%';
        fbBar.style.width = Math.abs(S.fb) / 8 * 100 + '%';
        ftBar.style.width = Math.abs(S.ft) / 8 * 100 + '%';
      }
      if (t > 167.5 && t < 188.2) drawGraph(cv.graph);

      pipe1.style.visibility = S.path1 > 0 ? 'visible' : 'hidden';
      pipe1.style.strokeDashoffset = 1 - S.path1;
      pipe1.setAttribute('marker-end', S.path1 > .98 ? 'url(#arrowHead)' : '');

      pipe2.style.visibility = S.path2 > 0 ? 'visible' : 'hidden';
      pipe2.style.strokeDashoffset = 1 - S.path2;
      pipe2.setAttribute('marker-end', S.path2 > .98 ? 'url(#arrowHead)' : '');

      pk1.forEach((p, i) => {
        p.style.opacity = S.packets1;
        if (S.packets1 > 0) {
          const pt = pipe1.getPointAtLength(((t * .42 + i / pk1.length) % 1) * len1);
          p.setAttribute('cx', pt.x); p.setAttribute('cy', pt.y);
        }
      });
      pk2.forEach((p, i) => {
        p.style.opacity = S.packets2;
        if (S.packets2 > 0) {
          const pt = pipe2.getPointAtLength(((t * .95 + i / pk2.length) % 1) * len2);
          p.setAttribute('cx', pt.x); p.setAttribute('cy', pt.y);
        }
      });

      cubicPath.style.visibility = S.cubic > 0 ? 'visible' : 'hidden';
      cubicPath.style.strokeDashoffset = 1 - S.cubic;
    }

    if (t > 214.8) {
      shieldCheck.style.visibility = S.check > 0 ? 'visible' : 'hidden';
      shieldCheck.style.strokeDashoffset = 1 - S.check;
      renderCode(Math.round(S.typed * CODE_LEN));
      const ang = 260 * Math.max(0, t - 253.4) * S.motor;
      rotor.setAttribute('transform', `rotate(${(ang % 360).toFixed(1)} 119 115)`);
      fArrow.setAttribute('transform', `translate(284 115) scale(${Math.max(.001, S.motor).toFixed(3)} 1) translate(-284 -115)`);
      fRead.textContent = 'F = −' + (6.3 * S.motor).toFixed(1) + ' N';
    }

    updateUI(t);
  }

  /* =================================================================
     CONTROLES · Play/Pause, barra de progreso, velocidad, teclado
     ================================================================= */
  const btnPlay = $('#btnPlay'), btnSpeed = $('#btnSpeed'), bar = $('#bar'),
        barFill = $('#barFill'), barHead = $('#barHead'),
        tCur = $('#tCur'), hudScene = $('#hudScene'), prScene = $('#prScene'), prNext = $('#prNext');
  const SCENES = ['01 · INTRODUCCIÓN', '02 · FUNDAMENTACIÓN', '03 · SIMULACIÓN', '04 · CONCLUSIONES'];
  const SPEEDS = [1, 1.5, 2, 0.5];
  let speedIdx = 0;
  let playing = false, lastSec = -1, lastScene = -1;

  function setPlaying(p) {
    playing = p;
    btnPlay.classList.toggle('playing', p);
    stage.classList.toggle('paused', !p);
  }
  function togglePlay() {
    if (playing) { tl.pause(); setPlaying(false); }
    else { if (tl.time() >= DUR - .05) tl.time(0); tl.play(); setPlaying(true); }
  }
  function seek(time) {
    tl.time(clamp(time, 0, DUR));
    if (tl.time() >= DUR) { tl.pause(); setPlaying(false); }
  }
  // Al saltar a inicio de escena estando en pausa, evita caer justo sobre la cortinilla
  function jumpScene(sec) {
    const offset = !playing && (sec === 50 || sec === 125 || sec === 215) ? .42 : .01;
    seek(sec + offset);
  }
  function cycleSpeed() {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    const sp = SPEEDS[speedIdx];
    tl.timeScale(sp);
    btnSpeed.textContent = sp + '×';
    btnSpeed.classList.toggle('on', sp !== 1);
  }
  tl.eventCallback('onComplete', () => setPlaying(false));

  btnPlay.addEventListener('click', togglePlay);
  vp.addEventListener('click', togglePlay);
  btnSpeed.addEventListener('click', cycleSpeed);
  $('#btnRestart').addEventListener('click', () => { tl.time(0); tl.play(); setPlaying(true); });
  $('#btnFs').addEventListener('click', toggleFs);
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  let dragging = false, wasPlaying = false;
  const seekFromEvent = e => { const r = bar.getBoundingClientRect(); seek(clamp((e.clientX - r.left) / r.width, 0, 1) * DUR); };
  bar.addEventListener('pointerdown', e => { dragging = true; wasPlaying = playing; tl.pause(); bar.setPointerCapture(e.pointerId); seekFromEvent(e); });
  bar.addEventListener('pointermove', e => { if (dragging) seekFromEvent(e); });
  const endDrag = () => { if (!dragging) return; dragging = false; if (wasPlaying && tl.time() < DUR) tl.play(); else setPlaying(false); };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  function updateUI(t) {
    const p = t / DUR * 100;
    barFill.style.width = p + '%';
    barHead.style.left = p + '%';
    const s = Math.floor(t);
    if (s !== lastSec) { lastSec = s; tCur.textContent = fmt(s); }
    const sc = t < 50 ? 0 : t < 125 ? 1 : t < 215 ? 2 : 3;
    if (sc !== lastScene) { lastScene = sc; hudScene.textContent = SCENES[sc]; prScene.textContent = 'ESCENA ' + SCENES[sc]; }
    updatePrompter(t);
  }

  /* =================================================================
     TELEPRÓNTER SINCRONIZADO
     ================================================================= */
  const prompter = $('#prompter'), track = $('#prTrack'), btnPr = $('#btnPrompter');
  const SCRIPT = window.SCRIPT || [];
  SCRIPT.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'pr-line';
    el.innerHTML = `<span class="ts">${fmt(s.t)}</span><span class="txt">${s.text}<i class="prog"></i></span>`;
    el.addEventListener('click', () => jumpScene(s.t));
    el.style.cursor = 'pointer';
    track.appendChild(el);
    s.el = el; s.prog = el.querySelector('.prog'); s.end = SCRIPT[i + 1] ? SCRIPT[i + 1].t : DUR;
  });
  let cur = -1;
  function scrollPrompter() {
    if (cur < 0 || !SCRIPT[cur]) return;
    track.style.transform = `translateY(${-SCRIPT[cur].el.offsetTop + 34}px)`;
  }
  function updatePrompter(t) {
    if (!SCRIPT.length) return;
    let i = SCRIPT.length - 1;
    while (i > 0 && SCRIPT[i].t > t) i--;
    if (i !== cur) {
      cur = i;
      SCRIPT.forEach((s, j) => { s.el.classList.toggle('now', j === i); s.el.classList.toggle('past', j < i); });
      scrollPrompter();
    }
    const s = SCRIPT[i];
    s.prog.style.width = clamp((t - s.t) / (s.end - s.t), 0, 1) * 100 + '%';
    const rem = Math.ceil(s.end - t);
    prNext.textContent = i < SCRIPT.length - 1 ? `siguiente bloque en ${rem} s` : `fin en ${rem} s`;
  }
  function setPrompter(on) {
    prompter.classList.toggle('hidden', !on);
    btnPr.classList.toggle('on', on);
    try { localStorage.setItem('haptic.prompter', on ? '1' : '0'); } catch (e) {}
    requestAnimationFrame(() => { fit(); scrollPrompter(); });
  }
  let prSize = 24;
  function setPrSize(v) { prSize = clamp(v, 16, 40); prompter.style.setProperty('--pr-size', prSize + 'px'); requestAnimationFrame(scrollPrompter); }
  btnPr.addEventListener('click', () => setPrompter(prompter.classList.contains('hidden')));
  $('#prMinus').addEventListener('click', () => setPrSize(prSize - 2));
  $('#prPlus').addEventListener('click', () => setPrSize(prSize + 2));
  let prPref = '1';
  try { prPref = localStorage.getItem('haptic.prompter') ?? '1'; } catch (e) {}
  prompterReady = true;
  setPrompter(prPref !== '0');

  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    switch (e.key) {
      case ' ': case 'k': case 'K': e.preventDefault(); togglePlay(); break;
      case 'ArrowRight': e.preventDefault(); seek(tl.time() + (e.shiftKey ? 15 : 5)); break;
      case 'ArrowLeft':  e.preventDefault(); seek(tl.time() - (e.shiftKey ? 15 : 5)); break;
      case 'r': case 'R': tl.time(0); tl.play(); setPlaying(true); break;
      case 'v': case 'V': cycleSpeed(); break;
      case 't': case 'T': setPrompter(prompter.classList.contains('hidden')); break;
      case 'f': case 'F': toggleFs(); break;
      case '+': case '=': setPrSize(prSize + 2); break;
      case '-': case '_': setPrSize(prSize - 2); break;
      case '1': jumpScene(0); break;
      case '2': jumpScene(50); break;
      case '3': jumpScene(125); break;
      case '4': jumpScene(215); break;
    }
  });

  /* =================================================================
     ARRANQUE AUTOMÁTICO
     ================================================================= */
  fit();
  gsap.ticker.add(frame);
  setPlaying(false);
  const params = new URLSearchParams(location.search);
  const startAt = parseFloat(params.get('t'));
  if (!isNaN(startAt)) seek(startAt);
  const autoplay = params.get('autoplay') !== '0';
  const go = () => {
    fitEquations();
    if (autoplay && !playing && tl.time() < DUR) { tl.play(); setPlaying(true); }
  };
  (document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve())
    .then(() => setTimeout(go, 450));

  window.__haptic = { tl, S }; // depuración
})();
