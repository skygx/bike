/* Pelican Coast Ride - 纯本地 3D 原型，无外部资源、无联网依赖 */
(function () {
'use strict';

var $ = function (id) { return document.getElementById(id); };
if (!window.THREE) {
  document.getElementById('scene').innerHTML =
    '<div style="padding:40px;font:16px system-ui">three.js 未加载，请确认 vendor/three.min.js 与 index.html 在同一目录。</div>';
  return;
}

var T = THREE;
var lerp = function (a, b, t) { return a + (b - a) * t; };
var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
var rand = function (a, b) { return a + Math.random() * (b - a); };

var ROAD_HALF = 6;
var LIMIT = 5.1;
var NEAR = 14;
var TILE = 20;
var BEST_KEY = 'pelican_coast_best_v1';

var best = 0;
try { best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { best = 0; }
function saveBest() { try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {} }

var isTouch = window.matchMedia('(pointer: coarse)').matches || innerWidth < 820;

/* ---------------- renderer / scene ---------------- */
var scene = new T.Scene();
scene.fog = new T.Fog(0xbfe3f2, 72, 205);

var renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = T.sRGBEncoding;
$('scene').appendChild(renderer.domElement);

var camera = new T.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 3.6, 9.2);
var lookNow = new T.Vector3(0, 1.8, -9);

/* sky dome */
var sky = new T.Mesh(
  new T.SphereGeometry(500, 24, 16),
  new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'varying vec3 vP;',
      'void main(){',
      '  float h = normalize(vP).y;',
      '  vec3 low = vec3(0.86,0.94,0.97);',
      '  vec3 mid = vec3(0.58,0.80,0.93);',
      '  vec3 top = vec3(0.20,0.49,0.82);',
      '  vec3 c = mix(low, mid, smoothstep(-0.10,0.22,h));',
      '  c = mix(c, top, smoothstep(0.16,0.85,h));',
      '  gl_FragColor = vec4(c,1.0);',
      '}'
    ].join('\n')
  })
);
sky.renderOrder = -2;
scene.add(sky);

/* sun */
function glowTexture() {
  var c = document.createElement('canvas');
  c.width = c.height = 128;
  var g = c.getContext('2d');
  var rad = g.createRadialGradient(64, 64, 5, 64, 64, 64);
  rad.addColorStop(0, 'rgba(255,247,214,0.8)');
  rad.addColorStop(0.25, 'rgba(255,240,192,0.3)');
  rad.addColorStop(1, 'rgba(255,235,180,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 128, 128);
  return new T.CanvasTexture(c);
}
var sunHalo = new T.Mesh(new T.PlaneGeometry(120, 120),
  new T.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
sunHalo.position.set(-125, 82, -356);
scene.add(sunHalo);
var sunDisc = new T.Mesh(new T.CircleGeometry(20, 40),
  new T.MeshBasicMaterial({ color: 0xfff8dd, fog: false }));
sunDisc.position.set(-125, 82, -352);
sunDisc.renderOrder = -1;
scene.add(sunDisc);

/* lights */
scene.add(new T.HemisphereLight(0xffffff, 0x7ba7bf, 0.62));
var sunLight = new T.DirectionalLight(0xfff1d2, 0.72);
sunLight.position.set(-40, 60, -30);
scene.add(sunLight);
var fillLight = new T.DirectionalLight(0xcbeaff, 0.22);
fillLight.position.set(30, 20, 30);
scene.add(fillLight);

/* materials */
function lam(color, extra) {
  var o = { color: color };
  if (extra) for (var k in extra) o[k] = extra[k];
  return new T.MeshLambertMaterial(o);
}
var MAT = {
  asphalt: lam(0xffffff),
  shoulder: lam(0xc9bf9f),
  sand: lam(0xdfc58c),
  grass: lam(0x7fae63),
  sea: new T.MeshPhongMaterial({ vertexColors: true, color: 0xffffff, shininess: 120, specular: 0xd8f2ff }),
  foam: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
  glint: new T.MeshBasicMaterial({ color: 0xffe89a, transparent: true, opacity: 0.4,
    depthWrite: false, fog: false, blending: T.AdditiveBlending }),
  glass: lam(0xff556b, { emissive: 0x5c0c18, emissiveIntensity: 0.45 }),
  cork: lam(0xf5f0e6),
  line: lam(0xf4f6ef),
  rail: lam(0xeef2f0),
  post: lam(0x9aa8ad),
  trunk: lam(0x9a7042),
  leaf: lam(0x3f9e64),
  leaf2: lam(0x57b878),
  lamp: lam(0x62757e),
  bulb: new T.MeshBasicMaterial({ color: 0xffe9a8 }),
  island: lam(0x8fb3b5),
  tire: lam(0x2b333a),
  spoke: lam(0xc6d0d4),
  frame: lam(0xff6b4a),
  frame2: lam(0xffd166),
  saddle: lam(0x33414a),
  feather: lam(0xf7f7f0),
  featherShade: lam(0xdfe6e4),
  beak: lam(0xffae35),
  pouch: lam(0xff8c34),
  eye: lam(0x1d2b33),
  white: lam(0xffffff),
  helmet: lam(0xe8453c),
  cone: lam(0xff7a33),
  coneWhite: lam(0xfff4e6),
  base: lam(0x444c50),
  coin: new T.MeshStandardMaterial({ color: 0xffd24a, metalness: 0.5, roughness: 0.3, emissive: 0x9a5c00, emissiveIntensity: 0.55 }),
  coinRim: new T.MeshStandardMaterial({ color: 0xfff0a8, metalness: 0.4, roughness: 0.3, emissive: 0x8a5200, emissiveIntensity: 0.5 })
};

/* ---------------- ground + road ---------------- */
function plane(w, h, mat, x, y, z) {
  var m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}

plane(700, 900, MAT.sand, -350, -0.08, -150);
plane(180, 900, MAT.grass, -430, -0.05, -150);

/* ---------------- ocean: animated waves, foam & sun glints ---------------- */
var SEA_X = 364, SEA_Y = -0.24, SEA_Z = -150;
var SEA_SEG = isTouch ? 36 : 56;
var seaGeo = new T.PlaneGeometry(712, 900, SEA_SEG, SEA_SEG);
seaGeo.rotateX(-Math.PI / 2); /* vertices lie in XZ, Y becomes wave height */
var seaPos = seaGeo.attributes.position;
var seaBase = new Float32Array(seaPos.count * 3);
var nearCol = new T.Color(0x3fb9d8), offCol = new T.Color(0x1579bd), deepCol = new T.Color(0x08467f);
for (var si = 0; si < seaPos.count; si++) {
  var wx = seaPos.getX(si) + SEA_X;
  var k = clamp((wx - 8) / 95, 0, 1);
  var col = k < 0.5 ? nearCol.clone().lerp(offCol, k * 2) : offCol.clone().lerp(deepCol, (k - 0.5) * 2);
  seaBase[si * 3] = col.r; seaBase[si * 3 + 1] = col.g; seaBase[si * 3 + 2] = col.b;
}
seaGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(seaBase), 3));
var seaCol = seaGeo.attributes.color;
var seaMesh = new T.Mesh(seaGeo, MAT.sea);
seaMesh.position.set(SEA_X, SEA_Y, SEA_Z);
scene.add(seaMesh);

