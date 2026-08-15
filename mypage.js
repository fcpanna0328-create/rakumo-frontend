const API_BASE = window.RAKUMO_API_BASE || 'http://localhost:8000';

function $(id){ return document.getElementById(id); }

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const STYLE_LABELS = {
  andy: 'Andy風',
  dynamic: 'ダイナミックアート',
  matisse: 'Matisse風',
  rothko: 'Rothko風',
  mirror: 'ミラーリング',
  cubism: 'キュビズム風',
  lichtenstein: 'Lichtenstein風',
  triptych: 'トリプティク',
};
function getStyleLabel(style) { return STYLE_LABELS[style] || style; }

/* ---- ログイン状態(index.htmlのapp.jsと同じlocalStorageキーを共有) ---- */
let authToken = localStorage.getItem('rakumo_token') || null;
let authUserEmail = localStorage.getItem('rakumo_user_email') || null;
let authMode = 'login';

function authHeaders(){
  return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

function setSession(token, email){
  authToken = token;
  authUserEmail = email;
  if(token){
    localStorage.setItem('rakumo_token', token);
    localStorage.setItem('rakumo_user_email', email || '');
  }else{
    localStorage.removeItem('rakumo_token');
    localStorage.removeItem('rakumo_user_email');
  }
  updateAuthUI();
  loadMyPage();
}

function updateAuthUI(){
  if(authToken){
    $('loginBtn').hidden = true;
    $('userInfo').hidden = false;
    $('userEmail').textContent = authUserEmail || '';
    $('loginBanner').hidden = true;
  }else{
    $('loginBtn').hidden = false;
    $('userInfo').hidden = true;
    $('loginBanner').hidden = false;
  }
}

function openAuthModal(mode){
  authMode = mode;
  $('authEmail').value = '';
  $('authPassword').value = '';
  $('authStatus').textContent = '';
  updateAuthModeUI();
  $('authModal').hidden = false;
}
function closeAuthModal(){ $('authModal').hidden = true; }

function updateAuthModeUI(){
  const isLogin = authMode === 'login';
  $('authTabLogin').classList.toggle('active', isLogin);
  $('authTabSignup').classList.toggle('active', !isLogin);
  $('authSubmitBtn').textContent = isLogin ? 'ログイン' : '新規登録';
}

$('loginBtn').addEventListener('click', ()=> openAuthModal('login'));
$('loginBannerBtn').addEventListener('click', ()=> openAuthModal('login'));
$('closeAuthModal').addEventListener('click', closeAuthModal);
$('authModal').addEventListener('click', e=>{ if(e.target.id==='authModal') closeAuthModal(); });
$('authTabLogin').addEventListener('click', ()=>{ authMode='login'; updateAuthModeUI(); });
$('authTabSignup').addEventListener('click', ()=>{ authMode='signup'; updateAuthModeUI(); });
$('logoutBtn').addEventListener('click', ()=>{ setSession(null, null); });

$('authForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  const endpoint = authMode === 'login' ? 'login' : 'signup';
  $('authStatus').textContent = authMode === 'login' ? 'ログイン中…' : '登録中…';
  $('authSubmitBtn').disabled = true;

  let res, data;
  try{
    res = await fetch(`${API_BASE}/api/auth/${endpoint}`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email, password})
    });
    data = await res.json();
  }catch(err){
    $('authStatus').textContent = 'サーバーに接続できませんでした。';
    $('authSubmitBtn').disabled = false;
    return;
  }
  $('authSubmitBtn').disabled = false;

  if(!res.ok){
    $('authStatus').textContent = data.detail || 'エラーが発生しました。';
    return;
  }
  if(data.email_confirmation_required){
    $('authStatus').textContent = '確認メールを送りました。メール内のリンクをクリックしてから、ログインしてください。';
    return;
  }
  setSession(data.access_token, data.user && data.user.email);
  closeAuthModal();
});

/* ---- マイページ本体 ---- */

async function loadMyPage(){
  await Promise.all([loadMyArtworks(), loadMyClaps()]);
}

