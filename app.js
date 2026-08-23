/* ============================================================
   落書きアート RAKUMO — フロントエンド ロジック
   バックエンド(FastAPI)と通信して、実際のアップロード〜生成〜回転
   〜ダウンロードまでを行う。
   ============================================================ */

// バックエンドのURL。開発中はlocalhost、本番ではデプロイ先のURLに変更する。
const API_BASE = window.RAKUMO_API_BASE || "http://localhost:8000";

const STYLE_IDS = ["andy","dynamic","matisse","rothko","mirror","cubism","lichtenstein","triptych"];
let STYLE_META = {}; // id -> {name, description} ※ /api/styles から取得

/* ---- ログイン状態 ---- */
let authToken = localStorage.getItem("rakumo_token") || null;
let authUserEmail = localStorage.getItem("rakumo_user_email") || null;
let authMode = "login"; // "login" または "signup"

function authHeaders(){
  return authToken ? {"Authorization": `Bearer ${authToken}`} : {};
}

function setSession(token, email){
  authToken = token;
  authUserEmail = email;
  if(token){
    localStorage.setItem("rakumo_token", token);
    localStorage.setItem("rakumo_user_email", email || "");
  }else{
    localStorage.removeItem("rakumo_token");
    localStorage.removeItem("rakumo_user_email");
  }
  updateAuthUI();
}

function updateAuthUI(){
  if(authToken){
    $("loginBtn").hidden = true;
    $("userInfo").hidden = false;
    $("userEmail").textContent = authUserEmail || "";
  }else{
    $("loginBtn").hidden = false;
    $("userInfo").hidden = true;
  }
}

function openAuthModal(mode){
  authMode = mode;
  $("authEmail").value = "";
  $("authPassword").value = "";
  $("authStatus").textContent = "";
  updateAuthModeUI();
  $("authModal").hidden = false;
}
function closeAuthModal(){ $("authModal").hidden = true; }

function updateAuthModeUI(){
  const isLogin = authMode === "login";
  $("authTabLogin").classList.toggle("active", isLogin);
  $("authTabSignup").classList.toggle("active", !isLogin);
  $("authSubmitBtn").textContent = isLogin ? "ログイン" : "新規登録";
}

$("loginBtn").addEventListener("click", ()=> openAuthModal("login"));
$("closeAuthModal").addEventListener("click", closeAuthModal);
$("authModal").addEventListener("click", e=>{ if(e.target.id==="authModal") closeAuthModal(); });
$("authTabLogin").addEventListener("click", ()=>{ authMode="login"; updateAuthModeUI(); });
$("authTabSignup").addEventListener("click", ()=>{ authMode="signup"; updateAuthModeUI(); });
$("logoutBtn").addEventListener("click", ()=>{ setSession(null, null); });

$("authForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  const endpoint = authMode === "login" ? "login" : "signup";
  $("authStatus").textContent = authMode === "login" ? "ログイン中…" : "登録中…";
  $("authSubmitBtn").disabled = true;

  let res, data;
  try{
    res = await fetch(`${API_BASE}/api/auth/${endpoint}`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({email, password})
    });
    data = await res.json();
  }catch(err){
    $("authStatus").textContent = "サーバーに接続できませんでした。";
    $("authSubmitBtn").disabled = false;
    return;
  }
  $("authSubmitBtn").disabled = false;

  if(!res.ok){
    $("authStatus").textContent = data.detail || "エラーが発生しました。";
    return;
  }

  if(data.email_confirmation_required){
    $("authStatus").textContent = "確認メールを送りました。メール内のリンクをクリックしてから、ログインしてください。";
    return;
  }

  setSession(data.access_token, data.user && data.user.email);
  closeAuthModal();
});

updateAuthUI();

let motifId = null;
let baseGenerations = {};    // style -> {generation_id, image_url}
let displayGenerations = {}; // style -> {image_url}  (回転反映後の表示用)
let selectedStyle = null;
let rotationDeg = 0;

function $(id){ return document.getElementById(id); }

/* ---- モーダルの開閉 ---- */
function openModal(){
  $("appModal").hidden = false;
  resetToUploadPane();
}
function closeModal(){
  $("appModal").hidden = true;
}
$("openUploadBtn").addEventListener("click", ()=>{ openModal(); $("dropzone").click(); });
$("openSampleBtn").addEventListener("click", ()=>{ openModal(); runSample(); });
$("ctaUploadBtn").addEventListener("click", ()=>{ openModal(); });
$("closeModal").addEventListener("click", closeModal);
$("appModal").addEventListener("click", (e)=>{ if(e.target.id==="appModal") closeModal(); });