function waveHeight(wx, wz, time) {
  var h = 0.62 * Math.sin(wx * 0.045 + time * 1.4)
        + 0.36 * Math.sin(wz * 0.155 - time * 2.1)
        + 0.18 * Math.sin((wx * 0.4 + wz) * 0.24 + time * 2.9);
  return h * clamp((wx - 8) / 26, 0.16, 1); /* waves build up away from the shore */
}

/* sparkling highlight flakes along the sun path */
var glints = [];
for (var gi = 0; gi < (isTouch ? 28 : 44); gi++) {
  var gz = rand(-300, 10);
  var gx = clamp(34 + (-gz) * 0.38 + rand(-22, 22), 18, 240);
  var gm = new T.Mesh(new T.PlaneGeometry(rand(5, 18), rand(0.8, 2.4)), MAT.glint.clone());
  gm.rotation.x = -Math.PI / 2;
  gm.position.set(gx, SEA_Y + 0.16, gz);
  gm.userData.phase = rand(0, Math.PI * 2);
  gm.userData.freq = rand(1.5, 3.8);
  scene.add(gm);
  glints.push(gm);
}

plane(2.2, 420, MAT.shoulder, -7.1, -0.01, -145);
plane(2.2, 420, MAT.shoulder, 7.1, -0.01, -145);

function roadTexture() {
  var c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  var g = c.getContext('2d');
  g.fillStyle = '#454f59'; g.fillRect(0, 0, 256, 512);
  for (var i = 0; i < 1400; i++) {
    var v = Math.random() * 30 | 0;
    g.fillStyle = 'rgba(' + (60 + v) + ',' + (68 + v) + ',' + (76 + v) + ',0.5)';
    g.fillRect(Math.random() * 256, Math.random() * 512, 2, 2);
  }
  g.fillStyle = '#f1f4ec';
  g.fillRect(10, 0, 7, 512);
  g.fillRect(239, 0, 7, 512);
  for (var y = 0; y < 512; y += 128) {
    g.fillRect(83, y, 6, 64);
    g.fillRect(167, y, 6, 64);
  }
  var t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(1, 420 / TILE);
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}
var roadTex = roadTexture();
MAT.asphalt.map = roadTex;
var road = plane(12, 420, MAT.asphalt, 0, 0.005, -145);
void road;

/* distant islands */
[[95, -150, 34, 42], [175, -178, 46, 55], [255, -160, 28, 32], [-260, -190, 40, 48]].forEach(function (d) {
  var m = new T.Mesh(new T.ConeGeometry(d[2], d[3], 5), MAT.island);
  m.position.set(d[0], d[3] / 2 - 6, d[1]);
  m.rotation.y = Math.random() * 3;
  scene.add(m);
});

/* clouds */
var clouds = [];
for (var ci = 0; ci < 9; ci++) {
  var cg = new T.Group();
  var cm = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, fog: false, depthWrite: false });
  for (var cj = 0; cj < 4; cj++) {
    var puff = new T.Mesh(new T.SphereGeometry(1, 8, 6), cm);
    puff.position.set(cj * 3.1 - 4.6, Math.random() * 1.2, Math.random() * 2 - 1);
    puff.scale.set(3.2 + Math.random() * 1.6, 1.7 + Math.random() * 0.7, 2.4);
    cg.add(puff);
  }
  cg.position.set(rand(-220, 220), rand(34, 62), rand(-280, -110));
  cg.userData.speed = rand(0.6, 1.8);
  scene.add(cg);
  clouds.push(cg);
}

/* ---------------- pooled roadside objects ---------------- */
var pools = [];
function pool(n, gap, startZ, factory, recycle) {
  var arr = [];
  for (var i = 0; i < n; i++) {
    var o = factory(i);
    o.position.z = startZ - i * gap;
    o.userData.span = n * gap;
    o.userData.prevZ = o.position.z;
    recycle(o, i, true);
    scene.add(o);
    arr.push(o);
  }
  pools.push({ arr: arr, recycle: recycle });
  return arr;
}
function scrollPools(dz) {
  for (var p = 0; p < pools.length; p++) {
    var pl = pools[p];
    for (var i = 0; i < pl.arr.length; i++) {
      var o = pl.arr[i];
      o.userData.prevZ = o.position.z;
      o.position.z += dz;
      if (o.position.z > NEAR) {
        o.position.z -= o.userData.span;
        o.userData.prevZ = o.position.z;
        pl.recycle(o, i, false);
      }
    }
  }
}

/* guard rail on the sea side */
pool(24, 12, 4, function () {
  var g = new T.Group();
  var post = new T.Mesh(new T.BoxGeometry(0.16, 1.05, 0.16), MAT.post);
  post.position.set(0, 0.52, -6);
  g.add(post);
  [0.92, 0.52].forEach(function (y) {
    var rail = new T.Mesh(new T.BoxGeometry(0.12, 0.13, 12), MAT.rail);
    rail.position.set(0, y, 0);
    g.add(rail);
  });
  g.position.x = 7.55;
  return g;
}, function () {});

