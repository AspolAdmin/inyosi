/* inyosi — pencil meadow with bees.
   Five rows of flowers and grasses give the field depth: rows further back are smaller, paler and
   sit higher. Bees move in depth too (z: 0 = front row, 1 = back row), so they shrink and fade as
   they fly away and grow as they come towards you, and nearer plants hide them.
   Moving the pointer over the field (or tapping it) calls the nearest bee, which comes forward and
   lands on the flower nearest the pointer. Art lives in /field (see field.json). */
(function () {
  var canvas = document.querySelector('.field');
  var ctx = canvas.getContext('2d');
  var footer = document.querySelector('.site-footer');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var meta, plantImgs = [], beeUp, beeDown;
  var W, H, dpr, ground, fieldH, beeBase, beeAspect;
  var plants = [], bees = [];
  var pointer = { x: 0, y: 0, active: false, lastMove: 0 };
  var callCooldown = 0;

  var ROWS = 5;
  function depthScale(z) { return 1 - 0.58 * z; }            // size at depth z
  function depthAlpha(z) { return 1 - 0.8 * Math.pow(z, 0.8); } // fade at depth z
  function depthLift(z) { return 0.36 * Math.pow(z, 1.15); } // height above the ground line, as a share of fieldH

  // small seeded RNG so the meadow looks the same on every visit
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
  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    fieldH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--field-h')) || 240;
    beeBase = clamp(fieldH * 0.13, 24, 40);         // bee width on the front row
    beeAspect = meta.bee.h / meta.bee.w;
    ground = footer.getBoundingClientRect().top;

    var r = rng(20261018);
    var flowerIdx = [], grassIdx = [];
    meta.plants.forEach(function (p, i) { (p.kind === 'grass' ? grassIdx : flowerIdx).push(i); });

    // shuffle-bag picking so every species turns up and neighbours rarely match
    function bag(list) {
      var items = [];
      return function () {
        if (!items.length) {
          items = list.slice();
          for (var i = items.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = items[i]; items[i] = items[j]; items[j] = t; }
        }
        return items.pop();
      };
    }
    var nextFlower = bag(flowerIdx), nextGrass = bag(grassIdx);

    plants = [];
    for (var row = ROWS - 1; row >= 0; row--) {
      var zRow = row / (ROWS - 1);
      var sRow = depthScale(zRow);
      var x = -40 - r() * 40;
      while (x < W + 40) {
        var k = r() < 0.22 ? nextGrass() : nextFlower();
        var p = meta.plants[k];
        var z = clamp(zRow + (r() - 0.5) * 0.12, 0, 1);
        var targetH = fieldH * sRow * (0.5 + r() * 0.6);  // 50%–110% of the row height
        var s = targetH / p.h;
        plants.push({
          img: plantImgs[k], p: p, s: s, z: z,
          land: p.kind === 'flower',
          x: x, lift: depthLift(z) * fieldH + (r() - 0.5) * 6,
          alpha: depthAlpha(z),
          flip: r() < 0.5 ? -1 : 1,
          amp: (0.02 + r() * 0.022) * (1 - 0.4 * z),
          speed: 0.7 + r() * 0.6,
          phase: r() * Math.PI * 2,
          angle: 0
        });
        x += p.w * s * (0.6 + r() * 0.55) * (1 + 0.5 * zRow);
      }
    }
    plants.sort(function (a, b) { return b.z - a.z; });   // back to front
    if (!bees.length) makeBees();
    bees.forEach(function (b) { b.x = clamp(b.x, 0, W); b.y = clamp(b.y, 0, ground); });
  }

  function baseY(pl) { return ground - pl.lift; }

  // screen position of a flower's landing point, following its current sway
  function headPos(pl) {
    var p = pl.p, w = p.w * pl.s, h = p.h * pl.s;
    var dx = (p.head[0] - p.pivot[0]) * w * pl.flip;
    var dy = (p.head[1] - 1) * h;
    var c = Math.cos(pl.angle), s = Math.sin(pl.angle);
    return { x: pl.x + dx * c - dy * s, y: baseY(pl) + dx * s + dy * c };
  }

  // ---------- bees ----------
  function landable() { return plants.filter(function (pl) { return pl.land && pl.x > 10 && pl.x < W - 10; }); }

  function nearestFlower(x, y) {
    var best = null, bd = Infinity;
    landable().forEach(function (pl) {
      var hp = headPos(pl);
      // favour nearer rows a little when the pointer is between flowers
      var d = Math.hypot(hp.x - x, hp.y - y) * (1 + pl.z * 0.6);
      if (d < bd) { bd = d; best = pl; }
    });
    return best;
  }

  function randomFlower(exclude) {
    // back rows hold the most plants, so weight towards nearer flowers to keep bees visible
    var list = landable().filter(function (pl) { return pl !== exclude; });
    var total = 0;
    list.forEach(function (pl) { total += 1 - 0.7 * pl.z; });
    var pick = Math.random() * total;
    for (var i = 0; i < list.length; i++) {
      pick -= 1 - 0.7 * list[i].z;
      if (pick <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  function beeSize(z) { var w = beeBase * depthScale(z); return { w: w, h: w * beeAspect }; }

  function makeBees() {
    var n = W < 600 ? 3 : W < 1100 ? 4 : 6;
    // start each bee perched on a random flower, taking off at staggered times
    for (var i = 0; i < n; i++) {
      var fl = randomFlower();
      bees.push({
        x: fl ? fl.x : rand(0, W), y: fl ? baseY(fl) : ground - fieldH * 0.5, z: fl ? fl.z : Math.random(),
        vx: 0, vy: 0, vz: 0,
        state: fl ? 'rest' : 'fly', flower: fl, waypoint: null, rest: rand(0.4, 6),
        face: Math.random() < 0.5 ? 1 : -1, tilt: 0, wing: 0, wobble: Math.random() * 100, speed: rand(90, 130)
      });
    }
  }

  function pickNext(b) {
    var from = b.flower;
    b.state = 'fly';
    b.waypoint = null;
    // now and then wander off into the open air, nearer or further away, before choosing a flower
    if (Math.random() < 0.35) {
      b.waypoint = { x: rand(W * 0.08, W * 0.92), y: rand(H * 0.15, Math.max(H * 0.22, ground - fieldH * 1.1)), z: rand(-0.1, 1) };
    }
    b.flower = randomFlower(from);
    b.vy -= 50; // take-off hop
  }

  function feetOffset(b) {
    // the art faces left; feet sit at meta.bee.feet in that orientation
    var sz = beeSize(b.z);
    return { x: (meta.bee.feet[0] - 0.5) * sz.w * (b.face === 1 ? 1 : -1), y: (meta.bee.feet[1] - 0.5) * sz.h };
  }

  function steer(b, tx, ty, tz, dt, arrive) {
    var ds = depthScale(b.z);                       // far bees cover fewer pixels per second
    var dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
    var sp = b.speed * ds * (arrive ? clamp(d / (90 * ds), 0.12, 1) : 1);
    b.wobble += dt;
    var wig = Math.sin(b.wobble * 3.1) * 0.6 + Math.sin(b.wobble * 7.3) * 0.25;
    var wobbleAmt = (arrive ? clamp(d / 160, 0, 1) : 1) * ds;
    var nx = -dy / d, ny = dx / d;
    var desX = dx / d * sp + nx * wig * 50 * wobbleAmt;
    var desY = dy / d * sp + ny * wig * 50 * wobbleAmt + Math.sin(b.wobble * 5) * 10 * ds;
    var k = clamp(3.2 * dt, 0, 1);
    b.vx += (desX - b.vx) * k;
    b.vy += (desY - b.vy) * k;
    // depth: ease towards the target depth, with a slow in-and-out drift while travelling
    var desZ = clamp((tz - b.z) * 1.6, -0.45, 0.45) + (arrive ? 0 : Math.sin(b.wobble * 0.9) * 0.08);
    b.vz += (desZ - b.vz) * k;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z = clamp(b.z + b.vz * dt, -0.1, 1);   // slightly below 0 = in front of the front row
    return { d: d, dz: Math.abs(tz - b.z) };
  }

  function updateBee(b, dt, t) {
    if (b.state === 'rest') {
      b.z = b.flower.z - 0.002;                   // just in front of its flower
      var p = headPos(b.flower), off = feetOffset(b);
      b.x = p.x - off.x;
      b.y = p.y - off.y + 1;
      b.tilt += (0 - b.tilt) * clamp(6 * dt, 0, 1);
      b.rest -= dt;
      if (b.rest <= 0) pickNext(b);
      return;
    }

    if (b.state === 'chase') {
      // a called bee comes forward to the pointer
      var c = steer(b, pointer.x, pointer.y - beeSize(b.z).h * 0.8, -0.08, dt, true);
      var idle = t - pointer.lastMove > 0.7;
      if (c.d < 26 || idle || !pointer.active) {
        b.state = 'fly';
        b.waypoint = null;
        b.flower = nearestFlower(pointer.x, pointer.y);
      }
    } else if (b.waypoint) {
      if (steer(b, b.waypoint.x, b.waypoint.y, b.waypoint.z, dt, false).d < 40) b.waypoint = null;
    } else {
      if (!b.flower) b.flower = randomFlower();
      var hp = headPos(b.flower), off2 = feetOffset(b);
      var res = steer(b, hp.x - off2.x, hp.y - off2.y + 1, b.flower.z - 0.002, dt, true);
      if (res.d < 4 && res.dz < 0.04 && Math.hypot(b.vx, b.vy) < 40) {
        b.state = 'rest';
        b.rest = rand(2.2, 6.5);
        b.vx = b.vy = b.vz = 0;
      }
    }

    if (b.vx < -8) b.face = 1;       // art faces left
    else if (b.vx > 8) b.face = -1;
    var targetTilt = clamp(b.vy / 240, -0.35, 0.35) * (b.face === 1 ? 1 : -1);
    b.tilt += (targetTilt - b.tilt) * clamp(5 * dt, 0, 1);
    b.wing += dt;
  }

  function callBee() {
    if (callCooldown > 0) return;
    if (bees.some(function (b) { return b.state === 'chase'; })) return;
    var best = null, bd = Infinity;
    bees.forEach(function (b) {
      var d = Math.hypot(b.x - pointer.x, b.y - pointer.y) + b.z * 120;
      if (d < bd) { bd = d; best = b; }
    });
    if (best) {
      if (best.state === 'rest') best.vy -= 40;
      best.state = 'chase';
      best.waypoint = null;
      callCooldown = 1.2;
    }
  }

  function inField(y) { return y > ground - fieldH * 1.3 && y < ground; }

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
  function drawPlant(pl) {
    var p = pl.p, w = p.w * pl.s, h = p.h * pl.s;
    ctx.save();
    ctx.globalAlpha = pl.alpha;
    ctx.translate(pl.x, baseY(pl));
    ctx.rotate(pl.angle);
    ctx.scale(pl.flip, 1);
    ctx.drawImage(pl.img, -p.pivot[0] * w, -h, w, h);
    ctx.restore();
  }

  function drawBee(b) {
    // flying: wings beat by swapping frames; resting: wings still, with the odd flick
    var img = beeUp;
    if (b.state !== 'rest') img = Math.floor(b.wing * 28) % 2 ? beeDown : beeUp;
    else if (Math.sin(b.rest * 9) > 0.97) img = beeDown;
    var sz = beeSize(b.z);
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.75 * depthAlpha(b.z);
    ctx.translate(b.x, b.y);
    ctx.rotate(b.tilt);
    ctx.scale(b.face, 1);
    ctx.drawImage(img, -sz.w / 2, -sz.h / 2, sz.w, sz.h);
    ctx.restore();
  }

  var last = 0;
  function frame(now) {
    var t = now / 1000;
    var dt = clamp(t - (last || t), 0, 0.05);
    last = t;
    ground = footer.getBoundingClientRect().top;
    callCooldown = Math.max(0, callCooldown - dt);

    plants.forEach(function (pl) {
      var gust = Math.sin(t * 0.55 - pl.x * 0.004) * 0.5 + 0.5;
      pl.angle = reduced ? 0 : pl.amp * (Math.sin(t * pl.speed + pl.phase) * 0.7 + gust * 0.6 - 0.3);
    });
    if (!reduced) bees.forEach(function (b) { updateBee(b, dt, t); });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // plants are sorted back to front; slot each bee in at its depth so nearer plants hide it
    var order = bees.slice().sort(function (a, b) { return b.z - a.z; });
    var bi = 0;
    for (var i = 0; i < plants.length; i++) {
      while (bi < order.length && order[bi].z >= plants[i].z) drawBee(order[bi++]);
      drawPlant(plants[i]);
    }
    while (bi < order.length) drawBee(order[bi++]);
    if (!reduced) requestAnimationFrame(frame);
  }

  function settleForReducedMotion() {
    bees.forEach(function (b) {
      b.state = 'rest'; b.rest = Infinity;
      b.z = b.flower.z - 0.002;
      var p = headPos(b.flower), off = feetOffset(b);
      b.x = p.x - off.x; b.y = p.y - off.y + 1;
    });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      layout();
      bees.forEach(function (b) {
        if (b.flower && plants.indexOf(b.flower) < 0) { b.flower = randomFlower(); if (b.state === 'rest') b.state = 'fly'; }
      });
      if (reduced) { settleForReducedMotion(); frame(performance.now()); }
    }, 120);
  });

  fetch('field/field.json').then(function (r) { return r.json(); }).then(function (m) {
    meta = m;
    return Promise.all(m.plants.map(function (p) { return load(p.src); })
      .concat([load('bee-up.png'), load('bee-down.png')]));
  }).then(function (imgs) {
    beeDown = imgs.pop();
    beeUp = imgs.pop();
    plantImgs = imgs;
    layout();
    if (reduced) { settleForReducedMotion(); frame(performance.now()); }
    else requestAnimationFrame(frame);
    canvas.classList.add('is-ready');
  });
})();