function resetToUploadPane(){
  $("uploadPane").hidden = false;
  $("resultPane").hidden = true;
  $("uploadStatus").textContent = "";
}

/* ---- アップロードUI ---- */
$("dropzone").addEventListener("click", ()=> $("fileInput").click());
$("dropzone").addEventListener("dragover", e=>{ e.preventDefault(); $("dropzone").style.borderColor="#F0847A"; });
$("dropzone").addEventListener("dragleave", ()=>{ $("dropzone").style.borderColor=""; });
$("dropzone").addEventListener("drop", e=>{
  e.preventDefault();
  $("dropzone").style.borderColor="";
  const file = e.dataTransfer.files[0];
  if(file) handleUpload(file);
});
$("fileInput").addEventListener("change", e=>{
  const file = e.target.files[0];
  if(file) handleUpload(file);
  e.target.value = "";
});
$("sampleBtnInner").addEventListener("click", runSample);

/* ---- サンプル落書き生成(クライアント側でcanvas描画→blob化してアップロード) ---- */
function rand(a,b){ return Math.random()*(b-a)+a; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function generateSampleDoodleCanvas(){
  const c = document.createElement("canvas");
  c.width=700; c.height=900;
  const ctx = c.getContext("2d");
  ctx.fillStyle="#fdfaf3"; ctx.fillRect(0,0,c.width,c.height);
  const palette=["#7a2f8f","#c0272d","#28448f","#c8940f","#2e6b3e","#c9782e"];

  function crayonLine(pts,color,width){
    ctx.strokeStyle=color; ctx.lineWidth=width; ctx.lineCap="round"; ctx.lineJoin="round";
    ctx.globalAlpha=0.85+Math.random()*0.15;
    ctx.beginPath();
    ctx.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
    ctx.stroke();
    ctx.globalAlpha=1;
  }
  function drawSwirl(cx,cy,turns,growth,squish,color,width){
    let pts=[]; const rot=rand(0,Math.PI*2);
    for(let a=0;a<Math.PI*turns;a+=0.15){
      const r=14+a*growth, ang=a+rot;
      pts.push([cx+r*Math.cos(ang)+rand(-6,6), cy+r*Math.sin(ang)*squish+rand(-6,6)]);
    }
    crayonLine(pts,color,width);
  }
  function drawLoop(cx,cy,rr,color,width){
    let loop=[];
    for(let a=0;a<=Math.PI*2+0.3;a+=0.3) loop.push([cx+rr*Math.cos(a)+rand(-3,3), cy+rr*0.75*Math.sin(a)+rand(-3,3)]);
    crayonLine(loop,color,width);
  }

  const cx=rand(250,450), cy=rand(300,480);
  drawSwirl(cx,cy, rand(5,9), rand(8,14), rand(0.6,0.95), pick(palette), rand(7,11));
  const nLoops=Math.floor(rand(4,9));
  for(let i=0;i<nLoops;i++) drawLoop(rand(150,550), rand(600,850), rand(16,40), pick(palette), rand(5,8));

  return c;
}

/* ---- サンプル体験の高速化 ----
   「サンプルで試す」は、初めて訪れた人が待たされずに価値を感じられるかを
   左右する重要な導線のため、実際のアップロード〜8スタイル生成(数十秒)を
   経由せず、あらかじめ1回だけ生成しておいた本物の結果(実在するgeneration_id)
   をそのまま使い回す。ダウンロードやギャラリー投稿も、実在するIDなので
   通常のアップロード結果と同じように機能する。 */
const SAMPLE_MOTIF_ID = "0320108794344a03";
const SAMPLE_GENERATIONS = {
  andy:          {generation_id:"cce69e59c6d3422d", image_url:"/api/result/cce69e59c6d3422d"},
  dynamic:       {generation_id:"98247d1b90134781", image_url:"/api/result/98247d1b90134781"},
  matisse:       {generation_id:"605bf3b8f51a4889", image_url:"/api/result/605bf3b8f51a4889"},
  rothko:        {generation_id:"c95a1cf4e5124696", image_url:"/api/result/c95a1cf4e5124696"},
  mirror:        {generation_id:"1c3c96483efa4636", image_url:"/api/result/1c3c96483efa4636"},
  cubism:        {generation_id:"87366978e30a4f95", image_url:"/api/result/87366978e30a4f95"},
  lichtenstein:  {generation_id:"63000ae13f5a4c11", image_url:"/api/result/63000ae13f5a4c11"},
  triptych:      {generation_id:"6748eed959414b89", image_url:"/api/result/6748eed959414b89"},
};

async function runSample(){
  motifId = SAMPLE_MOTIF_ID;

  // サンプルは生成済みの結果を出すだけなので、進捗ゲージも失敗表示も不要
  $("genProgress").hidden = true;
  $("genFailed").hidden = true;
  $("uploadPane").hidden = true;
  $("resultPane").hidden = false;
  const origImg = new Image();
  origImg.crossOrigin = "anonymous";
  origImg.onload = ()=>{
    const cv = $("origCanvas");
    const dispW = 260, dispH = Math.round(dispW*origImg.height/origImg.width);
    cv.width=dispW; cv.height=dispH;
    const cctx = cv.getContext("2d");
    cctx.fillStyle="#fff"; cctx.fillRect(0,0,dispW,dispH);
    cctx.drawImage(origImg,0,0,dispW,dispH);
  };
  origImg.src = `${API_BASE}/api/motif/${motifId}`;

  baseGenerations = {}; displayGenerations = {}; selectedStyle=null;
  const grid = $("resultGrid");
  grid.innerHTML = "";
  STYLE_IDS.forEach(id=>{
    const card = document.createElement("div");
    card.className = "result-card";
    card.id = `card-${id}`;
    card.innerHTML = `<div class="thumb"><span style="color:#cbbf9e;font-size:20px;">${(STYLE_META[id]?.name||id)[0]}</span></div><div class="name">${STYLE_META[id]?.name||id}</div>`;
    card.addEventListener("click", ()=> selectStyle(id));
    grid.appendChild(card);
  });
  $("featuredArea").hidden = true;

  // あらかじめ生成済みの結果を即座に反映(サーバーへの生成リクエストなし)
  STYLE_IDS.forEach(styleId=>{
    const g = SAMPLE_GENERATIONS[styleId];
    if(!g) return;
    baseGenerations[styleId] = g;
    displayGenerations[styleId] = {image_url: g.image_url};
    renderThumb(styleId, g.image_url);
  });
}

/* ---- アップロード前の軽量化 ----
   スマホのカメラ写真はそのままだと数MB〜十数MBになることがあり、
   モバイル回線でのアップロードに時間がかかる。サーバー側もどのみち
   長辺1200pxまで縮小してから処理するため(app/cleaning.py参照)、
   それより十分大きい範囲でクライアント側にも縮小・圧縮させておくことで、
   画質を落とさずアップロード時間だけを短縮する。
   HEIC等、ブラウザがcanvasに描画できない形式の場合は元ファイルのまま送る
   (サーバー側がHEICに対応済みのため、フォールバックとして安全)。 */
// サーバー側(app/cleaning.py)もどのみち長辺1200pxまで縮小してから処理するため、
// アップロード時点でそれより大きく送っても最終的な画質には影響しない。
// 1200pxに合わせることで、画質を落とさずに送信データ量をさらに削減できる。
const UPLOAD_MAX_DIM = 1200;
const UPLOAD_JPEG_QUALITY = 0.82;

function compressImageForUpload(file){
  return new Promise((resolve)=>{
    // 画像でない、または既に十分小さいファイルはそのまま
    if(!file.type.startsWith("image/") || file.size < 500*1024){
      resolve(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    const cleanup = ()=> URL.revokeObjectURL(url);
    img.onload = ()=>{
      try{
        const scale = Math.min(1, UPLOAD_MAX_DIM / Math.max(img.width, img.height));
        if(scale >= 1){ cleanup(); resolve(file); return; } // 既に十分小さい
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width*scale);
        canvas.height = Math.round(img.height*scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob=>{
          cleanup();
          if(!blob || blob.size >= file.size){ resolve(file); return; } // 縮小できなければ元のまま
          resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {type:"image/jpeg"}));
        }, "image/jpeg", UPLOAD_JPEG_QUALITY);
      }catch(err){
        cleanup();
        resolve(file); // 何かあれば元のファイルで続行(アップロード自体は止めない)
      }
    };
    img.onerror = ()=>{ cleanup(); resolve(file); }; // HEIC等デコードできない形式は元のまま
    img.src = url;
  });
}