/* palm trees on the land side */
var leafGeo = new T.ConeGeometry(0.52, 2.7, 4);
leafGeo.rotateZ(-Math.PI / 2);
pool(14, 21, 0, function () {
  var g = new T.Group();
  var trunk = new T.Mesh(new T.CylinderGeometry(0.17, 0.32, 5.6, 6), MAT.trunk);
  trunk.position.y = 2.8;
  trunk.rotation.z = 0.1;
  g.add(trunk);
  for (var i = 0; i < 6; i++) {
    var lf = new T.Mesh(leafGeo, i % 2 ? MAT.leaf : MAT.leaf2);
    lf.position.set(Math.cos(i * 1.047) * 0.9, 5.5, Math.sin(i * 1.047) * 0.9);
    lf.rotation.y = -i * 1.047;
    lf.rotation.z = -0.18;
    g.add(lf);
  }
  var coco = new T.Mesh(new T.SphereGeometry(0.24, 6, 5), MAT.trunk);
  coco.position.set(0.2, 5.3, 0);
  g.add(coco);
  return g;
}, function (o) {
  o.position.x = rand(-12.5, -8.6);
  o.rotation.y = rand(0, Math.PI * 2);
  o.scale.setScalar(rand(0.85, 1.25));
});

/* street lamps */
pool(7, 45, -20, function () {
  var g = new T.Group();
  var pole = new T.Mesh(new T.CylinderGeometry(0.09, 0.13, 6.2, 6), MAT.lamp);
  pole.position.y = 3.1; g.add(pole);
  var arm = new T.Mesh(new T.BoxGeometry(1.5, 0.11, 0.11), MAT.lamp);
  arm.position.set(0.75, 6.1, 0); g.add(arm);
  var bulb = new T.Mesh(new T.SphereGeometry(0.25, 8, 6), MAT.bulb);
  bulb.position.set(1.45, 5.95, 0); g.add(bulb);
  g.position.x = -7.9;
  return g;
}, function () {});

/* breaking crests: short foam strips riding on the wave surface */
var foamPool = pool(isTouch ? 28 : 44, 6.5, 0, function (i) {
  var ridge = i % 4 === 0;
  var m = new T.Mesh(new T.PlaneGeometry(ridge ? rand(26, 64) : rand(3, 11), rand(0.7, 1.6)), MAT.foam.clone());
  m.rotation.x = -Math.PI / 2 + (ridge ? 0.3 : 0.4); /* tilt so crests are visible at a low angle */
  return m;
}, function (o, i) {
  var ridge = i % 4 === 0, shore = i % 2 === 0;
  o.position.x = ridge ? rand(24, 150) : (shore ? rand(10.5, 16) : rand(16, 110));
  o.position.y = SEA_Y + 0.14;
  o.rotation.y = rand(-0.3, 0.3);
  o.userData.base = ridge ? 0.78 : (shore ? 0.95 : rand(0.35, 0.7));
  o.userData.phase = rand(0, Math.PI * 2);
  o.material.opacity = o.userData.base;
});

function updateOcean(dz) {
  var a = seaPos.array, c = seaCol.array;
  for (var i = 0; i < seaPos.count; i++) {
    var wx = a[i * 3] + SEA_X, wz = a[i * 3 + 2] + SEA_Z;
    var h = waveHeight(wx, wz, t);
    a[i * 3 + 1] = h;
    var b = 0.56 + clamp((h + 0.55) / 1.1, 0, 1) * 0.76;
    var crest = clamp((h - 0.38) / 0.5, 0, 1); /* white foam on wave crests */
    /* golden sun path, painted into the surface so it follows every wave */
    var dd = (wx - (34 - wz * 0.38)) / 30;
    var glow = Math.exp(-dd * dd) * (0.24 + 0.4 * Math.max(0, Math.sin(t * 2.2 + wz * 0.06)));
    c[i * 3] = Math.min(1, seaBase[i * 3] * b + crest * 0.5 + glow);
    c[i * 3 + 1] = Math.min(1, seaBase[i * 3 + 1] * b + crest * 0.52 + glow * 0.72);
    c[i * 3 + 2] = Math.min(1, seaBase[i * 3 + 2] * b + crest * 0.55 + glow * 0.28);
  }
  seaPos.needsUpdate = true;
  seaCol.needsUpdate = true;
  seaGeo.computeVertexNormals();

  for (var j = 0; j < glints.length; j++) {
    var g = glints[j];
    g.position.z += dz * 0.42;
    if (g.position.z > 14) g.position.z -= 320;
    g.position.y = SEA_Y + waveHeight(g.position.x, g.position.z, t) + 0.18;
    g.material.opacity = 0.1 + 0.85 * Math.max(0, Math.sin(t * g.userData.freq + g.userData.phase));
  }
  for (var f = 0; f < foamPool.length; f++) {
    var fm = foamPool[f];
    var wh = waveHeight(fm.position.x, fm.position.z, t);
    fm.position.y = SEA_Y + wh + 0.15;
    var crest = clamp((wh + 0.25) / 0.8, 0.12, 1);
    fm.material.opacity = fm.userData.base * crest * (0.72 + 0.28 * Math.sin(t * 2.4 + fm.userData.phase));
  }
}

/* ---------------- coins, cones & health potions ---------------- */
var coinGeo = new T.CylinderGeometry(0.55, 0.55, 0.12, 18);
coinGeo.rotateX(Math.PI / 2);
var coinRimGeo = new T.TorusGeometry(0.36, 0.06, 6, 16);
var coinPool = pool(54, 5, -18, function () {
  var g = new T.Group();
  g.add(new T.Mesh(coinGeo, MAT.coin));
  var rim = new T.Mesh(coinRimGeo, MAT.coinRim);
  rim.position.z = 0.07;
  g.add(rim);
  var rim2 = new T.Mesh(coinRimGeo, MAT.coinRim);
  rim2.position.z = -0.07;
  g.add(rim2);
  return g;
}, function (o, i, initial) {
  placeCoin(o, o.position.z);
});

function placeCoin(c, z) {
  c.position.z = z;
  c.position.x = 4.25 * Math.sin(z * 0.052 + 1.1);
  c.position.y = 1.15 + 0.22 * Math.sin(z * 0.11);
  c.visible = true;
  c.scale.setScalar(1);
  c.rotation.y = 0;
  c.userData.taken = false;
  c.userData.pop = 0;
}

