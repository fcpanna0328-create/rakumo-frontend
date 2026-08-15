const API_BASE = window.RAKUMO_API_BASE || 'http://localhost:8000';
let adminToken = sessionStorage.getItem('rakumo_admin_token') || '';
let currentFilter = 'all';

function $(id) { return document.getElementById(id); }

async function adminFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), 'X-Admin-Token': adminToken },
  });
  if (res.status === 403 || res.status === 503) {
    const err = await res.json().catch(() => ({ detail: 'アクセスできませんでした' }));
    throw new Error(err.detail || 'アクセスできませんでした');
  }
  return res;
}

async function tryLogin(token) {
  adminToken = token;
  try {
    const res = await adminFetch('/api/admin/generations?page=1&page_size=1');
    if (!res.ok) throw new Error('ログインに失敗しました');
    sessionStorage.setItem('rakumo_admin_token', token);
    $('loginScreen').hidden = true;
    $('adminApp').hidden = false;
    loadList();
  } catch (err) {
    $('loginError').textContent = err.message || 'トークンが正しくありません';
    adminToken = '';
  }
}

$('loginBtn').addEventListener('click', () => tryLogin($('tokenInput').value.trim()));
$('tokenInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryLogin($('tokenInput').value.trim());
});

document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
    loadList();
  });
});

async function loadList() {
  $('tableBody').innerHTML = '<tr><td colspan="8" class="loading">読み込み中…</td></tr>';
  try {
    const onlyReported = currentFilter === 'reported' ? 'true' : 'false';
    const res = await adminFetch(`/api/admin/generations?only_reported=${onlyReported}&page=1&page_size=100`);
    if (!res.ok) throw new Error('取得に失敗しました');
    const data = await res.json();
    renderTable(data.items || []);
  } catch (err) {
    $('tableBody').innerHTML = `<tr><td colspan="8" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTable(items) {
  $('itemCount').textContent = `${items.length}件`;

  if (items.length === 0) {
    $('tableBody').innerHTML = '<tr><td colspan="8" class="empty">該当する作品がありません</td></tr>';
    return;
  }

  $('tableBody').innerHTML = items.map(item => `
    <tr data-id="${item.generation_id}">
      <td><img src="${API_BASE}${item.image_url}" alt="" loading="lazy"></td>
      <td>
        <div>${escapeHtml(item.title || '(無題)')}</div>
        <div style="color:#999;font-size:11.5px;">${escapeHtml(item.author_name || '')}</div>
      </td>
      <td>${escapeHtml(item.style)}</td>
      <td>
        <span class="badge ${item.is_published ? 'badge-published' : 'badge-hidden'}">
          ${item.is_published ? '公開中' : '非公開'}
        </span>
        ${item.report_count > 0 ? `<span class="badge badge-reported">通報${item.report_count}件</span>` : ''}
      </td>
      <td>👏 ${item.clap_count}</td>
      <td>${item.report_count}</td>
      <td>${new Date(item.created_at).toLocaleDateString('ja-JP')}</td>
      <td>
        <div class="row-actions">
          ${item.is_published
            ? `<button class="action-btn unpublish" data-action="unpublish">非公開にする</button>`
            : `<button class="action-btn republish" data-action="republish">再公開する</button>`}
          <button class="action-btn delete" data-action="delete">削除</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.closest('tr').dataset.id, btn.dataset.action));
  });
}

async function handleAction(id, action) {
  if (action === 'delete') {
    if (!confirm('本当にこの作品を完全に削除しますか?この操作は取り消せません。')) return;
    const res = await adminFetch(`/api/admin/generations/${id}`, { method: 'DELETE' });
    if (res.ok) loadList();
    else alert('削除に失敗しました');
    return;
  }
  const res = await adminFetch(`/api/admin/generations/${id}/${action}`, { method: 'POST' });
  if (res.ok) loadList();
  else alert('操作に失敗しました');
}

$('cleanupBtn').addEventListener('click', async () => {
  if (!confirm('公開も購入もされないまま7日以上経った下書きデータを削除します。よろしいですか?')) return;
  $('cleanupBtn').disabled = true;
  $('cleanupResult').textContent = '整理しています…';
  try {
    const res = await adminFetch('/api/admin/cleanup', { method: 'POST' });
    if (!res.ok) throw new Error('整理に失敗しました');
    const data = await res.json();
    $('cleanupResult').textContent = `完了しました。${data.deleted}件を削除しました(対象候補${data.checked}件中)。`;
  } catch (err) {
    $('cleanupResult').textContent = err.message || '整理に失敗しました';
  } finally {
    $('cleanupBtn').disabled = false;
  }
});

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 前回ログイン済みならトークンを検証してそのまま入る
if (adminToken) {
  tryLogin(adminToken);
}