/* ---- アップロード〜向き確認 ----
   以前は「8スタイル生成 → できた8枚をまとめて回転」という順序だったが、
   Renderの無料プランでは8枚同時の回転リクエストが処理しきれず失敗する
   ことがあった。向きの調整は生成前の元画像1枚に対して行えば十分なので、
   アップロード直後に向きだけ確認してもらい、その向きで1回だけ生成する
   流れに変更した。回転そのものはここではクライアント側(canvas)だけで
   完結し、サーバーには一切問い合わせない。 */
let orientImg = null; // 向き確認中の元画像(Imageオブジェクト)

async function handleUpload(file){
  $("uploadStatus").textContent = `「${file.name}」を処理中…`;
  file = await compressImageForUpload(file);
  $("uploadStatus").textContent = `「${file.name}」をアップロード中…`;
  const form = new FormData();
  form.append("file", file);

  let res;
  try{
    res = await fetch(`${API_BASE}/api/upload`, {method:"POST", headers: authHeaders(), body:form});
  }catch(err){
    $("uploadStatus").textContent = "サーバーに接続できませんでした。バックエンドが起動しているか確認してください。";
    return;
  }
  if(!res.ok){
    const err = await res.json().catch(()=>({detail:"不明なエラー"}));
    $("uploadStatus").textContent = err.detail || `エラー(${res.status})`;
    return;
  }
  const data = await res.json();
  motifId = data.motif_id;

  // 向き確認画面へ
  $("uploadPane").hidden = true;
  $("orientPane").hidden = false;
  rotationDeg = 0;
  updateRotateUI();
  orientImg = new Image();
  orientImg.crossOrigin = "anonymous";
  orientImg.onload = ()=> drawOrientCanvas();
  orientImg.src = `${API_BASE}/api/motif/${motifId}`;
}