var coneHome = [[0, 0.06, 0], [0, 0.78, 0], [0, 0.83, 0]];
function resetCone(o) {
  o.visible = true;
  o.position.set(rand(-4.6, 4.6), 0, o.position.z);
  o.rotation.set(0, rand(0, 3), 0);
  o.scale.setScalar(1);
  o.userData.hit = false;
  o.userData.shatter = 0;
  for (var j = 0; j < o.children.length; j++) {
    var ch = o.children[j];
    ch.position.set(coneHome[j][0], coneHome[j][1], coneHome[j][2]);
    ch.rotation.set(0, 0, 0);
    ch.scale.setScalar(1);
  }
}
var conePool = pool(12, 23, -46, function () {
  var g = new T.Group();
  var base = new T.Mesh(new T.BoxGeometry(1.1, 0.12, 1.1), MAT.base);
  base.position.y = 0.06; g.add(base);
  var cone = new T.Mesh(new T.ConeGeometry(0.52, 1.35, 8), MAT.cone);
  cone.position.y = 0.78; g.add(cone);
  var band = new T.Mesh(new T.CylinderGeometry(0.33, 0.4, 0.22, 8), MAT.coneWhite);
  band.position.y = 0.83; g.add(band);
  return g;
}, resetCone);

/* health potion: +1 heart, capped at 3 */
function makePotion() {
  var g = new T.Group();
  g.add(new T.Mesh(new T.CylinderGeometry(0.36, 0.42, 0.86, 10), MAT.glass));
  var neck = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 0.26, 8), MAT.glass);
  neck.position.y = 0.54; g.add(neck);
  var cap = new T.Mesh(new T.CylinderGeometry(0.19, 0.19, 0.15, 8), MAT.cork);
  cap.position.y = 0.74; g.add(cap);
  var crossH = new T.Mesh(new T.BoxGeometry(0.48, 0.14, 0.06), MAT.white);
  crossH.position.set(0, 0, 0.42); g.add(crossH);
  var crossV = new T.Mesh(new T.BoxGeometry(0.14, 0.48, 0.06), MAT.white);
  crossV.position.set(0, 0, 0.43); g.add(crossV);
  return g;
}
var potionPool = pool(8, 37, -70, makePotion, function (o) {
  o.position.x = rand(-4.3, 4.3);
  o.position.y = 1.2;
  o.rotation.set(0, 0, 0);
  o.visible = true;
  o.scale.setScalar(1);
  o.userData.taken = false;
  o.userData.pop = 0;
});

/* ---------------- pelican + bicycle ---------------- */
function bar(a, b, r, mat) {
  var d = new T.Vector3().subVectors(b, a);
  var len = d.length();
  var m = new T.Mesh(new T.CylinderGeometry(r, r, len, 6), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  return m;
}
var V = function (x, y, z) { return new T.Vector3(x, y, z); };

var player = new T.Group();
scene.add(player);
var bike = new T.Group();
player.add(bike);

/* wheels */
var wheels = [];
function makeWheel(z) {
  var g = new T.Group();
  g.position.set(0, 0.72, z);
  var tireGeo = new T.TorusGeometry(0.72, 0.075, 8, 22);
  tireGeo.rotateY(Math.PI / 2);
  g.add(new T.Mesh(tireGeo, MAT.tire));
  var hub = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.22, 8), MAT.spoke);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  for (var i = 0; i < 6; i++) {
    var s = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 1.4, 4), MAT.spoke);
    s.rotation.x = i * Math.PI / 6;
    g.add(s);
  }
  bike.add(g);
  wheels.push(g);
  return g;
}
makeWheel(-0.92);
makeWheel(0.92);

/* frame */
var rear = V(0, 0.72, 0.92), front = V(0, 0.72, -0.92);
var seatTop = V(0, 1.62, 0.42), crank = V(0, 0.72, 0.4), steer = V(0, 1.6, -0.82);
[[rear, seatTop], [seatTop, crank], [crank, rear], [seatTop, steer], [steer, front], [crank, steer]]
  .forEach(function (p, i) { bike.add(bar(p[0], p[1], 0.055, i % 2 ? MAT.frame2 : MAT.frame)); });
var handle = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.95, 6), MAT.saddle);
handle.rotation.z = Math.PI / 2;
handle.position.set(0, 1.6, -0.86);
bike.add(handle);
var saddle = new T.Mesh(new T.BoxGeometry(0.36, 0.11, 0.58), MAT.saddle);
saddle.position.set(0, 1.66, 0.5);
bike.add(saddle);

var pedal = new T.Group();
pedal.position.copy(crank);
bike.add(pedal);
[0, Math.PI].forEach(function (a) {
  var arm = new T.Mesh(new T.BoxGeometry(0.07, 0.5, 0.07), MAT.saddle);
  arm.position.y = Math.cos(a) * 0.25;
  arm.rotation.x = a;
  pedal.add(arm);
  var pad = new T.Mesh(new T.BoxGeometry(0.24, 0.06, 0.34), MAT.saddle);
  pad.position.set(Math.sin(a) > 0 ? 0.16 : -0.16, Math.cos(a) * 0.5, 0);
  pedal.add(pad);
});

/* pelican */
var bird = new T.Group();
player.add(bird);

var body = new T.Group();
bird.add(body);
var torso = new T.Mesh(new T.SphereGeometry(0.7, 14, 10), MAT.feather);
torso.scale.set(0.8, 0.9, 1.18);
torso.position.set(0, 2.28, 0.42);
body.add(torso);
var tail = new T.Mesh(new T.ConeGeometry(0.36, 0.9, 6), MAT.featherShade);
tail.rotation.x = -Math.PI / 2;
tail.position.set(0, 2.25, 1.32);
body.add(tail);

var wings = [];
[-1, 1].forEach(function (s) {
  var w = new T.Group();
  w.position.set(s * 0.6, 2.45, 0.45);
  var f = new T.Mesh(new T.SphereGeometry(0.5, 10, 8), MAT.featherShade);
  f.scale.set(0.3, 0.72, 1.15);
  f.position.set(s * 0.1, -0.1, 0.1);
  w.add(f);
  body.add(w);
  wings.push(w);
});

