'use strict';
// ---------------------------------------------------------------------------
// WebGL2 renderer
// ---------------------------------------------------------------------------

const BLOCK_VS = `#version 300 es
precision highp float;
in vec3 aPos;
in vec2 aUV;
in vec4 aLight;
in vec2 aBiome;
uniform mat4 uProjView;
uniform vec3 uOffset;
uniform float uPosScale;
uniform float uTime;
uniform vec3 uCam;
uniform vec2 uFog;
out vec2 vUV;
out vec3 vLight;
out float vFog;
out vec3 vTint;
flat out int vFlag;
// Biome grass colour from temperature (x) and humidity (y), relative to the texture's base green
vec3 grassTint(vec2 th) {
  vec3 cold = mix(vec3(0.52, 0.66, 0.42), vec3(0.32, 0.58, 0.40), th.y);
  vec3 hot = mix(vec3(0.74, 0.70, 0.27), vec3(0.24, 0.72, 0.13), th.y);
  return mix(cold, hot, th.x) / vec3(0.43, 0.66, 0.28);
}
void main() {
  vec3 p = aPos * uPosScale + uOffset;
  int flagAll = int(aLight.w * 255.0 + 0.5);
  int flag = flagAll & 15;
  vTint = (flagAll & 16) != 0 ? grassTint(aBiome) : vec3(-1.0);
  if (flag == 1) {
    p.x += sin(uTime * 1.8 + p.x * 0.6 + p.z * 0.4) * 0.06;
    p.z += cos(uTime * 1.5 + p.x * 0.4 + p.z * 0.6) * 0.05;
  }
  if (flag == 2) {
    p.y += (sin(uTime * 1.6 + p.x * 0.8 + p.z * 0.5) * 0.5 - 0.5) * 0.04 * step(0.01, fract(p.y));
  }
  vUV = aUV / 512.0;
  vLight = aLight.xyz;
  vFlag = flag;
  float d = length(p.xz - uCam.xz);
  vFog = smoothstep(uFog.x, uFog.y, d);
  gl_Position = uProjView * vec4(p, 1.0);
}`;

