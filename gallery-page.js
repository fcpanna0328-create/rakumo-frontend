const PAGE_SIZE = 10; // 1ページ最大10件+RAKUMO作成枠+SNS投稿枠(常に固定2枠)=12枠
let currentPage = 1;
let currentStyle = '';
let currentSort = 'new';
let currentPrefecture = '';
let currentAge = '';
let currentTheme = '';
let allItems = [];
let filteredItems = [];
let clappedIds = new Set(JSON.parse(localStorage.getItem('rakumo_clapped') || '[]'));

const API_BASE = window.RAKUMO_API_BASE || 'http://localhost:8000';

async function loadGallery() {
  try {
    const params = new URLSearchParams({ page: '1', page_size: '200', sort: currentSort });
    const response = await fetch(`${API_BASE}/api/gallery?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    allItems = data.items || [];
    applyFilters();
    openSharedWorkFromUrl();
  } catch (error) {
    console.error('Failed to load gallery:', error);
    document.getElementById('galleryContainer').innerHTML = '<div class="loading">ギャラリーを読み込めませんでした</div>';
  }
}

function filterByStyle(style) {
  currentStyle = style;
  currentPage = 1;
  applyFilters();
  updateFilterButtons();
}

function applyFilters() {
  filteredItems = allItems.filter(item => {
    if (currentStyle && item.style !== currentStyle) return false;
    if (currentPrefecture && item.prefecture !== currentPrefecture) return false;
    if (currentAge) {
      const age = item.child_age;
      if (currentAge === '9') {
        if (!age || age < 9) return false;
      } else if (String(age) !== currentAge) {
        return false;
      }
    }
    if (currentTheme && item.theme !== currentTheme) return false;
    return true;
  });
  renderGallery();
}

function filterByTheme(theme) {
  currentTheme = currentTheme === theme ? '' : theme;
  currentPage = 1;
  applyFilters();
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === currentTheme);
  });
}

function filterByAge(age) {
  currentAge = currentAge === age ? '' : age;
  currentPage = 1;
  applyFilters();
  document.querySelectorAll('.age-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.age === currentAge);
  });
}

function filterByPrefecture(pref) {
  currentPrefecture = currentPrefecture === pref ? '' : pref;
  currentPage = 1;
  applyFilters();
  document.querySelector('.gallery-container').scrollIntoView({ behavior: 'smooth' });
}

function renderGallery() {
  const container = document.getElementById('galleryContainer');
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = filteredItems.slice(start, end);

  if (pageItems.length === 0) {
    container.innerHTML = '<div class="loading">作品がありません</div>';
    renderPagination();
    return;
  }

  container.innerHTML = pageItems.map(item => `
    <div class="gallery-item" data-id="${item.generation_id}">
      <div class="thumb-mat"><div class="thumb-frame"><img src="${API_BASE}${item.image_url}" alt="" loading="lazy"></div></div>
      <div class="gallery-item-info">
        <span class="gallery-item-style">${getStyleLabel(item.style)}</span>
        ${item.theme ? `<span class="gallery-item-theme">#${escapeHtml(item.theme)}</span>` : ''}
        <div class="gallery-item-caption">${escapeHtml(item.title) || '(無題)'}</div>
        <div class="gallery-item-meta">${metaLine(item).replace(/^\s*・\s*/, '')}</div>
        <button class="clap-btn${clappedIds.has(item.generation_id) ? ' clapped' : ''}" data-id="${item.generation_id}">
          👏 <span class="clap-count">${item.clap_count || 0}</span>
        </button>
      </div>
    </div>
  `).join('') + `
    <a href="index.html?post=1" class="gallery-item cta-tile">
      <div class="cta-tile-icon">🎉</div>
      <div class="cta-tile-title">あなたの作品で<br>全国コンプリートを<br>目指しましょう</div>
      <span class="cta-tile-btn">今すぐRAKUMOで作成</span>
    </a>
    <div class="gallery-item cta-tile sns-tile">
      <div class="cta-tile-icon">📣</div>
      <div class="cta-tile-title">できた作品を<br>SNSでシェアしよう</div>
      <div class="sns-tile-buttons">
        <a href="${snsShareXUrl()}" class="sns-icon-btn sns-icon-x" target="_blank" rel="noopener">𝕏 で投稿</a>
        <a href="https://www.instagram.com/" class="sns-icon-btn sns-icon-ig" target="_blank" rel="noopener">📷 Instagram</a>
      </div>
      <div class="sns-tile-note">Instagramは画像を保存してから投稿してね</div>
    </div>
  `;

  document.querySelectorAll('.gallery-item img, .gallery-item-caption').forEach(el => {
    el.addEventListener('click', () => openModal(el.closest('.gallery-item').dataset.id));
  });
  document.querySelectorAll('.clap-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); handleClap(btn.dataset.id, btn); });
  });

  renderPagination();
}

function snsShareXUrl() {
  const text = 'うちの子の落書きが、アートに変身しました🎨 #RAKUMO #落書きアート';
  const url = `${window.location.origin}/gallery.html`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

function metaLine(item) {
  const parts = [];
  if (item.author_name) parts.push(item.author_name);
  if (item.child_age) parts.push(item.child_age >= 9 ? '9歳以上' : `${item.child_age}歳`);
  if (item.prefecture) parts.push(item.prefecture);
  return parts.length ? ` ・ ${parts.join(' ')}` : '';
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function handleClap(id, btnEl) {
  if (clappedIds.has(id)) return; // 1ユーザー1作品1回
  btnEl.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/api/artworks/${id}/clap`, { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    clappedIds.add(id);
    localStorage.setItem('rakumo_clapped', JSON.stringify([...clappedIds]));

    const item = allItems.find(i => i.generation_id === id);
    if (item) item.clap_count = data.clap_count;

    btnEl.classList.add('clapped');
    btnEl.querySelector('.clap-count').textContent = data.clap_count;

    if (document.getElementById('galleryModal').classList.contains('active')) {
      document.getElementById('modalClapCount').textContent = data.clap_count;
    }
  } catch (error) {
    console.error('Failed to clap:', error);
  } finally {
    btnEl.disabled = false;
  }
}

function getStyleLabel(style) {
  const labels = {
    andy: 'Andy風',
    dynamic: 'ダイナミックアート',
    matisse: 'Matisse風',
    rothko: 'Rothko風',
    mirror: 'ミラーリング',
    cubism: 'キュビズム風',
    lichtenstein: 'Lichtenstein風',
    triptych: 'トリプティク'
  };
  return labels[style] || style;
}

function renderPagination() {
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const container = document.getElementById('pageNumbers');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const pages = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);

  if (start > 1) pages.push(createPageBtn(1, '1'));
  if (start > 2) pages.push('<span style="padding: 0 4px; color: #999;">...</span>');

  for (let i = start; i <= end; i++) {
    pages.push(createPageBtn(i, String(i)));
  }

  if (end < totalPages - 1) pages.push('<span style="padding: 0 4px; color: #999;">...</span>');
  if (end < totalPages) pages.push(createPageBtn(totalPages, String(totalPages)));

  container.innerHTML = pages.join('');

  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page);
      renderGallery();
      document.querySelector('.gallery-container').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function createPageBtn(pageNum, label) {
  const active = pageNum === currentPage ? ' active' : '';
  return `<button class="pagination-btn${active}" data-page="${pageNum}">${label}</button>`;
}

function openSharedWorkFromUrl() {
  const workId = new URL(window.location).searchParams.get('work');
  if (workId && allItems.some(i => i.generation_id === workId)) {
    openModal(workId);
  }
}

function openModal(id) {
  const item = allItems.find(i => i.generation_id === id);
  if (!item) return;

  document.getElementById('modalImage').src = `${API_BASE}${item.image_url}`;
  document.getElementById('modalStyle').textContent = getStyleLabel(item.style);
  document.getElementById('modalCaption').textContent = item.title || '(無題)';
  document.getElementById('modalDescription').textContent = item.description || '';
  document.getElementById('modalClapBtn').dataset.id = id;
  document.getElementById('modalClapBtn').classList.toggle('clapped', clappedIds.has(id));
  document.getElementById('modalClapCount').textContent = item.clap_count || 0;

  const metaParts = [];
  if (item.child_age) metaParts.push(item.child_age >= 9 ? '9歳以上' : `${item.child_age}歳`);
  if (item.prefecture) metaParts.push(item.prefecture);
  document.getElementById('modalMeta').innerHTML = `
    <strong>スタイル:</strong> ${getStyleLabel(item.style)}<br>
    ${item.author_name ? `<strong>作者:</strong> ${escapeHtml(item.author_name)}<br>` : ''}
    ${metaParts.length ? `<strong>年齢・地域:</strong> ${metaParts.join(' ・ ')}<br>` : ''}
    ${item.theme ? `<strong>テーマ:</strong> #${escapeHtml(item.theme)}<br>` : ''}
    <strong>投稿日:</strong> ${new Date(item.created_at).toLocaleDateString('ja-JP')}
  `;

  setupShareLinks(item, id);

  document.getElementById('galleryModal').classList.add('active');
  document.body.style.overflow = 'hidden';

  const url = new URL(window.location);
  url.searchParams.set('work', id);
  window.history.replaceState({}, '', url);
}

function setupShareLinks(item, id) {
  // OGP付きシェアページ(バックエンド)経由にすることで、X/LINE等のリンクプレビューに
  // 作品画像がきちんと表示される(gallery.htmlは静的ファイルなのでJS実行前のプレビュー取得では画像が出ない)。
  const shareUrl = `${API_BASE}/w/${id}`;
  const shareText = `「${item.title || '無題'}」- みんなのRAKUMOに投稿された作品です`;

  document.getElementById('shareX').href =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  document.getElementById('shareLine').href =
    `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;

  const copyBtn = document.getElementById('shareCopy');
  copyBtn.classList.remove('copied');
  copyBtn.textContent = '🔗 URLをコピー';
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      copyBtn.textContent = '✓ コピーしました';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = '🔗 URLをコピー';
        copyBtn.classList.remove('copied');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
}

function closeModal() {
  document.getElementById('galleryModal').classList.remove('active');
  document.body.style.overflow = '';

  const url = new URL(window.location);
  url.searchParams.delete('work');
  window.history.replaceState({}, '', url);
}

// Event listeners
document.querySelectorAll('.filter-btn:not(.age-btn):not(.theme-btn)').forEach(btn => {
  btn.addEventListener('click', () => filterByStyle(btn.dataset.style));
});

document.querySelectorAll('.age-btn').forEach(btn => {
  btn.addEventListener('click', () => filterByAge(btn.dataset.age));
});

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => filterByTheme(btn.dataset.theme));
});

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentSort = btn.dataset.sort;
    currentPage = 1;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b === btn));
    loadGallery();
  });
});