/* neck + head */
body.add(bar(V(0, 2.8, 0.12), V(0, 3.56, -0.5), 0.17, MAT.feather));
var head = new T.Group();
head.position.set(0, 3.6, -0.58);
head.rotation.y = -0.48; /* 侧头迎风，长喙更醒目 */
body.add(head);
var skull = new T.Mesh(new T.SphereGeometry(0.4, 12, 10), MAT.feather);
skull.scale.set(0.9, 0.95, 1.05);
head.add(skull);
[-1, 1].forEach(function (s) {
  var eye = new T.Mesh(new T.SphereGeometry(0.075, 8, 6), MAT.eye);
  eye.position.set(s * 0.23, 0.09, -0.3);
  head.add(eye);
  var glint = new T.Mesh(new T.SphereGeometry(0.026, 6, 5), MAT.white);
  glint.position.set(s * 0.25 + 0.02, 0.12, -0.36);
  head.add(glint);
});
/* beak + pouch */
var upperBeak = new T.Mesh(new T.BoxGeometry(0.3, 0.1, 1.25), MAT.beak);
upperBeak.position.set(0, -0.02, -0.95);
head.add(upperBeak);
var beakTip = new T.Mesh(new T.ConeGeometry(0.15, 0.34, 4), MAT.beak);
beakTip.rotation.x = -Math.PI / 2;
beakTip.position.set(0, -0.02, -1.72);
head.add(beakTip);
var jaw = new T.Group();
head.add(jaw);
var pouch = new T.Mesh(new T.SphereGeometry(0.5, 10, 8), MAT.pouch);
pouch.scale.set(0.36, 0.28, 0.85);
pouch.position.set(0, -0.24, -0.88);
jaw.add(pouch);
var lowerBeak = new T.Mesh(new T.BoxGeometry(0.24, 0.07, 1.1), MAT.beak);
lowerBeak.position.set(0, -0.14, -0.92);
jaw.add(lowerBeak);
/* helmet */
var helmet = new T.Mesh(new T.SphereGeometry(0.43, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.helmet);
helmet.position.set(0, 0.18, 0.02);
head.add(helmet);
var brim = new T.Mesh(new T.BoxGeometry(0.66, 0.06, 0.38), MAT.helmet);
brim.position.set(0, 0.18, -0.34);
head.add(brim);
/* legs */
var legs = [];
[-1, 1].forEach(function (s) {
  var g = new T.Group();
  g.position.set(s * 0.24, 1.93, 0.48);
  var shin = new T.Mesh(new T.CylinderGeometry(0.085, 0.07, 1.05, 6), MAT.beak);
  shin.position.y = -0.52;
  g.add(shin);
  var foot = new T.Mesh(new T.BoxGeometry(0.22, 0.09, 0.36), MAT.pouch);
  foot.position.set(0, -1.05, -0.1);
  g.add(foot);
  bird.add(g);
  legs.push(g);
});

/* fake shadow */
var shadow = new T.Mesh(new T.CircleGeometry(1.35, 20),
  new T.MeshBasicMaterial({ color: 0x0b3a4a, transparent: true, opacity: 0.18, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.02;
scene.add(shadow);

/* ---------------- views ---------------- */
var portrait = function () { return camera.aspect < 0.85; };
var VIEWS = [
  { name: '跟随', fov: 68,
    pos: function (x) { var p = portrait(); return V(p ? x + 0.9 : x * 0.6 + 2.6, p ? 4.8 : 4.15, p ? 13.4 : 10.4); },
    look: function (x) { var p = portrait(); return V(p ? x + 0.25 : x * 0.42 + 0.7, 1.9, p ? -14 : -11); } },
  { name: '侧面', fov: 62,
    pos: function (x) { var p = portrait(); return V(p ? x + 4.2 : x * 0.55 + 9.8, p ? 3.6 : 2.5, p ? 9.5 : 3.4); },
    look: function (x) { var p = portrait(); return V(p ? x - 0.5 : x * 0.55, p ? 1.85 : 1.75, p ? -5 : -7); } },
  { name: '俯视', fov: 62,
    pos: function (x) { var p = portrait(); return V(p ? x : x * 0.35, 13.2, 8.5); },
    look: function (x) { var p = portrait(); return V(p ? x : x * 0.35, 0, -16); } },
  { name: '骑手', fov: 78, pos: function (x) { return V(x, 3.78, 0.35); }, look: function (x) { return V(x, 2.55, -32); } }
];

/* ---------------- state ---------------- */
var state = {
  mode: 'playing', score: 0, coins: 0, lives: 3, distance: 0, energy: 100,
  boost: false, invincible: 0, hitSlow: 1, view: 0, sound: true,
  playerX: 0, targetX: 0, speed: 0, jumpY: 0, jumpV: 0, newRecord: false
};
var keys = { left: false, right: false, boost: false };
var swipe = null;
var t = 0;

/* free orbit camera (drag / wheel / pinch) */
var free = { active: false, yaw: 0, pitch: 0.25, dist: 11 };
var focus = new T.Vector3(0, 1.7, -2);
function enterFree() {
  if (free.active) return;
  focus.set(state.playerX, 1.7, -2);
  var d = camera.position.clone().sub(focus);
  free.dist = clamp(d.length(), 3.5, 30);
  free.yaw = Math.atan2(d.x, d.z);
  free.pitch = Math.asin(clamp(d.y / free.dist, -1, 1));
  free.active = true;
}
function resetFree() { free.active = false; }

/* ---------------- audio (synthesized, no assets) ---------------- */
var actx = null;
function beep(freq, dur, type, vol, slide) {
  if (!state.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, actx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, actx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.07, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}

/* ---------------- HUD ---------------- */
var el = {
  score: $('score'), best: $('best'), speed: $('speed'), view: $('viewName'),
  lives: $('lives'), energy: $('energyBar'), boost: $('boostTag'), toast: $('toast'),
  vignette: $('vignette'), overlay: $('overlay'), ovTitle: $('ovTitle'),
  ovScore: $('ovScore'), ovRecord: $('ovRecord'), ovDesc: $('ovDesc'),
  ovBtn: $('ovBtn'), ovKeys: $('ovKeys'), hint: $('hint')
};
el.best.textContent = best;

function toast(txt, color) {
  el.toast.textContent = txt;
  el.toast.style.color = color || '#fff';
  el.toast.classList.remove('pop');
  void el.toast.offsetWidth;
  el.toast.classList.add('pop');
}

var lastHud = {};
function setText(node, key, val) {
  if (lastHud[key] === val) return;
  lastHud[key] = val;
  node.textContent = val;
}
function updateHud() {
  setText(el.score, 's', state.score);
  setText(el.best, 'b', best);
  setText(el.speed, 'v', Math.round(state.speed * 3.6) + ' km/h');
  setText(el.view, 'w', free.active ? '自由' : VIEWS[state.view].name);
  setText(el.lives, 'l', new Array(Math.max(0, state.lives) + 1).join('♥') || '—');
  el.energy.style.width = state.energy.toFixed(1) + '%';
  el.boost.classList.toggle('on', state.boost && state.mode === 'playing');
  el.vignette.classList.toggle('boost', state.boost && state.mode === 'playing');
}

function showOverlay(kind) {
  el.overlay.classList.remove('hidden');
  if (kind === 'pause') {
    el.ovTitle.textContent = '暂停中';
    el.ovScore.textContent = '';
    el.ovRecord.textContent = '';
    el.ovDesc.textContent = '海风还在吹，随时继续。';
    el.ovBtn.textContent = '继续骑行';
    el.ovKeys.innerHTML = 'P 也可继续';
  } else {
    el.ovTitle.textContent = '这趟骑完了';
    el.ovScore.textContent = state.score;
    el.ovRecord.textContent = state.newRecord ? '新纪录！' : '最高分 ' + best;
    el.ovDesc.textContent = '沿海骑行 ' + Math.round(state.distance) + ' 米 · 捡到 ' + state.coins + ' 枚金币';
    el.ovBtn.textContent = '再骑一次';
    el.ovKeys.innerHTML = '回车 / R 也可重开';
  }
}
function hideOverlay() { el.overlay.classList.add('hidden'); }

/* ---------------- game flow ---------------- */
function gameOver() {
  state.mode = 'over';
  player.visible = true;
  state.newRecord = state.score > best;
  if (state.newRecord) { best = state.score; saveBest(); }
  beep(320, 0.5, 'triangle', 0.09, 90);
  showOverlay('over');
  updateHud();
}
function restart() {
  state.mode = 'playing';
  state.score = 0; state.coins = 0; state.lives = 3; state.distance = 0; state.energy = 100;
  state.invincible = 0; state.hitSlow = 1;
  state.playerX = 0; state.targetX = 0; state.jumpY = 0; state.jumpV = 0; state.newRecord = false;
  keys.left = keys.right = keys.boost = false;
  resetFree();
  player.visible = true;
  player.position.set(0, 0, 0);
  roadTex.offset.y = 0;
  /* reset pools */
  for (var p = 0; p < pools.length; p++) {
    var pl = pools[p];
    var n = pl.arr.length;
    var gap = pl.arr[0].userData.span / n;
    for (var i = 0; i < n; i++) {
      var o = pl.arr[i];
      o.position.z = o.userData.startZ - i * gap;
      o.userData.prevZ = o.position.z;
      pl.recycle(o, i, true);
    }
  }
  hideOverlay();
  updateHud();
}
/* remember canonical start z for restarts */
for (var pp = 0; pp < pools.length; pp++) {
  var pa = pools[pp].arr;
  for (var ii = 0; ii < pa.length; ii++) pa[ii].userData.startZ = pa[ii].position.z;
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    keys.left = keys.right = keys.boost = false;
    showOverlay('pause');
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    hideOverlay();
  }
}
function jump() {
  if (state.mode !== 'playing' || state.jumpY > 0.02) return;
  state.jumpV = 9.8;
  state.jumpY = 0.01;
  beep(520, 0.16, 'sine', 0.05, 820);
}
function nextView() {
  resetFree();
  state.view = (state.view + 1) % VIEWS.length;
  beep(660, 0.08, 'sine', 0.04);
  setText(el.view, 'w', free.active ? '自由' : VIEWS[state.view].name);
}

/* ---------------- input ---------------- */
function bindHold(id, key) {
  var node = $(id);
  if (!node) return;
  var on = function (e) { e.preventDefault(); e.stopPropagation(); keys[key] = true; try { node.setPointerCapture(e.pointerId); } catch (err) {} };
  var off = function (e) { e.preventDefault(); e.stopPropagation(); keys[key] = false; };
  node.addEventListener('pointerdown', on);
  node.addEventListener('pointerup', off);
  node.addEventListener('pointercancel', off);
  node.addEventListener('lostpointercapture', off);
  node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
}
bindHold('btnLeft', 'left');
bindHold('btnRight', 'right');
bindHold('btnBoost', 'boost');

var jumpBtn = $('btnJump');
if (jumpBtn) {
  jumpBtn.addEventListener('pointerdown', function (e) {
    e.preventDefault(); e.stopPropagation(); jump();
  });
  jumpBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
}

var canvas = renderer.domElement;
var drag = null;
var touchPts = {}, touchN = 0, gesture = null;

function readGesture() {
  var ids = Object.keys(touchPts);
  if (ids.length < 2) return null;
  var a = touchPts[ids[0]], b = touchPts[ids[1]];
  return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
           dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
}

canvas.addEventListener('pointerdown', function (e) {
  if (e.pointerType === 'mouse') {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    enterFree();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    return;
  }
  touchPts[e.pointerId] = { x: e.clientX, y: e.clientY };
  touchN++;
  if (touchN === 1) {
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, target: state.targetX, jumped: false };
  } else if (touchN === 2) {
    swipe = null;
    enterFree();
    gesture = readGesture();
  }
});
canvas.addEventListener('pointermove', function (e) {
  if (drag && drag.id === e.pointerId) {
    free.yaw -= (e.clientX - drag.x) * 0.006;
    free.pitch = clamp(free.pitch + (e.clientY - drag.y) * 0.0045, -0.05, 1.25);
    drag.x = e.clientX; drag.y = e.clientY;
    return;
  }
  if (touchPts[e.pointerId]) {
    touchPts[e.pointerId].x = e.clientX;
    touchPts[e.pointerId].y = e.clientY;
  }
  if (touchN >= 2 && gesture) {
    var g = readGesture();
    if (g) {
      free.yaw -= (g.cx - gesture.cx) * 0.006;
      free.pitch = clamp(free.pitch + (g.cy - gesture.cy) * 0.0045, -0.05, 1.25);
      free.dist = clamp(free.dist * gesture.dist / g.dist, 3.5, 30);
      gesture = g;
    }
    return;
  }
  if (swipe && swipe.id === e.pointerId && touchN === 1) {
    state.targetX = clamp(swipe.target + (e.clientX - swipe.x) / innerWidth * 18, -LIMIT, LIMIT);
    if (!swipe.jumped && e.clientY - swipe.y < -46) { swipe.jumped = true; jump(); }
  }
});
var endPointer = function (e) {
  if (drag && drag.id === e.pointerId) drag = null;
  if (touchPts[e.pointerId]) { delete touchPts[e.pointerId]; touchN--; }
  if (touchN < 2) gesture = null;
  if (touchN === 0) swipe = null;
  if (swipe && swipe.id === e.pointerId) swipe = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', function (e) {
  e.preventDefault();
  enterFree();
  free.dist = clamp(free.dist + e.deltaY * 0.012, 3.5, 30);
}, { passive: false });

window.addEventListener('keydown', function (e) {
  var k = e.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'shift'].indexOf(k) >= 0) e.preventDefault();
  if (k === 'arrowleft' || k === 'a') keys.left = true;
  if (k === 'arrowright' || k === 'd') keys.right = true;
  if (k === 'shift') keys.boost = true;
  if (k === ' ' && !e.repeat) {
    if (state.mode === 'paused') togglePause();
    else jump();
  }
  if (k === 'c' || k === 'v') nextView();
  if (k === 'p' || k === 'escape') togglePause();
  if (k === 'r') restart();
  if (k === 'enter') {
    if (state.mode === 'over') restart();
    else if (state.mode === 'paused') togglePause();
  }
});
window.addEventListener('keyup', function (e) {
  var k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') keys.left = false;
  if (k === 'arrowright' || k === 'd') keys.right = false;
  if (k === 'shift') keys.boost = false;
});
document.addEventListener('visibilitychange', function () { if (document.hidden && state.mode === 'playing') togglePause(); });