function drawOrientCanvas(){
  if(!orientImg) return;
  const cv = $("orientCanvas");
  const rad = rotationDeg * Math.PI/180;
  const w = orientImg.width, h = orientImg.height;
  // 回転後の外接矩形に合わせてcanvasサイズを決める(はみ出させず、切れないように)
  const boundW = Math.abs(w*Math.cos(rad)) + Math.abs(h*Math.sin(rad));
  const boundH = Math.abs(w*Math.sin(rad)) + Math.abs(h*Math.cos(rad));
  const dispScale = Math.min(1, 340/Math.max(boundW, boundH));
  cv.width = Math.round(boundW*dispScale);
  cv.height = Math.round(boundH*dispScale);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0,0,cv.width,cv.height);
  ctx.save();
  ctx.translate(cv.width/2, cv.height/2);
  ctx.rotate(rad);
  ctx.scale(dispScale, dispScale);
  ctx.drawImage(orientImg, -w/2, -h/2, w, h);
  ctx.restore();
}

function rotateOrientBy(delta){
  rotationDeg = ((rotationDeg + delta) % 360 + 360) % 360;
  updateRotateUI();
  drawOrientCanvas();
}

function updateRotateUI(){
  $("rotateAngle").textContent = `${rotationDeg}°`;
}

$("rotateLeft").addEventListener("click", ()=> rotateOrientBy(-45));
$("rotateRight").addEventListener("click", ()=> rotateOrientBy(45));

$("confirmOrientBtn").addEventListener("click", async ()=>{
  $("confirmOrientBtn").disabled = true;
  $("confirmOrientBtn").textContent = "作成の準備中…";
  try{
    if(rotationDeg !== 0){
      // サーバー側で、既にアップロード済みのモチーフを回転させる
      // (1日のアップロード上限は消費しない。以降の8スタイル生成は
      //  すでに正しい向きになったモチーフから行われる)
      const r = await fetch(`${API_BASE}/api/motif/rotate`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({motif_id: motifId, angle: rotationDeg})
      });
      if(r.ok){
        const d = await r.json();
        motifId = d.motif_id;
      }
      // 失敗した場合は元のmotifIdのまま(向き調整なし)で続行する
    }
  }finally{
    $("confirmOrientBtn").disabled = false;
    $("confirmOrientBtn").textContent = "この向きでアートを作成 →";
  }
  $("orientPane").hidden = true;
  startGeneration();
});