const BLOCK_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vLight;
in float vFog;
in vec3 vTint;
flat in int vFlag;
uniform sampler2D uTex;
uniform float uDaylight;
uniform vec3 uSkyTint;
uniform vec3 uFogColor;
uniform float uAlpha;
uniform float uBright;
out vec4 outColor;
float curve(float l) {
  float b = l / (4.0 - 3.0 * l);
  return mix(b, 1.0 - pow(1.0 - b, 4.0), uBright);
}
void main() {
  vec4 c = texture(uTex, vUV);
  if (c.a < 0.1) discard;
  if (vTint.x >= 0.0) {
    float m = smoothstep(0.02, 0.1, c.g - max(c.r, c.b));
    c.rgb = mix(c.rgb, clamp(c.rgb * vTint, 0.0, 1.0), m);
  }
  float sky = vLight.x * uDaylight;
  float bl = vLight.y;
  float sb = curve(sky);
  float bb = curve(bl);
  vec3 light = max(vec3(sb) * uSkyTint, vec3(bb) * vec3(1.0, 0.84, 0.6));
  light = max(light, vec3(0.025));
  vec3 col = c.rgb * light * vLight.z;
  if (vFlag == 3) col = mix(col, vec3(1.0, 0.1, 0.1), 0.5);
  if (vFlag == 4) col = mix(col, vec3(1.0), 0.65);
  if (vFlag == 5) col = c.rgb * vLight.z * max(uDaylight, 0.25);
  col = mix(col, uFogColor, vFog);
  outColor = vec4(col, c.a * uAlpha);
}`;

const SKY_VS = `#version 300 es
in vec2 aPos;
out vec2 vPos;
void main() { vPos = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vPos;
uniform mat4 uInvVP;
uniform vec3 uSun;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform float uNight;
uniform float uSunset;
uniform float uUnder;
out vec4 outColor;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec4 w = uInvVP * vec4(vPos, 1.0, 1.0);
  vec3 dir = normalize(w.xyz / w.w);
  float t = clamp(dir.y, -1.0, 1.0);
  vec3 col = mix(uHorizon, uTop, smoothstep(-0.05, 0.45, t));
  if (t < -0.05) col = uHorizon;
  // sunset glow
  vec3 sunH = normalize(vec3(uSun.x, 0.0, uSun.z) + vec3(0.0001));
  float glow = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)), sunH), 0.0), 3.0) * (1.0 - smoothstep(0.0, 0.5, abs(t)));
  col = mix(col, vec3(1.0, 0.45, 0.15), glow * uSunset * 0.75);
  // stars
  if (uNight > 0.0 && t > 0.0) {
    vec3 q = floor(dir * 180.0);
    float h = hash(q);
    if (h > 0.996) col += vec3(0.8 + 0.2 * hash(q + 3.0)) * uNight * smoothstep(0.0, 0.3, t);
  }
  // sun (square, like the classic)
  vec3 sun = normalize(uSun);
  vec3 su = normalize(cross(sun, vec3(0.0, 0.0, 1.0)));
  vec3 sv = cross(su, sun);
  float d = dot(dir, sun);
  if (d > 0.0) {
    vec2 q = vec2(dot(dir, su), dot(dir, sv)) / d;
    float m = max(abs(q.x), abs(q.y));
    if (m < 0.085) col = mix(vec3(1.0, 1.0, 0.85), vec3(1.0, 0.95, 0.6), smoothstep(0.0, 0.085, m));
    else col += vec3(1.0, 0.8, 0.5) * 0.25 * pow(max(0.0, 1.0 - (m - 0.085) * 2.2), 4.0) * (1.0 - uNight);
  } else {
    vec2 q = vec2(dot(dir, su), dot(dir, sv)) / -d;
    float m = max(abs(q.x), abs(q.y));
    if (m < 0.06) {
      vec2 g = floor((q + 0.06) / 0.12 * 8.0);
      float cr = hash(vec3(g, 2.0));
      col = vec3(0.86, 0.88, 0.95) * (cr > 0.8 ? 0.75 : 1.0);
    }
  }
  if (uUnder > 0.5) col = vec3(0.05, 0.12, 0.35);
  outColor = vec4(col, 1.0);
}`;

const LINE_VS = `#version 300 es
in vec3 aPos;
uniform mat4 uProjView;
void main() { gl_Position = uProjView * vec4(aPos, 1.0); }`;
const LINE_FS = `#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = uColor; }`;