$('btnView').addEventListener('click', nextView);
$('btnPause').addEventListener('click', togglePause);
$('btnSound').addEventListener('click', function () {
  state.sound = !state.sound;
  $('btnSound').textContent = state.sound ? '♪' : '×';
  $('btnSound').title = state.sound ? '音效开' : '音效关';
  if (state.sound) beep(780, 0.1, 'sine', 0.05);
});
el.ovBtn.addEventListener('click', function () {
  if (state.mode === 'over') restart();
  else if (state.mode === 'paused') togglePause();
});

el.hint.textContent = isTouch
  ? '滑动转向 · 上滑跳 · 加速 · 双指转视角 · 右上切视角'
  : 'A/D 转向 · Shift 加速 · 空格跳 · C 视角 · 拖拽旋转 · 滚轮缩放';
setTimeout(function () { el.hint.classList.add('fade'); }, 5200);

window.addEventListener('resize', function () {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

/* ---------------- collision ---------------- */
function crossed(o) {
  return o.userData.prevZ < 0 && o.position.z >= 0;
}
function shatterCone(c) {
  c.userData.hit = true;
  c.userData.shatter = 0.6;
  c.userData.fly = [];
  for (var j = 0; j < c.children.length; j++) {
    c.userData.fly.push({ dx: rand(-3.5, 3.5), dy: rand(2.5, 5.5), dz: rand(-1.5, 4),
                          rx: rand(-9, 9), rz: rand(-9, 9) });
  }
}
function checkCollisions() {
  var i, c;
  for (i = 0; i < coinPool.length; i++) {
    c = coinPool[i];
    if (c.userData.taken || !c.visible) continue;
    if (crossed(c) && Math.abs(c.position.x - state.playerX) < 1.25) {
      c.userData.taken = true;
      c.userData.pop = 0.22;
      var gain = state.boost ? 20 : 10;
      state.score += gain;
      state.coins++;
      toast('+' + gain, '#fff3b0');
      beep(state.boost ? 1180 : 940, 0.13, 'sine', 0.055, state.boost ? 1600 : 1250);
    }
  }
  /* health potion: +1 heart (max 3), or bonus points when full */
  for (i = 0; i < potionPool.length; i++) {
    var p = potionPool[i];
    if (p.userData.taken || !p.visible) continue;
    if (crossed(p) && Math.abs(p.position.x - state.playerX) < 1.25) {
      p.userData.taken = true;
      p.userData.pop = 0.22;
      if (state.lives < 3) {
        state.lives++;
        state.score += 5;
        toast('+1 ♥', '#ffd7d0');
      } else {
        state.score += 25;
        toast('+25', '#fff3b0');
      }
      beep(720, 0.18, 'sine', 0.06, 1120);
    }
  }
  /* cone: jump over / smash while boosting / otherwise lose a heart */
  for (i = 0; i < conePool.length; i++) {
    c = conePool[i];
    if (c.userData.hit || !c.visible) continue;
    if (crossed(c) && Math.abs(c.position.x - state.playerX) < 1.0) {
      if (state.jumpY > 0.85) {
        c.userData.hit = true;
        toast('跃过', '#d9f3ff');
        beep(680, 0.12, 'sine', 0.045, 900);
        continue;
      }
      if (state.boost) {
        shatterCone(c);
        state.score += 30;
        toast('撞碎 +30', '#fff0b0');
        beep(190, 0.22, 'sawtooth', 0.075, 60);
        continue;
      }
      if (state.invincible > 0) continue;
      c.userData.hit = true;
      state.lives--;
      state.invincible = 1.6;
      state.hitSlow = 0.42;
      state.score = Math.max(0, state.score - 5);
      toast('-1 ♥', '#ffd7d0');
      beep(150, 0.28, 'sawtooth', 0.075, 70);
      el.vignette.classList.add('hit');
      setTimeout(function () { el.vignette.classList.remove('hit'); }, 260);
      if (state.lives <= 0) gameOver();
      break;
    }
  }
}

/* ---------------- per-frame ---------------- */
function animateCoins(dt) {
  for (var i = 0; i < coinPool.length; i++) {
    var c = coinPool[i];
    if (!c.visible) continue;
    if (c.userData.taken) {
      c.userData.pop -= dt;
      var s = Math.max(0.001, c.userData.pop / 0.22) * 1.9;
      c.scale.setScalar(s);
      c.rotation.y += dt * 16;
      if (c.userData.pop <= 0) c.visible = false;
    } else {
      c.rotation.y += dt * 2.8;
      c.position.y += Math.sin(t * 4 + i) * dt * 0.12;
    }
  }
}

function animateCones(dt) {
  if (dt <= 0) return;
  for (var i = 0; i < conePool.length; i++) {
    var c = conePool[i];
    if (c.userData.shatter <= 0) continue;
    c.userData.shatter -= dt;
    for (var j = 0; j < c.children.length; j++) {
      var ch = c.children[j], d = c.userData.fly[j];
      ch.position.x += d.dx * dt;
      ch.position.y += d.dy * dt;
      ch.position.z += d.dz * dt;
      ch.rotation.x += d.rx * dt;
      ch.rotation.z += d.rz * dt;
      ch.scale.setScalar(Math.max(0.01, c.userData.shatter / 0.6));
    }
    if (c.userData.shatter <= 0) c.visible = false;
  }
}

function animatePotions(dt) {
  for (var i = 0; i < potionPool.length; i++) {
    var p = potionPool[i];
    if (!p.visible) continue;
    if (p.userData.taken) {
      p.userData.pop -= dt;
      p.scale.setScalar(Math.max(0.001, p.userData.pop / 0.22) * 1.8);
      p.rotation.y += dt * 15;
      if (p.userData.pop <= 0) p.visible = false;
    } else {
      p.rotation.y += dt * 1.9;
      p.position.y = 1.2 + 0.2 * Math.sin(t * 3 + i);
    }
  }
}

function animatePlayer(dt, speed) {
  var spin = speed * dt / 0.72;
  wheels[0].rotation.x -= spin;
  wheels[1].rotation.x -= spin;
  pedal.rotation.x -= spin * 0.75;
  var airborne = state.jumpY > 0.05;
  var rate = state.boost ? 13 : 9;
  body.position.y = Math.sin(t * rate) * 0.045;
  head.rotation.z = Math.sin(t * rate * 0.5) * 0.035;
  var flap = airborne ? 0.42 : 0.16;
  var flapRate = airborne ? 17 : 7;
  wings[0].rotation.z = 0.12 + Math.sin(t * flapRate) * flap;
  wings[1].rotation.z = -0.12 - Math.sin(t * flapRate) * flap;
  legs[0].rotation.x = Math.sin(t * rate) * 0.5;
  legs[1].rotation.x = Math.sin(t * rate + Math.PI) * 0.5;
  jaw.rotation.x = lerp(jaw.rotation.x, state.boost ? -0.3 : -0.05, 1 - Math.exp(-dt * 8));
  var dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  var lean = clamp(dir * 0.75 + (state.targetX - state.playerX) * 0.35, -1, 1);
  player.rotation.z = lerp(player.rotation.z, -lean * 0.17, 1 - Math.exp(-dt * 9));
  player.rotation.y = lerp(player.rotation.y, -lean * 0.1, 1 - Math.exp(-dt * 9));
  player.position.x = state.playerX;
  player.position.y = state.jumpY;
  shadow.position.x = state.playerX;
  shadow.scale.setScalar((1 - Math.abs(body.position.y) * 0.5) * (1 - state.jumpY * 0.2));
  shadow.material.opacity = 0.18 * (1 - state.jumpY * 0.25);
  if (state.invincible > 0) {
    player.visible = Math.floor(t * 14) % 2 === 0;
  } else if (!player.visible) {
    player.visible = true;
  }
}

function updateCamera(dt) {
  var v = VIEWS[state.view];
  var target, look;
  if (free.active) {
    focus.set(state.playerX, 1.7, -2);
    var cp = Math.cos(free.pitch);
    target = V(focus.x + Math.sin(free.yaw) * cp * free.dist,
               focus.y + Math.sin(free.pitch) * free.dist,
               focus.z + Math.cos(free.yaw) * cp * free.dist);
    look = focus.clone();
  } else {
    target = v.pos(state.playerX);
    look = v.look(state.playerX);
  }
  var k = 1 - Math.exp(-dt * 5.5);
  camera.position.lerp(target, k);
  lookNow.lerp(look, k);
  camera.lookAt(lookNow);
  var portrait = camera.aspect < 0.85 ? 14 : 0;
  var fov = v.fov + portrait + (state.boost ? 9 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-dt * 4));
    camera.updateProjectionMatrix();
  }
}