async function loadMyArtworks(){
  const area = $('myArtworksArea');
  try{
    const res = await fetch(`${API_BASE}/api/my/artworks`, { headers: authHeaders() });
    const data = await res.json();
    const items = data.items || [];
    $('myArtworksCount').textContent = items.length ? `(${items.length}件)` : '';
    if(!items.length){
      area.innerHTML = `<div class="mp-empty">まだ作品がありません。<br><a href="index.html">RAKUMOで作品を作ってみましょう</a></div>`;
      return;
    }
    area.innerHTML = `<div class="mypage-grid">${items.map(renderArtworkCard).join('')}</div>`;
    area.querySelectorAll('.mp-unpublish-btn').forEach(btn=>{
      btn.addEventListener('click', ()=> handleUnpublish(btn.dataset.id, btn));
    });
  }catch(err){
    area.innerHTML = `<div class="mp-empty">読み込みに失敗しました。時間をおいて再度お試しください。</div>`;
  }
}

function renderArtworkCard(item){
  const statusBadge = item.is_published
    ? `<span class="mp-badge mp-badge-published">公開中</span>`
    : `<span class="mp-badge mp-badge-draft">非公開(下書き)</span>`;
  const metaParts = [];
  if(item.prefecture) metaParts.push(escapeHtml(item.prefecture));
  if(item.child_age) metaParts.push(`${item.child_age}歳`);
  if(item.is_published) metaParts.push(`拍手 ${item.clap_count}`);
  const actions = item.is_published
    ? `<a class="mp-btn" href="gallery.html?work=${encodeURIComponent(item.generation_id)}">ギャラリーで見る</a>
       <button class="mp-btn mp-btn-danger mp-unpublish-btn" data-id="${item.generation_id}">非公開にする</button>`
    : '';
  return `
    <div class="mp-card" data-id="${item.generation_id}">
      <div class="mp-thumb"><img src="${API_BASE}${item.image_url}" alt="${escapeHtml(item.title || '')}" loading="lazy"></div>
      <div class="mp-info">
        ${statusBadge}
        <div class="mp-caption">${escapeHtml(item.title) || '(タイトル未設定)'}</div>
        <div class="mp-meta">${getStyleLabel(item.style)}${metaParts.length ? ' ・ ' + metaParts.join(' ・ ') : ''}</div>
        <div class="mp-actions">${actions}</div>
      </div>
    </div>`;
}

async function handleUnpublish(id, btnEl){
  if(!confirm('この作品をギャラリーから非公開にしますか?\n(後で投稿し直すことはできません)')) return;
  btnEl.disabled = true;
  try{
    const res = await fetch(`${API_BASE}/api/my/artworks/${encodeURIComponent(id)}/unpublish`, {
      method: 'POST', headers: authHeaders()
    });
    if(!res.ok){
      alert('非公開にできませんでした。時間をおいて再度お試しください。');
      btnEl.disabled = false;
      return;
    }
    loadMyArtworks();
  }catch(err){
    alert('通信エラーが発生しました。');
    btnEl.disabled = false;
  }
}

async function loadMyClaps(){
  const area = $('myClapsArea');
  try{
    const res = await fetch(`${API_BASE}/api/my/claps`, { headers: authHeaders() });
    const data = await res.json();
    const items = data.items || [];
    $('myClapsCount').textContent = items.length ? `(${items.length}件)` : '';
    if(!items.length){
      area.innerHTML = `<div class="mp-empty">まだ拍手した作品がありません。<br><a href="gallery.html">みんなのRAKUMOを見に行く</a></div>`;
      return;
    }
    area.innerHTML = `<div class="mypage-grid">${items.map(renderClapCard).join('')}</div>`;
  }catch(err){
    area.innerHTML = `<div class="mp-empty">読み込みに失敗しました。時間をおいて再度お試しください。</div>`;
  }
}

function renderClapCard(item){
  const metaParts = [];
  if(item.prefecture) metaParts.push(escapeHtml(item.prefecture));
  if(item.child_age) metaParts.push(`${item.child_age}歳`);
  metaParts.push(`拍手 ${item.clap_count}`);
  return `
    <a class="mp-card" style="display:block;cursor:pointer;" href="gallery.html?work=${encodeURIComponent(item.generation_id)}">
      <div class="mp-thumb"><img src="${API_BASE}${item.image_url}" alt="${escapeHtml(item.title || '')}" loading="lazy"></div>
      <div class="mp-info">
        <div class="mp-caption">${escapeHtml(item.title) || '(無題)'}${item.author_name ? ' / ' + escapeHtml(item.author_name) : ''}</div>
        <div class="mp-meta">${getStyleLabel(item.style)} ・ ${metaParts.join(' ・ ')}</div>
      </div>
    </a>`;
}

updateAuthUI();
loadMyPage();