/* ---- 生成本体(向き確認後、motifIdを使って8スタイルを生成) ---- */
async function startGeneration(){
  $("resultPane").hidden = false;
  const origImg = new Image();
  origImg.crossOrigin = "anonymous";
  origImg.onload = ()=>{
    const cv = $("origCanvas");
    const dispW = 260, dispH = Math.round(dispW*origImg.height/origImg.width);
    cv.width=dispW; cv.height=dispH;
    const cctx = cv.getContext("2d");
    cctx.fillStyle="#fff"; cctx.fillRect(0,0,dispW,dispH);
    cctx.drawImage(origImg,0,0,dispW,dispH);
  };
  origImg.src = `${API_BASE}/api/motif/${motifId}`;

  // グリッドを初期化してプレースホルダーを表示
  baseGenerations = {}; displayGenerations = {}; selectedStyle=null;
  const grid = $("resultGrid");
  grid.innerHTML = "";
  STYLE_IDS.forEach(id=>{
    const card = document.createElement("div");
    card.className = "result-card";
    card.id = `card-${id}`;
    card.innerHTML = `<div class="thumb"><span style="color:#cbbf9e;font-size:20px;">${(STYLE_META[id]?.name||id)[0]}</span></div><div class="name">${STYLE_META[id]?.name||id}</div>`;
    card.addEventListener("click", ()=> selectStyle(id));
    grid.appendChild(card);
  });
  $("featuredArea").hidden = true;

  // 8スタイルを順番に生成。生成中は「何が起きているか分からず不安」に
  // ならないよう、進捗ゲージと件数を表示する。
  // 注: 並列化も試したが、Renderの無料プランではCPU/メモリが非力なため
  // 複数同時リクエストで502エラーが多発し逆に悪化することを確認済み(2026-08-23)。
  // ホスティングを有料プランに上げた後であれば、Promise.allでの並列化を再検討してよい。
  const progress = $("genProgress");
  const progressFill = $("genProgressFill");
  const progressCount = $("genProgressCount");
  progress.hidden = false;
  progressFill.style.width = "0%";
  progressCount.textContent = `0/${STYLE_IDS.length}`;

  await runGenerationQueue(STYLE_IDS);
}

/* 1スタイル分の生成。成功したらtrue。
   Renderの無料プランでは、重いスタイルの処理中にサーバーのCPUが飽和し、
   後続リクエスト(ブラウザが送るCORSプリフライトを含む)が一時的に502を
   返すことがある。恒久的な失敗ではないので、少し待ってから再試行する。 */
async function generateOneStyle(styleId, attempts = 3){
  for(let i = 0; i < attempts; i++){
    if(i > 0){
      markThumbRetrying(styleId);
      await new Promise(r=> setTimeout(r, 2500 * i)); // 待ち時間を少しずつ延ばす
    }
    try{
      const r = await fetch(`${API_BASE}/api/generate`, {
        method:"POST", headers:{"Content-Type":"application/json", ...authHeaders()},
        body: JSON.stringify({motif_id: motifId, style: styleId})
      });
      if(!r.ok){ console.error(styleId, r.status, await r.text().catch(()=>"")); continue; }
      const g = await r.json();
      baseGenerations[styleId] = g;
      displayGenerations[styleId] = {image_url: g.image_url};
      renderThumb(styleId, g.image_url);
      return true;
    }catch(err){
      console.error(styleId, err);
    }
  }
  return false;
}

/* 渡されたスタイル群を順番に生成し、失敗したものは画面に明示する。
   以前は失敗をconsoleに出すだけだったため、生成されなかった枠が
   プレースホルダーのまま永久に残り、ユーザーからは「固まった」ように
   見えてしまっていた。 */
async function runGenerationQueue(styleIds){
  const progress = $("genProgress");
  const progressFill = $("genProgressFill");
  const progressCount = $("genProgressCount");
  $("genFailed").hidden = true;
  progress.hidden = false;
  progressFill.style.width = "0%";
  progressCount.textContent = `0/${styleIds.length}`;

  let done = 0;
  const failed = [];
  for(const styleId of styleIds){
    const ok = await generateOneStyle(styleId);
    if(!ok){ failed.push(styleId); markThumbFailed(styleId); }
    done++;
    progressFill.style.width = `${Math.round(done/styleIds.length*100)}%`;
    progressCount.textContent = `${done}/${styleIds.length}`;
  }
  progress.hidden = true;

  if(failed.length){
    const names = failed.map(id=> STYLE_META[id]?.name || id).join("、");
    $("genFailedMsg").textContent =
      `${names} は混雑のため作成できませんでした。少し待ってからやり直せます。`;
    $("genFailed").hidden = false;
    $("retryFailedBtn").onclick = async ()=>{
      $("retryFailedBtn").disabled = true;
      await runGenerationQueue(failed);
      $("retryFailedBtn").disabled = false;
    };
  }
}

function markThumbRetrying(styleId){
  const card = $(`card-${styleId}`);
  if(!card || baseGenerations[styleId]) return;
  card.querySelector(".thumb").innerHTML =
    `<span style="color:#b3a98c;font-size:11px;">再試行中…</span>`;
}

function markThumbFailed(styleId){
  const card = $(`card-${styleId}`);
  if(!card) return;
  card.querySelector(".thumb").innerHTML =
    `<span style="color:var(--coral-dark);font-size:11px;">作成できません<br>でした</span>`;
}

