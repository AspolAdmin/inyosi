/* inyosi — pencil flower field with bees.
   Flowers sway from their stems; bees fly flower to flower. Moving the pointer
   over the field (or tapping it) calls the nearest bee, which then lands on the
   flower nearest the pointer. Art lives in /field (see field.json). */
(function () {
  var canvas = document.querySelector('.field');
  var ctx = canvas.getContext('2d');
  var footer = document.querySelector('.site-footer');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var meta, flowerImgs = [], beeUp, beeDown;
  var W, H, dpr, ground, fieldH, beeW, beeH;
  var flowers = [], bees = [];
  var pointer = { x: 0, y: 0, active: false, lastMove: 0 };
  var callCooldown = 0;

  // small seeded RNG so the field looks the same on every visit
  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function load(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = rej;
      im.src = 'field/' + src;
    });
  }

  // ---------- layout ----------
  var LAYERS = [
    { scale: 0.58, alpha: 0.38, lift: 0.10, gap: 0.42, sway: 0.6, land: false },
    { scale: 0.78, alpha: 0.65, lift: 0.05, gap: 0.50, sway: 0.8, land: true },
    { scale: 1.00, alpha: 1.00, lift: 0.00, gap: 0.62, sway: 1.0, land: true }
  ];

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    fieldH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--field-h')) || 240;
    beeW = clamp(W * 0.045, 40, 62);
    beeH = beeW * meta.bee.h / meta.bee.w;
    ground = footer.getBoundingClientRect().top;

    var r = rng(20261018);
    flowers = [];
    LAYERS.forEach(function (L, li) {
      var x = -40 + r() * 30;
      while (x < W + 40) {
        var k = Math.floor(r() * meta.flowers.length);
        var f = meta.flowers[k];
        var targetH = fieldH * L.scale * (0.72 + r() * 0.28);
        var s = targetH / f.h;
        flowers.push({
          img: flowerImgs[k], f: f, s: s, layer: li, alpha: L.alpha, land: L.land,
          x: x, liftFrac: L.lift + r() * 0.03,
          flip: r() < 0.5 ? -1 : 1,
          amp: (0.022 + r() * 0.02) * L.sway,
          speed: 0.7 + r() * 0.6,
          phase: r() * Math.PI * 2,
          angle: 0
        });
        x += f.w * s * L.gap * (0.75 + r() * 0.5);
      }
    });
    if (!bees.length) makeBees();
    bees.forEach(function (b) { b.x = clamp(b.x, 0, W); b.y = clamp(b.y, 0, ground); });
  }

  function baseY(fl) { return ground - fl.liftFrac * fieldH; }

  // world position of a flower's landing point, following its current sway
  function headPos(fl) {
    var f = fl.f, w = f.w * fl.s, h = f.h * fl.s;
    var dx = (f.head[0] - f.pivot[0]) * w * fl.flip;
    var dy = (f.head[1] - 1) * h;
    var c = Math.cos(fl.angle), s = Math.sin(fl.angle);
    return { x: fl.x + dx * c - dy * s, y: baseY(fl) + dx * s + dy * c };
  }

  // ---------- bees ----------
  function landable() { return flowers.filter(function (fl) { return fl.land; }); }

  function nearestFlower(x, y, exclude) {
    var best = null, bd = Infinity;
    landable().forEach(function (fl) {
      if (fl === exclude) return;
      var p = headPos(fl), d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) { bd = d; best = fl; }
    });
    return best;
  }

  function randomFlower(exclude) {
    var list = landable().filter(function (fl) { return fl !== exclude && fl.x > 10 && fl.x < W - 10; });
    return list[Math.floor(Math.random() * list.length)];
  }

  function makeBees() {
    var n = W < 600 ? 2 : W < 1100 ? 3 : 4;
    for (var i = 0; i < n; i++) {
      var fl = randomFlower();
      bees.push({
        x: rand(0, W), y: rand(H * 0.15, ground - fieldH), vx: rand(-40, 40), vy: rand(-20, 20),
        state: 'fly', flower: fl, waypoint: null, rest: 0,
        face: 1, tilt: 0, wing: 0, wobble: Math.random() * 100, speed: rand(95, 140)
      });
    }
  }

  function pickNext(b) {
    var from = b.flower;
    b.state = 'fly';
    b.waypoint = null;
    // now and then wander up into the open air before choosing a flower
    if (Math.random() < 0.3) {
      b.waypoint = { x: rand(W * 0.1, W * 0.9), y: rand(H * 0.12, Math.max(H * 0.2, ground - fieldH * 1.2)) };
    }
    b.flower = randomFlower(from);
    b.vy -= 60; // take-off hop
  }

  function feetOffset(b) {
    // the art faces left; feet sit at meta.bee.feet in that orientation
    var fx = (meta.bee.feet[0] - 0.5) * beeW * (b.face === 1 ? 1 : -1);
    var fy = (meta.bee.feet[1] - 0.5) * beeH;
    return { x: fx, y: fy };
  }

  function steer(b, tx, ty, dt, arrive) {
    var dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
    var sp = b.speed * (arrive ? clamp(d / 90, 0.15, 1) : 1);
    // bees zig-zag: a sideways wander that fades as they arrive
    b.wobble += dt;
    var wig = Math.sin(b.wobble * 3.1) * 0.6 + Math.sin(b.wobble * 7.3) * 0.25;
    var wobbleAmt = arrive ? clamp(d / 160, 0, 1) : 1;
    var nx = -dy / d, ny = dx / d;
    var desX = dx / d * sp + nx * wig * 55 * wobbleAmt;
    var desY = dy / d * sp + ny * wig * 55 * wobbleAmt + Math.sin(b.wobble * 5) * 12;
    var k = 3.2;
    b.vx += (desX - b.vx) * clamp(k * dt, 0, 1);
    b.vy += (desY - b.vy) * clamp(k * dt, 0, 1);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    return d;
  }

  function updateBee(b, dt, t) {
    if (b.state === 'rest') {
      var p = headPos(b.flower), off = feetOffset(b);
      b.x = p.x - off.x;
      b.y = p.y - off.y + 2;
      b.tilt += (0 - b.tilt) * clamp(6 * dt, 0, 1);
      b.rest -= dt;
      if (b.rest <= 0) pickNext(b);
      return;
    }

    if (b.state === 'chase') {
      var d = steer(b, pointer.x, pointer.y - beeH * 0.6, dt, true);
      var idle = t - pointer.lastMove > 0.7;
      if (d < 28 || idle || !pointer.active) {
        b.state = 'fly';
        b.waypoint = null;
        b.flower = nearestFlower(pointer.x, pointer.y);
      }
    } else if (b.waypoint) {
      if (steer(b, b.waypoint.x, b.waypoint.y, dt, false) < 40) b.waypoint = null;
    } else {
      if (!b.flower) b.flower = randomFlower();
      var hp = headPos(b.flower), off2 = feetOffset(b);
      var dd = steer(b, hp.x - off2.x, hp.y - off2.y + 2, dt, true);
      if (dd < 4 && Math.hypot(b.vx, b.vy) < 40) {
        b.state = 'rest';
        b.rest = rand(2.2, 6.5);
        b.vx = b.vy = 0;
      }
    }

    if (b.vx < -10) b.face = 1;       // art faces left
    else if (b.vx > 10) b.face = -1;
    var targetTilt = clamp(b.vy / 260, -0.35, 0.35) * (b.face === 1 ? 1 : -1);
    b.tilt += (targetTilt - b.tilt) * clamp(5 * dt, 0, 1);
    b.wing += dt;
  }

  function callBee() {
    if (callCooldown > 0) return;
    var chasing = bees.filter(function (b) { return b.state === 'chase'; })[0];
    if (chasing) return;
    var best = null, bd = Infinity;
    bees.forEach(function (b) {
      var d = Math.hypot(b.x - pointer.x, b.y - pointer.y);
      if (d < bd) { bd = d; best = b; }
    });
    if (best) {
      if (best.state === 'rest') best.vy -= 50;
      best.state = 'chase';
      best.waypoint = null;
      callCooldown = 1.2;
    }
  }

  function inField(y) { return y > ground - fieldH * 1.1 && y < ground; }

  window.addEventListener('pointermove', function (e) {
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.active = inField(e.clientY);
    pointer.lastMove = performance.now() / 1000;
    if (pointer.active && !reduced) callBee();
  }, { passive: true });

  window.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse') return;
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.active = inField(e.clientY);
    pointer.lastMove = performance.now() / 1000;
    if (pointer.active && !reduced) { callCooldown = 0; callBee(); }
  }, { passive: true });

  document.addEventListener('pointerleave', function () { pointer.active = false; });

  // ---------- drawing ----------
  function drawFlower(fl) {
    var f = fl.f, w = f.w * fl.s, h = f.h * fl.s;
    ctx.save();
    ctx.globalAlpha = fl.alpha;
    ctx.translate(fl.x, baseY(fl));
    ctx.rotate(fl.angle);
    ctx.scale(fl.flip, 1);
    ctx.drawImage(fl.img, -f.pivot[0] * w, -h, w, h);
    ctx.restore();
  }

  function drawBee(b) {
    // flying: wings beat by swapping frames; resting: wings still, with the odd flick
    var img = beeUp;
    if (b.state !== 'rest') img = Math.floor(b.wing * 28) % 2 ? beeDown : beeUp;
    else if (Math.sin(b.rest * 9) > 0.97) img = beeDown;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.tilt);
    ctx.scale(b.face, 1);
    ctx.drawImage(img, -beeW / 2, -beeH / 2, beeW, beeH);
    ctx.restore();
  }

  var last = 0;
  function frame(now) {
    var t = now / 1000;
    var dt = Math.min(0.05, t - (last || t));
    last = t;
    ground = footer.getBoundingClientRect().top;
    callCooldown = Math.max(0, callCooldown - dt);

    flowers.forEach(function (fl) {
      var gust = Math.sin(t * 0.55 - fl.x * 0.004) * 0.5 + 0.5;
      fl.angle = reduced ? 0 : fl.amp * (Math.sin(t * fl.speed + fl.phase) * 0.7 + gust * 0.6 - 0.3);
    });
    if (!reduced) bees.forEach(function (b) { updateBee(b, dt, t); });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    flowers.forEach(drawFlower);
    bees.forEach(drawBee);
    if (!reduced) requestAnimationFrame(frame);
  }

  function settleForReducedMotion() {
    bees.forEach(function (b) {
      b.state = 'rest'; b.rest = Infinity;
      var p = headPos(b.flower), off = feetOffset(b);
      b.x = p.x - off.x; b.y = p.y - off.y + 2;
    });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      layout();
      bees.forEach(function (b) { if (b.flower && flowers.indexOf(b.flower) < 0) { b.flower = randomFlower(); if (b.state === 'rest') b.state = 'fly'; } });
      if (reduced) { settleForReducedMotion(); frame(performance.now()); }
    }, 120);
  });

  fetch('field/field.json').then(function (r) { return r.json(); }).then(function (m) {
    meta = m;
    return Promise.all(m.flowers.map(function (f) { return load(f.src); })
      .concat([load('bee-up.png'), load('bee-down.png')]));
  }).then(function (imgs) {
    beeDown = imgs.pop();
    beeUp = imgs.pop();
    flowerImgs = imgs;
    layout();
    if (reduced) { settleForReducedMotion(); frame(performance.now()); }
    else requestAnimationFrame(frame);
    canvas.classList.add('is-ready');
  });
})();