document.getElementById('prevBtn').addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    renderGallery();
    document.querySelector('.gallery-container').scrollIntoView({ behavior: 'smooth' });
  }
});

document.getElementById('nextBtn').addEventListener('click', () => {
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  if (currentPage < totalPages) {
    currentPage++;
    renderGallery();
    document.querySelector('.gallery-container').scrollIntoView({ behavior: 'smooth' });
  }
});

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('galleryModal').addEventListener('click', (e) => {
  if (e.target.id === 'galleryModal') closeModal();
});
document.getElementById('modalClapBtn').addEventListener('click', function () {
  handleClap(this.dataset.id, this);
});

// Initial load
loadGallery();
loadMap();

/* ==================== 47都道府県MAP ==================== */
const ALL_PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
  '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
  '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
  '熊本県','大分県','宮崎県','鹿児島県','沖縄県',
];

function levelForCount(count) {
  if (count >= 100) return 3;
  if (count >= 10) return 2;
  if (count >= 1) return 1;
  return 0;
}

async function loadMap() {
  try {
    const response = await fetch(`${API_BASE}/api/map/prefectures`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderMap(data.counts || {});
  } catch (error) {
    console.error('Failed to load map:', error);
    document.getElementById('mapStats').textContent = 'MAPを読み込めませんでした';
  }
}

function renderMap(counts) {
  const totalPosts = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const coveredCount = ALL_PREFECTURES.filter(p => (counts[p] || 0) > 0).length;

  document.getElementById('mapStats').innerHTML =
    `<span>全国の投稿数 <strong>${totalPosts}</strong>作品</span>` +
    `<span>投稿がある都道府県 <strong>${coveredCount}</strong>/47</span>`;

  const heroTotal = document.getElementById('heroStatTotal');
  const heroPref = document.getElementById('heroStatPref');
  if (heroTotal) heroTotal.textContent = totalPosts;
  if (heroPref) heroPref.textContent = `${coveredCount}/47`;

  const tooltip = document.getElementById('mapTooltip');
  const svg = document.getElementById('japanMap');

  document.querySelectorAll('.pref-cell').forEach(cell => {
    const pref = cell.dataset.pref;
    const count = counts[pref] || 0;
    const level = levelForCount(count);

    cell.classList.remove('lv1', 'lv2', 'lv3');
    if (level > 0) cell.classList.add(`lv${level}`);

    const label = document.querySelector(`.pref-label[data-pref-label="${pref}"]`);
    if (label) label.classList.toggle('dark-text', level === 1);

    const show = () => {
      const svgRect = svg.getBoundingClientRect();
      const cellX = parseFloat(cell.getAttribute('x'));
      const cellY = parseFloat(cell.getAttribute('y'));
      const cellW = parseFloat(cell.getAttribute('width'));
      const viewBox = svg.viewBox.baseVal;
      const scale = svgRect.width / viewBox.width;
      const px = svgRect.left + (cellX + cellW / 2) * scale;
      const py = svgRect.top + cellY * scale + window.scrollY;
      tooltip.style.left = `${px - svgRect.left}px`;
      tooltip.style.top = `${py - svgRect.top - window.scrollY}px`;
      tooltip.innerHTML = `<strong>${pref}</strong>${count > 0 ? `${count}作品` : '募集中'}`;
      tooltip.hidden = false;
    };
    const hide = () => { tooltip.hidden = true; };

    cell.addEventListener('mouseenter', show);
    cell.addEventListener('mouseleave', hide);
    cell.addEventListener('click', () => {
      show();
      if (count > 0) filterByPrefecture(pref);
    });
  });
}
