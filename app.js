/* Liquid Waves V1 — Generative Glowing Gradient
   - Ratio modes: auto/portrait/landscape/square
   - 20 palettes
   - Wave intensity slider
   - Bubble droplet toggle
   - Randomize seed
   - Photo capture
   - Video capture: exactly 20 seconds (auto stop)
*/

const $ = (id) => document.getElementById(id);

const screen = $("screen");
const ctx = screen.getContext("2d", { willReadFrequently: false });

const ui = {
  panel: $("panel"),
  hud: $("hud"),
  showHud: $("showHud"),

  format: $("format"),
  palette: $("palette"),
  t_bubbles: $("t_bubbles"),

  s_waves: $("s_waves"),
  s_res: $("s_res"),

  random: $("random"),
  snap: $("snap"),
  rec: $("rec"),

  tip: $("tip"),
};

function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function lerp(a,b,t){ return a + (b-a)*t; }

// seeded RNG (deterministic per randomize)
let SEED = Date.now() >>> 0;
function sRand(){
  // xorshift32
  SEED ^= SEED << 13; SEED >>>= 0;
  SEED ^= SEED >> 17; SEED >>>= 0;
  SEED ^= SEED << 5;  SEED >>>= 0;
  return (SEED >>> 0) / 4294967296;
}
function sRandN(n=1){ return sRand()*n; }

// Palettes: 20 mixes (glow-gradient style)
const PALETTES = [
  { name:"MAGENTA ORANGE VOID", a:"#ff2bd6", b:"#ff4d00", c:"#2b00ff", d:"#05000a" },
  { name:"CYAN LIME INK",       a:"#00f5ff", b:"#7CFF00", c:"#0033ff", d:"#04070d" },
  { name:"PURPLE TEAL GLOW",    a:"#b100ff", b:"#00ffd5", c:"#ff2b6a", d:"#07020a" },
  { name:"RED BLUE STEEL",      a:"#ff003c", b:"#00a3ff", c:"#f5ff00", d:"#05060a" },
  { name:"NEON CANDY",          a:"#ff3df2", b:"#00ffb3", c:"#ffcc00", d:"#07050a" },
  { name:"SUNSET HEAT",         a:"#ff2b2b", b:"#ffb000", c:"#6a00ff", d:"#09040a" },
  { name:"ELECTRIC LAGOON",     a:"#00d9ff", b:"#00ff6a", c:"#ff00aa", d:"#03060a" },
  { name:"ACID VIOLET",         a:"#b6ff00", b:"#ff00cc", c:"#00b3ff", d:"#06030a" },
  { name:"MOLTEN ROSE",         a:"#ff006a", b:"#ff5a00", c:"#7a00ff", d:"#0a0206" },
  { name:"PLASMA ICE",          a:"#00e5ff", b:"#7a00ff", c:"#ff2bd6", d:"#04040a" },
  { name:"AQUA ORANGE",         a:"#00ffd5", b:"#ff6a00", c:"#003bff", d:"#04040a" },
  { name:"HOT PINK SKY",        a:"#ff2bd6", b:"#00a3ff", c:"#fffb00", d:"#05060a" },
  { name:"NEON RED BLACK",      a:"#ff0033", b:"#ff3300", c:"#9900ff", d:"#000000" },
  { name:"GREEN PHOSPHOR",      a:"#00ff6a", b:"#b6ff00", c:"#00a3ff", d:"#02050a" },
  { name:"BLUEBERRY LAVA",      a:"#2b00ff", b:"#ff2b2b", c:"#ff2bd6", d:"#05020a" },
  { name:"CITRUS CYAN",         a:"#fffb00", b:"#00f5ff", c:"#ff00aa", d:"#05060a" },
  { name:"PURP ORANGE CREAM",   a:"#7a00ff", b:"#ff6a00", c:"#ffd1ff", d:"#07040a" },
  { name:"GASOLINE",            a:"#00ffd5", b:"#ff2bd6", c:"#b6ff00", d:"#02050a" },
  { name:"EMBER ICE",           a:"#ff4d00", b:"#00e5ff", c:"#7a00ff", d:"#05060a" },
  { name:"DEEP NEON",           a:"#ff00aa", b:"#00ffb3", c:"#00a3ff", d:"#02020a" },
];