// Builder for per-frame geometry (entities, particles, held item, ...)
class DynamicMesh {
  constructor(cap = 65536) { this.f = new Float32Array(cap * 6); this.u = new Uint32Array(this.f.buffer); this.n = 0; }
  reset() { this.n = 0; }
  ensure(k) {
    if ((this.n + k) * 6 > this.f.length) {
      const nf = new Float32Array(this.f.length * 2); nf.set(this.f); this.f = nf; this.u = new Uint32Array(nf.buffer);
    }
  }
  vert(x, y, z, u, v, sky, blk, shade, flag) {
    const o = this.n * 6;
    this.f[o] = x; this.f[o + 1] = y; this.f[o + 2] = z; this.f[o + 3] = u; this.f[o + 4] = v;
    this.u[o + 5] = (Math.round(sky * 17)) | (Math.round(blk * 17) << 8) | (Math.round(clamp(shade, 0, 1) * 255) << 16) | (flag << 24);
    this.n++;
  }
  // quad from 4 points (BL,BR,TR,TL); uv rect in pixels [u0,v0,u1,v1] of tile
  quad(p0, p1, p2, p3, tile, rect, sky, blk, shade, flag = 0) {
    this.ensure(4);
    const tu = (tile % ATLAS_COLS) * 16, tv = Math.floor(tile / ATLAS_COLS) * 16;
    const r = rect || [0, 0, 16, 16];
    this.vert(p0[0], p0[1], p0[2], tu + r[0], tv + r[3], sky, blk, shade, flag);
    this.vert(p1[0], p1[1], p1[2], tu + r[2], tv + r[3], sky, blk, shade, flag);
    this.vert(p2[0], p2[1], p2[2], tu + r[2], tv + r[1], sky, blk, shade, flag);
    this.vert(p3[0], p3[1], p3[2], tu + r[0], tv + r[1], sky, blk, shade, flag);
  }
  // Transformed unit cube [0,1]^3 via matrix m. tiles: array[6] (face order +x,-x,+y,-y,+z,-z)
  box(m, tiles, sky, blk, flag = 0, rects = null, shadeMul = 1) {
    const tmp = [0, 0, 0];
    const pts = [];
    for (let i = 0; i < 8; i++) {
      Mat4.transformPoint(m, i & 1, (i >> 1) & 1, (i >> 2) & 1, tmp);
      pts.push([tmp[0], tmp[1], tmp[2]]);
    }
    const P = (c) => pts[c[0] | (c[1] << 1) | (c[2] << 2)];
    for (let f = 0; f < 6; f++) {
      if (tiles[f] < 0) continue;
      const cs = FACE_CORNERS[f];
      this.quad(P(cs[0]), P(cs[1]), P(cs[2]), P(cs[3]), tiles[f], rects ? rects[f] : null, sky, blk, FACE_SHADE[f] * shadeMul, flag);
    }
  }
}

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not supported by this browser.');
    this.gl = gl;
    this.blockProg = this.program(BLOCK_VS, BLOCK_FS);
    this.skyProg = this.program(SKY_VS, SKY_FS);
    this.lineProg = this.program(LINE_VS, LINE_FS);
    this.loc = {};
    for (const n of ['uProjView', 'uOffset', 'uPosScale', 'uTime', 'uCam', 'uFog', 'uTex', 'uDaylight', 'uSkyTint', 'uFogColor', 'uAlpha', 'uBright'])
      this.loc[n] = gl.getUniformLocation(this.blockProg, n);
    this.skyLoc = {};
    for (const n of ['uInvVP', 'uSun', 'uTop', 'uHorizon', 'uNight', 'uSunset', 'uUnder']) this.skyLoc[n] = gl.getUniformLocation(this.skyProg, n);
    this.lineLoc = { uProjView: gl.getUniformLocation(this.lineProg, 'uProjView'), uColor: gl.getUniformLocation(this.lineProg, 'uColor') };

    this.quadIndexCount = 0;
    this.indexBuffer = gl.createBuffer();
    this.ensureIndices(65536);

    // sky fullscreen triangle
    this.skyVao = gl.createVertexArray();
    gl.bindVertexArray(this.skyVao);
    const sb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // dynamic mesh buffers
    this.dyn = this.makeDynamic();
    this.dynTrans = this.makeDynamic();
    this.dynHand = this.makeDynamic();
    this.clouds = this.makeDynamic();
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    this.lineBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);

    this.proj = Mat4.create(); this.view = Mat4.create(); this.projView = Mat4.create();
    this.invVP = Mat4.create(); this.tmp = Mat4.create();
    this.planes = [];
    this.stats = { chunks: 0, faces: 0 };
    this.animTimer = 0;
  }

  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aUV'); gl.bindAttribLocation(p, 2, 'aLight'); gl.bindAttribLocation(p, 3, 'aBiome');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  ensureIndices(quads) {
    if (quads <= this.quadIndexCount) return;
    const n = Math.max(quads, this.quadIndexCount * 2);
    const idx = new Uint32Array(n * 6);
    for (let q = 0, v = 0; q < n; q++, v += 4) {
      const o = q * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
    }
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.quadIndexCount = n;
    // rebind to all VAOs lazily: each VAO binds the index buffer on creation, buffer object identity unchanged
  }

  uploadAtlas() {
    const gl = this.gl;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, Atlas.canvas);
    // Manual per-tile mipmaps to avoid bleeding between tiles
    const src = Atlas.ctx.getImageData(0, 0, ATLAS_PX, ATLAS_PX).data;
    let prev = src, size = ATLAS_PX;
    for (let level = 1; level <= 4; level++) {
      const ns = size >> 1;
      const out = new Uint8Array(ns * ns * 4);
      for (let y = 0; y < ns; y++) for (let x = 0; x < ns; x++) {
        let r = 0, g = 0, b = 0, a = 0, cnt = 0;
        for (let k = 0; k < 4; k++) {
          const sx = x * 2 + (k & 1), sy = y * 2 + (k >> 1);
          const i = (sy * size + sx) * 4;
          const al = prev[i + 3];
          if (al > 0) { r += prev[i] * al; g += prev[i + 1] * al; b += prev[i + 2] * al; cnt += al; }
          a += al;
        }
        const o = (y * ns + x) * 4;
        if (cnt > 0) { out[o] = r / cnt; out[o + 1] = g / cnt; out[o + 2] = b / cnt; }
        out[o + 3] = a / 4 > 100 ? Math.max(a / 4, 180) : a / 4;
      }
      gl.texImage2D(gl.TEXTURE_2D, level, gl.RGBA, ns, ns, 0, gl.RGBA, gl.UNSIGNED_BYTE, out);
      prev = out; size = ns;
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 4);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  animateAtlas(time) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const a of Atlas.animated) {
      const data = animateTile(a, time);
      const idx = Atlas.tiles[a.name];
      gl.texSubImage2D(gl.TEXTURE_2D, 0, (idx % ATLAS_COLS) * 16, Math.floor(idx / ATLAS_COLS) * 16, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data.buffer));
    }
  }

  makeChunkVao(data) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.UNSIGNED_SHORT, false, 16, 6);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 16, 10);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.UNSIGNED_BYTE, true, 16, 14);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bindVertexArray(null);
    return { vao, vbo };
  }

  uploadChunk(chunk, m) {
    this.deleteChunkMesh(chunk);
    this.ensureIndices(Math.max(m.nOpaque, m.nTrans) / 4 + 1);
    const mesh = { opaque: null, trans: null, nO: m.nOpaque / 4 * 6, nT: m.nTrans / 4 * 6 };
    if (m.nOpaque) mesh.opaque = this.makeChunkVao(m.opaque);
    if (m.nTrans) mesh.trans = this.makeChunkVao(m.trans);
    chunk.mesh = mesh;
  }

  deleteChunkMesh(chunk) {
    const gl = this.gl, m = chunk.mesh;
    if (!m) return;
    for (const part of [m.opaque, m.trans]) if (part) { gl.deleteBuffer(part.vbo); gl.deleteVertexArray(part.vao); }
    chunk.mesh = null;
  }

  makeDynamic() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 24, 20);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bindVertexArray(null);
    return { vao, vbo, count: 0 };
  }

  uploadDynamic(d, mesh) {
    const gl = this.gl;
    this.ensureIndices(mesh.n / 4 + 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, d.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.f.subarray(0, mesh.n * 6), gl.DYNAMIC_DRAW);
    d.count = mesh.n / 4 * 6;
  }

  drawDynamic(d) {
    if (!d.count) return;
    const gl = this.gl;
    gl.uniform3f(this.loc.uOffset, 0, 0, 0);
    gl.uniform1f(this.loc.uPosScale, 1);
    gl.bindVertexArray(d.vao);
    gl.drawElements(gl.TRIANGLES, d.count, gl.UNSIGNED_INT, 0);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * (this.resScale || 1);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  // Build cloud geometry once
  buildClouds(seed) {
    const n = new SimplexNoise(seed + 555);
    const G = 64, S = 12, Y = 120, T = 4;
    const cell = (x, z) => {
      x = ((x % G) + G) % G; z = ((z % G) + G) % G;
      // tileable noise via torus mapping
      const a = x / G * Math.PI * 2, b = z / G * Math.PI * 2;
      const v = n.noise3D(Math.cos(a) * 3, Math.sin(a) * 3 + Math.cos(b) * 3, Math.sin(b) * 3) + n.noise3D(Math.cos(a) * 7, Math.sin(b) * 7, Math.sin(a) * 7 + Math.cos(b) * 7) * 0.4;
      return v > 0.25;
    };
    const m = new DynamicMesh(32768);
    const w = tileIndex('white');
    for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
      if (!cell(x, z)) continue;
      const x0 = x * S, z0 = z * S, x1 = x0 + S, z1 = z0 + S, y0 = Y, y1 = Y + T;
      m.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], w, [4, 4, 12, 12], 15, 0, 1.0, 5);
      m.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], w, [4, 4, 12, 12], 15, 0, 0.72, 5);
      if (!cell(x + 1, z)) m.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], w, [4, 4, 12, 12], 15, 0, 0.85, 5);
      if (!cell(x - 1, z)) m.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], w, [4, 4, 12, 12], 15, 0, 0.85, 5);
      if (!cell(x, z + 1)) m.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], w, [4, 4, 12, 12], 15, 0, 0.92, 5);
      if (!cell(x, z - 1)) m.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], w, [4, 4, 12, 12], 15, 0, 0.92, 5);
    }
    this.uploadDynamic(this.clouds, m);
    this.cloudSize = G * S;
  }

  // ---- Frame -----------------------------------------------------------------
  setCamera(cam, fov, aspect, far) {
    Mat4.perspective(this.proj, fov * Math.PI / 180, aspect, 0.05, far);
    Mat4.identity(this.view);
    Mat4.rotateZ(this.view, this.view, -(cam.roll || 0));
    Mat4.rotateX(this.view, this.view, -cam.pitch);
    Mat4.rotateY(this.view, this.view, -cam.yaw);
    Mat4.translate(this.view, this.view, -cam.x, -cam.y, -cam.z);
    Mat4.multiply(this.projView, this.proj, this.view);
    frustumPlanes(this.projView, this.planes);
    // inverse of rotation-only view-projection for the sky
    Mat4.copy(this.tmp, this.view); this.tmp[12] = this.tmp[13] = this.tmp[14] = 0;
    Mat4.multiply(this.invVP, this.proj, this.tmp);
    Mat4.invert(this.invVP, this.invVP);
  }

  render(s) {
    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const aspect = this.canvas.width / this.canvas.height;
    const far = Math.max(160, s.renderDist * 16 + 48);
    this.setCamera(s.cam, s.fov, aspect, far + 600);
    gl.clearColor(s.fogColor[0], s.fogColor[1], s.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // sky
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.useProgram(this.skyProg);
    gl.uniformMatrix4fv(this.skyLoc.uInvVP, false, this.invVP);
    gl.uniform3fv(this.skyLoc.uSun, s.sunDir);
    gl.uniform3fv(this.skyLoc.uTop, s.skyTop);
    gl.uniform3fv(this.skyLoc.uHorizon, s.fogColor);
    gl.uniform1f(this.skyLoc.uNight, s.night);
    gl.uniform1f(this.skyLoc.uSunset, s.sunset);
    gl.uniform1f(this.skyLoc.uUnder, s.underwater ? 1 : 0);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    gl.useProgram(this.blockProg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const L = this.loc;
    gl.uniform1i(L.uTex, 0);
    gl.uniformMatrix4fv(L.uProjView, false, this.projView);
    gl.uniform1f(L.uTime, s.time);
    gl.uniform3f(L.uCam, s.cam.x, s.cam.y, s.cam.z);
    const fogFar = s.underwater ? 14 : s.renderDist * 16 - 4;
    const fogNear = s.underwater ? 0 : fogFar * 0.62;
    gl.uniform2f(L.uFog, fogNear, fogFar);
    gl.uniform1f(L.uDaylight, s.daylight);
    gl.uniform3fv(L.uSkyTint, s.skyTint);
    gl.uniform3fv(L.uFogColor, s.underwater ? [0.05, 0.12, 0.35] : s.fogColor);
    gl.uniform1f(L.uAlpha, 1);
    gl.uniform1f(L.uBright, s.brightness);
    gl.uniform1f(L.uPosScale, 1 / POS_SCALE);

    // opaque chunks
    const visible = [];
    let faces = 0;
    for (const c of s.chunks) {
      if (!c.mesh) continue;
      const x0 = c.cx * 16, z0 = c.cz * 16;
      if (!aabbInFrustum(this.planes, x0, 0, z0, x0 + 16, c.maxY + 2, z0 + 16)) continue;
      visible.push(c);
      if (c.mesh.opaque) {
        gl.uniform3f(L.uOffset, x0, 0, z0);
        gl.bindVertexArray(c.mesh.opaque.vao);
        gl.drawElements(gl.TRIANGLES, c.mesh.nO, gl.UNSIGNED_INT, 0);
        faces += c.mesh.nO / 6;
      }
    }
    // plants are double sided already; entities etc.
    if (s.dyn) { this.uploadDynamic(this.dyn, s.dyn); gl.disable(gl.CULL_FACE); this.drawDynamic(this.dyn); gl.enable(gl.CULL_FACE); }

    // clouds
    if (s.clouds && !s.underwater) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.CULL_FACE);
      gl.uniform1f(L.uAlpha, 0.78);
      gl.uniform2f(L.uFog, far * 0.9, far * 2.2);
      gl.uniform1f(L.uPosScale, 1);
      const S = this.cloudSize, drift = s.time * 1.2;
      const bx = Math.floor((s.cam.x - drift) / S) * S + drift, bz = Math.floor(s.cam.z / S) * S;
      gl.bindVertexArray(this.clouds.vao);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        gl.uniform3f(L.uOffset, bx + dx * S, 0, bz + dz * S);
        gl.drawElements(gl.TRIANGLES, this.clouds.count, gl.UNSIGNED_INT, 0);
      }
      gl.uniform1f(L.uAlpha, 1);
      gl.uniform2f(L.uFog, fogNear, fogFar);
      gl.enable(gl.CULL_FACE);
    }

    // translucent: water / ice, back to front
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(L.uPosScale, 1 / POS_SCALE);
    const cx = s.cam.x, cz = s.cam.z;
    visible.sort((a, b) => ((b.cx * 16 + 8 - cx) ** 2 + (b.cz * 16 + 8 - cz) ** 2) - ((a.cx * 16 + 8 - cx) ** 2 + (a.cz * 16 + 8 - cz) ** 2));
    for (const c of visible) {
      if (!c.mesh.trans) continue;
      gl.uniform3f(L.uOffset, c.cx * 16, 0, c.cz * 16);
      gl.bindVertexArray(c.mesh.trans.vao);
      gl.drawElements(gl.TRIANGLES, c.mesh.nT, gl.UNSIGNED_INT, 0);
    }
    if (s.dynTrans && s.dynTrans.n) { gl.depthMask(false); this.uploadDynamic(this.dynTrans, s.dynTrans); this.drawDynamic(this.dynTrans); gl.depthMask(true); }
    gl.enable(gl.CULL_FACE);

    // selection outline
    if (s.selection) this.drawSelection(s.selection);

    // held item / hand
    if (s.hand && s.hand.n) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.BLEND);
      gl.useProgram(this.blockProg);
      Mat4.perspective(this.tmp, 70 * Math.PI / 180, aspect, 0.01, 10);
      gl.uniformMatrix4fv(L.uProjView, false, this.tmp);
      gl.uniform3f(L.uCam, 0, 0, 0);
      gl.uniform2f(L.uFog, 1000, 1001);
      gl.disable(gl.CULL_FACE);
      this.uploadDynamic(this.dynHand, s.hand);
      this.drawDynamic(this.dynHand);
      gl.enable(gl.CULL_FACE);
    }
    gl.bindVertexArray(null);
    this.stats.chunks = visible.length; this.stats.faces = faces;
  }

  drawSelection(sel) {
    const gl = this.gl;
    const e = 0.002;
    const x0 = sel.x0 - e, y0 = sel.y0 - e, z0 = sel.z0 - e, x1 = sel.x1 + e, y1 = sel.y1 + e, z1 = sel.z1 + e;
    const v = [
      x0, y0, z0, x1, y0, z0, x1, y0, z0, x1, y0, z1, x1, y0, z1, x0, y0, z1, x0, y0, z1, x0, y0, z0,
      x0, y1, z0, x1, y1, z0, x1, y1, z0, x1, y1, z1, x1, y1, z1, x0, y1, z1, x0, y1, z1, x0, y1, z0,
      x0, y0, z0, x0, y1, z0, x1, y0, z0, x1, y1, z0, x1, y0, z1, x1, y1, z1, x0, y0, z1, x0, y1, z1,
    ];
    gl.useProgram(this.lineProg);
    gl.uniformMatrix4fv(this.lineLoc.uProjView, false, this.projView);
    gl.uniform4f(this.lineLoc.uColor, 0, 0, 0, 0.55);
    gl.enable(gl.BLEND);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, 24);
    gl.disable(gl.BLEND);
    gl.useProgram(this.blockProg);
  }
}