function renderThumb(styleId, imageUrl){
  const card = $(`card-${styleId}`);
  if(!card) return;
  card.querySelector(".thumb").innerHTML = `<img src="${API_BASE}${imageUrl}" crossorigin="anonymous">`;
}

function selectStyle(id){
  if(!baseGenerations[id]) return; // まだ生成が終わっていない
  selectedStyle = id;
  document.querySelectorAll(".result-card").forEach(c=>c.classList.remove("selected"));
  $(`card-${id}`).classList.add("selected");
  showFeatured();
}

/* ---- 額装プレビュー(部屋のモックアップをcanvasで描画) ---- */
function drawFramedRoom(img){
  const size = 640;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");

  const wallH = size*0.78;
  ctx.fillStyle = "#e1d8c8"; ctx.fillRect(0,0,size,wallH);
  ctx.fillStyle = "#c79a68"; ctx.fillRect(0,wallH,size,size-wallH);
  ctx.fillStyle = "#cabfa8"; ctx.fillRect(0,wallH-6,size,6);

  const frameW = size*0.5;
  const ratio = img.height/img.width;
  const matW = frameW*0.09;
  const innerW = frameW - matW*2, innerH = innerW*ratio;
  const frameH = innerH + matW*2;
  const border = 8;
  const fx = size/2 - frameW/2, fy = wallH*0.08;

  ctx.save();
  ctx.shadowColor="rgba(0,0,0,.35)"; ctx.shadowBlur=18; ctx.shadowOffsetX=6; ctx.shadowOffsetY=8;
  ctx.fillStyle="#3a2d23";
  ctx.fillRect(fx-border, fy-border, frameW+border*2, frameH+border*2);
  ctx.restore();

  ctx.fillStyle="#fdfbf7";
  ctx.fillRect(fx,fy,frameW,frameH);
  ctx.drawImage(img, fx+matW, fy+matW, innerW, innerH);

  return canvas;
}

function showFeatured(){
  const disp = displayGenerations[selectedStyle];
  if(!disp) return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = ()=>{
    const canvas = drawFramedRoom(img);
    const wrap = $("roomPreview");
    wrap.innerHTML = "";
    wrap.appendChild(canvas);
    $("featuredArea").hidden = false;
    canvas._sourceImg = img;
  };
  img.src = `${API_BASE}${disp.image_url}`;
}

/* ---- ダウンロード(無料枠 / 都度課金 / サブスクの判定つき) ---- */
$("downloadArtBtn").addEventListener("click", ()=> attemptDownload("plain"));
$("downloadFramedBtn").addEventListener("click", ()=> attemptDownload("framed"));

async function attemptDownload(kind){
  if(!selectedStyle || !baseGenerations[selectedStyle]) return;
  const generationId = baseGenerations[selectedStyle].generation_id;

  let res, data;
  try{
    res = await fetch(`${API_BASE}/api/generation/${generationId}/claim-download`, {
      method: "POST", headers: authHeaders()
    });
    data = await res.json();
  }catch(err){
    alert("通信エラーが発生しました。時間をおいて再度お試しください。");
    return;
  }

  if(!data.allowed){
    openPaywallModal(data);
    return;
  }
  runDownload(kind);
}

function runDownload(kind){
  if(kind === "framed"){
    const canvas = $("roomPreview").querySelector("canvas");
    if(!canvas) return;
    canvas.toBlob(blob=> triggerDownload(blob, `落書きアート_額装_${selectedStyle}.png`));
    return;
  }
  const url = `${API_BASE}${displayGenerations[selectedStyle].image_url}`;
  fetch(url).then(r=>r.blob()).then(blob=>{
    triggerDownload(blob, `落書きアート_${selectedStyle}.png`);
  });
}