for (let i=0;i<PALETTES.length;i++){
  const opt = document.createElement("option");
  opt.value = String(i);
  opt.textContent = PALETTES[i].name;
  ui.palette.appendChild(opt);
}
ui.palette.value = "0";

// Ratio / sizing
let hudHidden = false;
function setHudHidden(v){
  hudHidden = !!v;
  ui.panel.classList.toggle("hidden", hudHidden);
  ui.showHud.classList.toggle("show", hudHidden);
  ui.hud.textContent = hudHidden ? "SHOW" : "HIDE";
}
setHudHidden(false);

function viewportSize(){
  const vw = Math.floor(window.visualViewport?.width || window.innerWidth);
  const vh = Math.floor(window.visualViewport?.height || window.innerHeight);
  return { vw, vh };
}
function deviceIsLandscape(){
  const { vw, vh } = viewportSize();
  return vw > vh;
}
function chosenMode(){
  const m = ui.format.value;
  if (m === "auto") return deviceIsLandscape() ? "landscape" : "portrait";
  return m;
}
function modeAspect(mode){
  if (mode === "square") return 1;
  if (mode === "landscape") return 16/9;
  const { vw, vh } = viewportSize();
  return clamp(vw / vh, 9/19.5, 9/14);
}

const frame = document.createElement("canvas");
const fctx = frame.getContext("2d", { willReadFrequently:false });

function resizeAll(){
  const { vw, vh } = viewportSize();
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  screen.width = Math.floor(vw * dpr);
  screen.height = Math.floor(vh * dpr);

  const res = parseInt(ui.s_res.value,10); // short side
  const mode = chosenMode();
  const ar = modeAspect(mode);

  let fw, fh;
  if (ar >= 1){ fh = res; fw = Math.round(res * ar); }
  else { fw = res; fh = Math.round(res / ar); }

  frame.width = fw;
  frame.height = fh;

  ui.tip.textContent = `Mode: ${mode.toUpperCase()} • Output: ${fw}×${fh}`;
}

// Draw frame -> screen (contain / letterbox)
function drawFrameToScreen(){
  const SW = screen.width, SH = screen.height;
  const FW = frame.width, FH = frame.height;

  const scale = Math.min(SW/FW, SH/FH);
  const dw = Math.round(FW*scale);
  const dh = Math.round(FH*scale);
  const dx = Math.floor((SW - dw)/2);
  const dy = Math.floor((SH - dh)/2);

  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = "#000";
  ctx.fillRect(0,0,SW,SH);
  ctx.drawImage(frame, 0,0,FW,FH, dx,dy,dw,dh);
  ctx.restore();
}

/* ---------- Generator ---------- */

// droplets (“metaballs”)
let droplets = [];
function makeDroplets(){
  droplets = [];
  const base = 10 + Math.floor(sRandN(10));
  const n = ui.t_bubbles.checked ? base : Math.floor(base*0.5);

  for (let i=0;i<n;i++){
    droplets.push({
      x: sRandN(1),
      y: sRandN(1),
      r: lerp(0.06, 0.18, sRand()),
      vx: (sRand()*2-1) * lerp(0.02, 0.09, sRand()),
      vy: (sRand()*2-1) * lerp(0.02, 0.09, sRand()),
      w: lerp(0.6, 1.6, sRand())
    });
  }
}
makeDroplets();

function paletteColors(){
  const p = PALETTES[parseInt(ui.palette.value,10)];
  return p;
}