function updateGame(dt) {
  var base = 25 + Math.min(state.distance / 900, 1) * 17;
  state.boost = keys.boost && state.energy > 1 && state.mode === 'playing';
  if (state.boost) state.energy = Math.max(0, state.energy - 30 * dt);
  else state.energy = Math.min(100, state.energy + 16 * dt);
  if (state.invincible > 0) state.invincible -= dt;
  state.hitSlow = lerp(state.hitSlow, 1, 1 - Math.exp(-dt * 1.7));
  state.speed = base * (state.boost ? 1.7 : 1) * state.hitSlow;
  var dz = state.speed * dt;
  state.distance += dz;

  if (state.jumpY > 0 || state.jumpV > 0) {
    state.jumpV -= 25 * dt;
    state.jumpY += state.jumpV * dt;
    if (state.jumpY <= 0) { state.jumpY = 0; state.jumpV = 0; }
  }

  var dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (dir !== 0) state.targetX = clamp(state.targetX + dir * 11 * dt, -LIMIT, LIMIT);
  state.playerX = lerp(state.playerX, state.targetX, 1 - Math.exp(-dt * 11));

  roadTex.offset.y = state.distance / TILE;
  scrollPools(dz);
  checkCollisions();
}

var last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  var dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  t += dt;

  var moving = state.mode === 'playing';
  if (moving) updateGame(dt);
  animateCoins(dt);
  animatePotions(dt);
  animateCones(moving ? dt : 0);
  animatePlayer(dt, moving ? state.speed : 0);
  updateCamera(dt);
  updateOcean(moving ? state.speed * dt : 0);

  /* slow ambient motion, always on */
  for (var i = 0; i < clouds.length; i++) {
    var c = clouds[i];
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 250) c.position.x = -250;
  }
  sky.position.set(camera.position.x, 0, camera.position.z);

  updateHud();
  renderer.render(scene, camera);
}

camera.position.copy(VIEWS[0].pos(0));
lookNow.copy(VIEWS[0].look(0));
updateHud();
requestAnimationFrame(frame);

})();
