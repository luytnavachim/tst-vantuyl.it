(() => {
  const canvas = document.getElementById('worldmap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LON_MIN = -180, LAT_MIN = -56, LON_MAX = 180, LAT_MAX = 78;
  const HUBS = [
    { id: 'AMS', lon: 4.90, lat: 52.37, home: true },
    { id: 'LON', lon: -0.13, lat: 51.51 },
    { id: 'FRA', lon: 8.68, lat: 50.11 },
    { id: 'STO', lon: 18.07, lat: 59.33 },
    { id: 'NYC', lon: -74.01, lat: 40.71 },
    { id: 'IAD', lon: -77.45, lat: 38.95 },
    { id: 'SFO', lon: -122.42, lat: 37.77 },
    { id: 'GRU', lon: -46.63, lat: -23.55 },
    { id: 'JNB', lon: 28.05, lat: -26.20 },
    { id: 'DXB', lon: 55.27, lat: 25.20 },
    { id: 'BOM', lon: 72.88, lat: 19.08 },
    { id: 'SIN', lon: 103.82, lat: 1.35 },
    { id: 'HKG', lon: 114.17, lat: 22.32 },
    { id: 'NRT', lon: 139.78, lat: 35.62 },
    { id: 'SYD', lon: 151.21, lat: -33.87 }
  ];
  const ROUTES = [
    ['AMS', 'NYC'], ['AMS', 'IAD'], ['AMS', 'SFO'], ['AMS', 'LON'],
    ['AMS', 'FRA'], ['AMS', 'STO'], ['AMS', 'DXB'], ['AMS', 'JNB'],
    ['AMS', 'GRU'], ['AMS', 'BOM'], ['AMS', 'SIN'], ['AMS', 'HKG'],
    ['AMS', 'NRT'], ['AMS', 'SYD'], ['NYC', 'SFO'], ['SIN', 'NRT'],
    ['SIN', 'SYD'], ['LON', 'NYC'], ['FRA', 'NRT'], ['DXB', 'SIN']
  ];

  let w = 0, h = 0, dpr = 1, map = { x: 0, y: 0, w: 1, h: 1 };
  let mask = null, dotsLayer = null, sweepLayer = null, dots = [];
  let plexus = [];
  let packets = [];
  let hubsPx = [];
  let routesPx = [];
  let running = true;
  let last = performance.now();

  const hubIndex = Object.fromEntries(HUBS.map((h, i) => [h.id, i]));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    map.w = w * 0.94;
    map.h = map.w * (900 / 2000);
    map.x = w * 0.10;
    map.y = Math.max(8, h * 0.03);
    if (map.y + map.h > h * 0.86) {
      map.h = h * 0.82;
      map.w = map.h * (2000 / 900);
      map.x = w - map.w * 0.98;
    }
    buildDots();
    packets = [];
    layoutHubs();
    buildPlexus();
  }

  function project(lon, lat) {
    const nx = (lon - LON_MIN) / (LON_MAX - LON_MIN);
    const ny = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN);
    return [map.x + nx * map.w, map.y + ny * map.h];
  }

  function buildDots() {
    dots = [];
    if (!mask) return;
    const off = document.createElement('canvas');
    off.width = mask.naturalWidth;
    off.height = mask.naturalHeight;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(mask, 0, 0);
    const img = octx.getImageData(0, 0, off.width, off.height);
    const iw = img.width, ih = img.height, data = img.data;
    const sample = (ix, iy) => {
      if (ix < 0 || iy < 0 || ix >= iw || iy >= ih) return 0;
      return data[(iy * iw + ix) * 4];
    };
    let spacing = 4.3 + Math.max(0, (1100 - w) / 260);
    const est = (map.w / spacing) * (map.h / (spacing * 0.866)) * 0.30;
    if (est > 16000) spacing *= Math.sqrt(est / 16000);
    const dx = spacing, dy = spacing * 0.866;
    let row = 0;
    for (let y = map.y + 1; y < map.y + map.h - 1; y += dy, row++) {
      const odd = row % 2 ? dx * 0.5 : 0;
      for (let x = map.x + 1 + odd; x < map.x + map.w - 1; x += dx) {
        const ix = Math.round(((x - map.x) / map.w) * (iw - 1));
        const iy = Math.round(((y - map.y) / map.h) * (ih - 1));
        if (sample(ix, iy) < 90) continue;
        const step = Math.max(2, Math.round(3 * iw / map.w));
        const coast = sample(ix - step, iy) < 90 || sample(ix + step, iy) < 90 ||
          sample(ix, iy - step) < 90 || sample(ix, iy + step) < 90;
        const fade = Math.min(1, Math.max(0, (x - w * 0.20) / (w * 0.22)));
        dots.push(x, y, coast ? 1 : 0, fade);
      }
    }
    dotsLayer = document.createElement('canvas');
    dotsLayer.width = canvas.width;
    dotsLayer.height = canvas.height;
    const dctx = dotsLayer.getContext('2d');
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < dots.length; i += 4) {
      const x = dots[i], y = dots[i + 1], coast = dots[i + 2], fade = dots[i + 3];
      const a = (coast ? 0.95 : 0.58) * (0.22 + 0.78 * fade);
      const s = coast ? 2.35 : 1.85;
      dctx.fillStyle = coast ? `rgba(168,226,255,${a})` : `rgba(26,166,255,${a})`;
      dctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }

  function layoutHubs() {
    hubsPx = HUBS.map(hub => {
      const [x, y] = project(hub.lon, hub.lat);
      return { ...hub, x, y };
    });
    routesPx = ROUTES.map(([a, b]) => {
      const A = hubsPx[hubIndex[a]], B = hubsPx[hubIndex[b]];
      const dx = B.x - A.x, dy = B.y - A.y;
      const dist = Math.hypot(dx, dy) || 1;
      const lift = Math.min(130, dist * 0.28);
      const cx = (A.x + B.x) / 2 - (dy / dist) * lift;
      const cy = (A.y + B.y) / 2 + (dx / dist) * lift * 0.15 - lift * 0.35;
      return { A, B, cx, cy, dist };
    });
    if (!packets.length) {
      for (let i = 0; i < 24; i++) spawnPacket(Math.random());
    }
  }

  function buildPlexus() {
    const n = w < 700 ? 28 : 52;
    plexus = Array.from({ length: n }, () => ({
      x: Math.random() * w * 0.42,
      y: h * 0.10 + Math.random() * h * 0.58,
      vx: (Math.random() - 0.5) * 0.16,
      vy: (Math.random() - 0.5) * 0.16,
      r: 1.1 + Math.random() * 1.7
    }));
  }

  function spawnPacket(t = 0) {
    const r = routesPx[(Math.random() * routesPx.length) | 0];
    if (!r) return;
    packets.push({
      r,
      t,
      speed: 0.00018 + Math.random() * 0.00028,
      home: r.A.home || r.B.home
    });
  }

  function quad(r, t) {
    const u = 1 - t;
    return [
      u * u * r.A.x + 2 * u * t * r.cx + t * t * r.B.x,
      u * u * r.A.y + 2 * u * t * r.cy + t * t * r.B.y
    ];
  }

  function drawPlexus(dt) {
    const maxD = w < 700 ? 78 : 108;
    ctx.lineWidth = 1;
    for (const n of plexus) {
      if (!reduce) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < 0 || n.x > w * 0.46) n.vx *= -1;
        if (n.y < h * 0.06 || n.y > h * 0.74) n.vy *= -1;
      }
    }
    for (let i = 0; i < plexus.length; i++) {
      const a = plexus[i];
      for (let j = i + 1; j < plexus.length; j++) {
        const b = plexus[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > maxD) continue;
        const o = (1 - d / maxD) * 0.22;
        ctx.strokeStyle = `rgba(227,28,36,${o})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    for (const n of plexus) {
      ctx.fillStyle = 'rgba(227,28,36,.78)';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawArcs(now) {
    ctx.lineCap = 'round';
    routesPx.forEach((r, i) => {
      const pulse = 0.22 + 0.18 * Math.sin(now * 0.0012 + i);
      ctx.beginPath();
      ctx.moveTo(r.A.x, r.A.y);
      ctx.quadraticCurveTo(r.cx, r.cy, r.B.x, r.B.y);
      ctx.strokeStyle = r.A.home || r.B.home
        ? `rgba(227,28,36,${pulse})`
        : `rgba(90,196,255,${pulse * 0.75})`;
      ctx.lineWidth = 1.15;
      ctx.stroke();
    });
  }

  function drawPackets(dt) {
    if (reduce) return;
    if (packets.length < 24 && Math.random() < 0.12) spawnPacket(0);
    ctx.lineWidth = 2;
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      p.t += p.speed * dt;
      if (p.t >= 1) {
        packets.splice(i, 1);
        spawnPacket(0);
        continue;
      }
      const [x, y] = quad(p.r, p.t);
      const [x2, y2] = quad(p.r, Math.max(0, p.t - 0.045));
      const col = p.home ? '#ff5a60' : '#7ee0ff';
      const g = ctx.createLinearGradient(x2, y2, x, y);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, col);
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawHubs(now) {
    hubsPx.forEach((hub, i) => {
      const beat = 0.55 + 0.45 * Math.sin(now * 0.003 + i);
      const home = hub.home;
      if (!reduce) {
        const ring = ((now * 0.00035 + i * 0.17) % 1);
        ctx.beginPath();
        ctx.arc(hub.x, hub.y, 4 + ring * (home ? 26 : 16), 0, Math.PI * 2);
        ctx.strokeStyle = home
          ? `rgba(227,28,36,${0.45 * (1 - ring)})`
          : `rgba(26,166,255,${0.35 * (1 - ring)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.fillStyle = home ? `rgba(227,28,36,${0.55 + beat * 0.4})` : `rgba(126,224,255,${0.5 + beat * 0.4})`;
      ctx.shadowColor = home ? '#e31c24' : '#1aa6ff';
      ctx.shadowBlur = home ? 16 : 10;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, home ? 3.4 : 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  function drawSweep(now) {
    if (!dotsLayer) return;
    if (!sweepLayer || sweepLayer.width !== canvas.width) {
      sweepLayer = document.createElement('canvas');
      sweepLayer.width = canvas.width;
      sweepLayer.height = canvas.height;
    }
    const sctx = sweepLayer.getContext('2d');
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(dotsLayer, 0, 0, w, h);
    if (!reduce) {
      const sweep = ((now * 0.04) % (map.w + 320)) + map.x - 160;
      sctx.globalCompositeOperation = 'source-atop';
      const g = sctx.createLinearGradient(sweep - 150, 0, sweep + 150, 0);
      g.addColorStop(0, 'rgba(26,166,255,0)');
      g.addColorStop(0.5, 'rgba(210,242,255,.5)');
      g.addColorStop(1, 'rgba(26,166,255,0)');
      sctx.fillStyle = g;
      sctx.fillRect(map.x, map.y, map.w, map.h);
      sctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(sweepLayer, 0, 0, w, h);
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(48, now - last);
    last = now;
    ctx.clearRect(0, 0, w, h);
    drawPlexus(dt);
    drawSweep(now);
    drawArcs(now);
    drawPackets(dt);
    drawHubs(now);
    requestAnimationFrame(frame);
  }

  const img = new Image();
  img.onload = () => {
    mask = img;
    resize();
    last = performance.now();
    requestAnimationFrame(frame);
  };
  img.src = 'assets/world-land.png';

  window.addEventListener('resize', () => {
    clearTimeout(resize.t);
    resize.t = setTimeout(resize, 120);
  });
  document.addEventListener('visibilitychange', () => {
    running = document.visibilityState !== 'hidden';
    if (running) {
      last = performance.now();
      requestAnimationFrame(frame);
    }
  });
})();