// smooth field function (metaball-like)
function fieldValue(nx, ny, time){
  let v = 0;

  // wave field
  const waves = parseInt(ui.s_waves.value,10)/100;
  const wf = lerp(2.0, 10.0, waves);
  const wa = lerp(0.02, 0.18, waves);

  v += Math.sin((nx*wf + time*0.9)) * wa;
  v += Math.cos((ny*(wf*0.85) - time*1.1)) * wa;
  v += Math.sin(((nx+ny)*(wf*0.55) + time*0.7)) * (wa*0.8);

  // droplets
  if (ui.t_bubbles.checked){
    for (const d of droplets){
      const dx = nx - d.x;
      const dy = ny - d.y;
      const dist2 = dx*dx + dy*dy + 0.0008;
      v += (d.r*d.r) / dist2 * 0.12 * d.w;
    }
  }

  return v;
}

// color blend helper
function hexToRgb(h){
  const x = h.replace("#","");
  const n = parseInt(x,16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}
function mix(a,b,t){
  return {
    r: Math.round(lerp(a.r,b.r,t)),
    g: Math.round(lerp(a.g,b.g,t)),
    b: Math.round(lerp(a.b,b.b,t))
  };
}

// render (CPU but optimized: pixel grid + upscale)
const low = document.createElement("canvas");
const lctx = low.getContext("2d", { willReadFrequently:true });

function render(time){
  const W = frame.width, H = frame.height;

  // low-res internal grid for speed (still looks liquid when upscaled)
  const waves = parseInt(ui.s_waves.value,10)/100;
  const grid = Math.round(lerp(160, 320, 1 - waves)); // more waves -> a bit more detail
  const LW = grid;
  const LH = Math.round(grid * (H/W));

  low.width = LW;
  low.height = LH;

  const img = lctx.createImageData(LW, LH);
  const d = img.data;

  const p = paletteColors();
  const A = hexToRgb(p.a), B = hexToRgb(p.b), C = hexToRgb(p.c), D = hexToRgb(p.d);

  // animate droplets
  if (ui.t_bubbles.checked){
    const dt = 0.016;
    for (const m of droplets){
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      // bounce
      if (m.x < -0.2 || m.x > 1.2) m.vx *= -1;
      if (m.y < -0.2 || m.y > 1.2) m.vy *= -1;
    }
  }

  // normalize time
  const t = time * 0.001;

  for (let y=0; y<LH; y++){
    const ny = y/(LH-1);
    for (let x=0; x<LW; x++){
      const nx = x/(LW-1);

      // field -> 0..1
      let v = fieldValue(nx, ny, t);
      v = 0.5 + v;          // shift
      v = clamp(v, 0, 1);

      // multi-stop gradient with a bit of “glow”
      // 0..0.33: D->A, 0.33..0.66: A->B, 0.66..1: B->C
      let col;
      if (v < 0.33) col = mix(D, A, v/0.33);
      else if (v < 0.66) col = mix(A, B, (v-0.33)/0.33);
      else col = mix(B, C, (v-0.66)/0.34);

      // edge pop (fake neon)
      const g = Math.abs(v-0.5);
      const glow = clamp((0.35 - g) * 1.8, 0, 1);

      col.r = clamp(col.r + glow*45, 0, 255);
      col.g = clamp(col.g + glow*35, 0, 255);
      col.b = clamp(col.b + glow*55, 0, 255);

      const i = (y*LW + x)*4;
      d[i] = col.r; d[i+1] = col.g; d[i+2] = col.b; d[i+3] = 255;
    }
  }

  lctx.putImageData(img,0,0);

  // upscale to frame with smoothing + bloom layer
  fctx.save();
  fctx.setTransform(1,0,0,1,0,0);
  fctx.imageSmoothingEnabled = true;
  fctx.drawImage(low, 0,0,LW,LH, 0,0,W,H);

  // bloom-ish overlay (blurred self)
  const wavesAmt = parseInt(ui.s_waves.value,10)/100;
  const blur = 6 + wavesAmt*18;
  fctx.globalCompositeOperation = "screen";
  fctx.globalAlpha = 0.28;
  fctx.filter = `blur(${blur}px)`;
  fctx.drawImage(frame,0,0);
  fctx.filter = "none";
  fctx.restore();
}

/* ---------- Capture ---------- */
function snapPhoto(){
  const a = document.createElement("a");
  a.download = `liquidwaves_${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
  a.href = frame.toDataURL("image/png");
  a.click();
}

// 20s record
let recorder = null;
let recChunks = [];
let isRecording = false;
let recTimeout = null;

function pickMimeType(){
  const opts = ["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"];
  for (const t of opts) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

async function tryShare(blob){
  try{
    const ext = (blob.type || "").includes("mp4") ? "mp4" : "webm";
    const file = new File([blob], `liquidwaves_${Date.now()}.${ext}`, { type: blob.type || "video/webm" });
    if (navigator.canShare?.({ files:[file] })){
      await navigator.share({ files:[file], title:"Liquid Waves" });
      return true;
    }
  }catch(_){}
  return false;
}

function startRecording20(){
  if (!("MediaRecorder" in window)){
    ui.tip.textContent = "Recording not supported in this browser.";
    return;
  }

  try{
    const stream = frame.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
    recChunks = [];

    recorder.ondataavailable = (e)=> { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.onstop = async ()=>{
      const blob = new Blob(recChunks, { type: recorder.mimeType || "video/webm" });

      // Prefer Share Sheet (best iPhone UX)
      const shared = await tryShare(blob);

      if (!shared){
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.download = `liquidwaves_${new Date().toISOString().replace(/[:.]/g,'-')}.webm`;
        a.href = url;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(url), 2500);
      }

      ui.tip.textContent = "Saved.";
    };

    recorder.start();
    isRecording = true;
    ui.rec.textContent = "REC…";
    ui.tip.textContent = "Recording 20s…";

    recTimeout = setTimeout(()=> stopRecording(), 20000);
  }catch(err){
    ui.tip.textContent = `REC failed: ${String(err)}`;
  }
}

function stopRecording(){
  if (recTimeout){ clearTimeout(recTimeout); recTimeout = null; }
  if (recorder && isRecording){
    recorder.stop();
  }
  isRecording = false;
  ui.rec.textContent = "REC 20s";
}

/* ---------- Loop + UI ---------- */
let lastKey = "";
function loop(ts){
  const key = [
    chosenMode(),
    ui.format.value,
    ui.s_res.value,
    (window.visualViewport?.width||0),
    (window.visualViewport?.height||0),
    ui.t_bubbles.checked ? 1 : 0
  ].join("|");

  if (key !== lastKey){
    lastKey = key;
    resizeAll();
  }

  render(ts);
  drawFrameToScreen();

  requestAnimationFrame(loop);
}

ui.hud.addEventListener("click", ()=> setHudHidden(!hudHidden));
ui.showHud.addEventListener("click", ()=> setHudHidden(false));

ui.snap.addEventListener("click", snapPhoto);

ui.rec.addEventListener("click", ()=>{
  if (isRecording) stopRecording();
  else startRecording20();
});

ui.random.addEventListener("click", ()=>{
  SEED = (Date.now() ^ (Math.random()*1e9|0)) >>> 0;
  makeDroplets();
  ui.tip.textContent = "Randomized.";
});

ui.t_bubbles.addEventListener("change", ()=>{
  makeDroplets();
});

ui.s_res.addEventListener("input", ()=> { lastKey=""; resizeAll(); });
ui.format.addEventListener("change", ()=> { lastKey=""; resizeAll(); });

if (window.visualViewport){
  window.visualViewport.addEventListener("resize", ()=> { lastKey=""; resizeAll(); });
  window.visualViewport.addEventListener("scroll", ()=> { lastKey=""; resizeAll(); });
}
window.addEventListener("orientationchange", ()=> { lastKey=""; resizeAll(); });
window.addEventListener("resize", ()=> { lastKey=""; resizeAll(); });

// init
resizeAll();
requestAnimationFrame(loop);