function triggerDownload(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

/* ---- ペイウォールモーダル ---- */
function openPaywallModal(status){
  if(status && status.price_per_extra_download_yen) $("paywallSinglePrice").textContent = status.price_per_extra_download_yen;
  if(status && status.subscription_price_yen) $("paywallSubPrice").textContent = status.subscription_price_yen;
  $("paywallStatus").textContent = "";
  $("paywallModal").hidden = false;
}
function closePaywallModal(){ $("paywallModal").hidden = true; }
$("closePaywallModal").addEventListener("click", closePaywallModal);
$("paywallModal").addEventListener("click", e=>{ if(e.target.id==="paywallModal") closePaywallModal(); });

$("paywallSingleBtn").addEventListener("click", ()=> startCheckout("single"));
$("paywallSubBtn").addEventListener("click", ()=> startCheckout("subscription"));
$("subscribeBtn")?.addEventListener("click", ()=> startCheckout("subscription"));

async function startCheckout(plan){
  if(plan === "subscription" && !authToken){
    $("paywallStatus").textContent = "使い放題プランのご利用にはログインが必要です。";
    closePaywallModal();
    openAuthModal("login");
    return;
  }
  const body = { plan };
  if(plan === "single" && selectedStyle && baseGenerations[selectedStyle]){
    body.generation_id = baseGenerations[selectedStyle].generation_id;
  }
  const statusEl = $("paywallStatus");
  if(statusEl) statusEl.textContent = "決済ページに移動しています…";
  try{
    const res = await fetch(`${API_BASE}/api/checkout`, {
      method: "POST", headers: {"Content-Type":"application/json", ...authHeaders()},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if(!res.ok){
      if(statusEl) statusEl.textContent = data.detail || "エラーが発生しました。";
      return;
    }
    window.location.href = data.checkout_url;
  }catch(err){
    if(statusEl) statusEl.textContent = "サーバーに接続できませんでした。";
  }
}

/* ---- 料金プラン表示・決済完了後の復帰処理 ---- */
/* 広告(AdSense自動広告)の読み込みはads.jsが担当する。使い放題プラン加入者には
   広告を出さないため、こちらではpricingFreeCountの表示だけを行う。 */
(async function initPricing(){
  try{
    const res = await fetch(`${API_BASE}/api/download-status`, { headers: authHeaders() });
    const data = await res.json();
    if(data.free_limit_today && $("pricingFreeCount")) $("pricingFreeCount").textContent = data.free_limit_today;
  }catch(err){ /* 料金表示は失敗しても致命的ではないので黙って諦める */ }
})();

(function handleCheckoutReturn(){
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get("checkout");
  if(!checkout) return;
  if(checkout === "success"){
    const generationId = params.get("generation_id");
    const plan = params.get("plan");
    const msg = plan === "subscription"
      ? "使い放題プランへのご登録ありがとうございます!広告なしで何点でもダウンロードできます。"
      : "ご購入ありがとうございます!ダウンロードが可能になりました。";
    alert(msg);
    if(generationId){
      // ページ再読み込みで作業中の状態は失われているため、購入した作品を
      // generation_id から直接取得してダウンロードする。
      fetch(`${API_BASE}/api/result/${generationId}`).then(r=>r.blob()).then(blob=>{
        triggerDownload(blob, `落書きアート_${generationId}.png`);
      });
    }
  }
  const url = new URL(window.location);
  url.searchParams.delete("checkout");
  url.searchParams.delete("generation_id");
  url.searchParams.delete("plan");
  window.history.replaceState({}, "", url);
})();

/* ==================== みんなのRAKUMOに投稿する(5ステップ) ==================== */
const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

const THEMES = ["夏","家族","恐竜","夢","動物","乗り物","宇宙","その他"];

(function populatePostFlowOptions(){
  const ageSelect = $("postAge");
  if(ageSelect){
    for(let age=3; age<=8; age++){
      const opt = document.createElement("option");
      opt.value = String(age); opt.textContent = `${age}歳`;
      ageSelect.appendChild(opt);
    }
    const opt9 = document.createElement("option");
    opt9.value = "9"; opt9.textContent = "9歳以上";
    ageSelect.appendChild(opt9);
  }
  const prefSelect = $("postPrefecture");
  if(prefSelect){
    PREFECTURES.forEach(name=>{
      const opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      prefSelect.appendChild(opt);
    });
  }
  const themeSelect = $("postTheme");
  if(themeSelect){
    THEMES.forEach(name=>{
      const opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      themeSelect.appendChild(opt);
    });
  }
})();

let postFlowGenerationId = null;

function openPostModal(){
  if(!selectedStyle || !baseGenerations[selectedStyle]){
    alert("先にスタイルを選んでください。");
    return;
  }
  postFlowGenerationId = baseGenerations[selectedStyle].generation_id;

  $("postTitle").value = "";
  $("postAuthorName").value = "";
  $("postDescription").value = "";
  $("postAge").value = "";
  $("postPrefecture").value = "";
  $("postTheme").value = "";
  $("sharePrefectureCheck").checked = true;
  $("postStep2Status").textContent = "";
  $("postStep4Status").textContent = "";

  goToPostStep(2);
  $("postModal").hidden = false;
}
function closePostModal(){ $("postModal").hidden = true; }

function goToPostStep(step){
  [2,3,4,5].forEach(n=>{
    $(`postStep${n}`).hidden = (n !== step);
  });
  document.querySelectorAll(".post-step-dot").forEach(dot=>{
    const dotStep = Number(dot.dataset.step);
    dot.classList.toggle("active", dotStep === step);
    dot.classList.toggle("done", dotStep < step);
  });
}

$("openPostFlowBtn")?.addEventListener("click", openPostModal);
$("closePostModal")?.addEventListener("click", closePostModal);
$("closePostFlowBtn")?.addEventListener("click", closePostModal);
$("postModal")?.addEventListener("click", (e)=>{ if(e.target.id === "postModal") closePostModal(); });

$("toStep3Btn")?.addEventListener("click", ()=>{
  if(!$("postTitle").value.trim()){
    $("postStep2Status").textContent = "タイトルを入力してください。";
    return;
  }
  $("postStep2Status").textContent = "";

  const hasAuthor = !!$("postAuthorName").value.trim();
  const hasAge = !!$("postAge").value;
  const hasPref = !!$("postPrefecture").value;
  $("publicAuthorLine").classList.toggle("show", hasAuthor);
  $("publicAgeLine").classList.toggle("show", hasAge);
  $("publicPrefLine").classList.toggle("show", hasPref);
  $("sharePrefectureCheck").closest(".post-checkbox-row").hidden = !hasPref;

  goToPostStep(3);
});

$("backToStep2Btn")?.addEventListener("click", ()=> goToPostStep(2));

$("toStep4Btn")?.addEventListener("click", ()=>{
  const title = $("postTitle").value.trim();
  const author = $("postAuthorName").value.trim();
  const desc = $("postDescription").value.trim();
  const age = $("postAge").value;
  const pref = $("sharePrefectureCheck").checked ? $("postPrefecture").value : "";
  const theme = $("postTheme").value;

  $("postPreviewImg").src = `${API_BASE}${displayGenerations[selectedStyle].image_url}`;
  $("postPreviewTitle").textContent = title;
  const metaParts = [];
  if(author) metaParts.push(author);
  if(age) metaParts.push(age === "9" ? "9歳以上" : `${age}歳`);
  if(pref) metaParts.push(pref);
  if(theme) metaParts.push(`#${theme}`);
  $("postPreviewMeta").textContent = metaParts.join(" ・ ") || "作者名・年齢・地域は非公開";
  $("postPreviewDesc").textContent = desc;

  goToPostStep(4);
});

$("backToStep3Btn")?.addEventListener("click", ()=> goToPostStep(3));

$("submitPostBtn")?.addEventListener("click", async ()=>{
  if(!postFlowGenerationId) return;
  const title = $("postTitle").value.trim();
  const author = $("postAuthorName").value.trim();
  const desc = $("postDescription").value.trim();
  const age = $("postAge").value;
  const pref = $("sharePrefectureCheck").checked ? $("postPrefecture").value : "";
  const theme = $("postTheme").value;

  $("submitPostBtn").disabled = true;
  $("postStep4Status").textContent = "投稿しています…";
  try{
    const res = await fetch(`${API_BASE}/api/gallery/publish`, {
      method: "POST",
      headers: {"Content-Type": "application/json", ...authHeaders()},
      body: JSON.stringify({
        generation_id: postFlowGenerationId,
        title,
        author_name: author || null,
        description: desc || null,
        child_age: age ? Number(age) : null,
        prefecture: pref || null,
        theme: theme || null,
      }),
    });
    if(!res.ok){
      const err = await res.json().catch(()=>({detail:"投稿に失敗しました"}));
      $("postStep4Status").textContent = err.detail || "投稿に失敗しました。";
      $("submitPostBtn").disabled = false;
      return;
    }
    goToPostStep(5);
  }catch(err){
    $("postStep4Status").textContent = "サーバーに接続できませんでした。";
  }finally{
    $("submitPostBtn").disabled = false;
  }
});

/* ---- 起動時にスタイル一覧を取得 ---- */
(async function init(){
  try{
    const r = await fetch(`${API_BASE}/api/styles`);
    if(r.ok){
      const list = await r.json();
      list.forEach(s=> STYLE_META[s.id] = s);
    }
  }catch(err){
    console.warn("バックエンドに接続できませんでした。起動しているか確認してください。", err);
  }
})();

/* ---- ギャラリーの「作品を投稿する」から来た場合、自動でアップロード画面を開く ---- */
(function handleGalleryEntry(){
  const params = new URLSearchParams(window.location.search);
  if(params.get("post") === "1"){
    $("galleryWelcomeMsg").hidden = false;
    openModal();
    const url = new URL(window.location);
    url.searchParams.delete("post");
    window.history.replaceState({}, "", url);
  }
})();
