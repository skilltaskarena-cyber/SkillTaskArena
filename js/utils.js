/**
 * ═══════════════════════════════════════════
 * CAMPUSFREELANCE — UTILITIES
 * ═══════════════════════════════════════════
 */

// ─── TOAST NOTIFICATIONS ──────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── FORMAT DATE ──────────────────────────────────────
function formatDate(timestamp) {
  if (!timestamp) return '—';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  });
}

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const d    = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now  = new Date();
  const secs = Math.floor((now - d) / 1000);
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800)return `${Math.floor(secs / 86400)}d ago`;
  return formatDate(timestamp);
}

function daysLeft(deadline) {
  if (!deadline) return null;
  const d   = deadline.toDate ? deadline.toDate() : new Date(deadline);
  const now = new Date();
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  return diff;
}

function formatDeadline(deadline) {
  const days = daysLeft(deadline);
  if (days === null) return '—';
  if (days < 0)  return `<span style="color:var(--red)">Overdue</span>`;
  if (days === 0)return `<span style="color:var(--red)">Due today</span>`;
  if (days === 1)return `<span style="color:var(--yellow)">Due tomorrow</span>`;
  if (days <= 3) return `<span style="color:var(--yellow)">${days} days left</span>`;
  return `<span style="color:var(--text-muted)">${days} days left</span>`;
}

// ─── AVATAR INITIALS ──────────────────────────────────
function getInitials(name = '') {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function avatarEl(name, size = '') {
  const div = document.createElement('div');
  div.className = `avatar ${size}`;
  div.textContent = getInitials(name);
  div.style.background = stringToColor(name);
  return div;
}

function stringToColor(str = '') {
  const colors = [
    '#0f172a','#1e3a5f','#0d4a3a','#3d1e0a',
    '#1a0a2e','#0a2e1a','#2e0a1a','#1e1a0a'
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ─── STAR RATING ──────────────────────────────────────
function starsHTML(rating = 0) {
  let html = '<span class="stars">';
  for (let i = 1; i <= 5; i++) {
    html += `<span style="opacity:${i <= rating ? 1 : 0.25}">★</span>`;
  }
  html += '</span>';
  return html;
}

// ─── BADGE HTML ───────────────────────────────────────
function roleHTML(role) {
  const info = ROLE_INFO[role] || { label: role, icon: '👤', color: 'gray' };
  return `<span class="badge badge-${info.color}">${info.icon} ${info.label}</span>`;
}

function statusHTML(status) {
  const map = {
    open:        { label: 'Open',        cls: 'badge-blue'   },
    in_progress: { label: 'In Progress', cls: 'badge-yellow' },
    review:      { label: 'Under Review',cls: 'badge-purple' },
    completed:   { label: 'Completed',   cls: 'badge-green'  },
    disputed:    { label: 'Disputed',    cls: 'badge-red'    },
    cancelled:   { label: 'Cancelled',   cls: 'badge-gray'   },
    pending:     { label: 'Pending',     cls: 'badge-yellow' },
    approved:    { label: 'Approved',    cls: 'badge-green'  },
    rejected:    { label: 'Rejected',    cls: 'badge-red'    },
    accepted:    { label: 'Accepted',    cls: 'badge-green'  },
    declined:    { label: 'Declined',    cls: 'badge-red'    }
  };
  const s = map[status] || { label: status, cls: 'badge-gray' };
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}

// ─── MODAL HELPERS ────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('show');
  document.body.style.overflow = '';
}

// Close on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('show');
    document.body.style.overflow = '';
  }
  if (e.target.classList.contains('modal-close')) {
    e.target.closest('.modal-overlay')?.classList.remove('show');
    document.body.style.overflow = '';
  }
});

// ─── TABS ─────────────────────────────────────────────
function initTabs(containerSelector = '.tabs') {
  document.querySelectorAll(containerSelector + ' .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.tabs');
      group.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(tc => {
        tc.classList.toggle('active', tc.id === target);
      });
    });
  });

  // Activate first tab
  document.querySelector(containerSelector + ' .tab-btn')?.click();
}

// ─── SIDEBAR MOBILE ───────────────────────────────────
function initSidebar() {
  const toggle  = document.querySelector('.sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');

  toggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    overlay?.classList.toggle('show');
  });

  overlay?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('show');
  });
}

// ─── ACTIVE NAV ───────────────────────────────────────
function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-item[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (href && path.includes(href.replace('../', '').replace('.html', ''))) {
      a.classList.add('active');
    }
  });
}

// ─── BUTTON LOADING ───────────────────────────────────
function setLoading(btn, loading = true, text = '') {
  if (loading) {
    btn._origText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> ${text || 'Loading...'}`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn._origText || text;
    btn.disabled = false;
  }
}

// ─── FORM VALIDATION ──────────────────────────────────
function showError(inputEl, message) {
  const errEl = inputEl.parentElement.querySelector('.form-error')
    || inputEl.closest('.form-group')?.querySelector('.form-error');
  if (errEl) { errEl.textContent = message; errEl.classList.add('show'); }
  inputEl.style.borderColor = 'var(--red)';
}

function clearError(inputEl) {
  const errEl = inputEl.parentElement.querySelector('.form-error')
    || inputEl.closest('.form-group')?.querySelector('.form-error');
  if (errEl) errEl.classList.remove('show');
  inputEl.style.borderColor = '';
}

function clearAllErrors(formEl) {
  formEl.querySelectorAll('.form-error').forEach(e => e.classList.remove('show'));
  formEl.querySelectorAll('input, select, textarea').forEach(el => el.style.borderColor = '');
}

// ─── TAG INPUT ────────────────────────────────────────
function initTagInput(wrapId, inputId, tagsArrayRef) {
  const wrap  = document.getElementById(wrapId);
  const input = document.getElementById(inputId);
  if (!wrap || !input) return;

  function addTag(val) {
    val = val.trim().toLowerCase();
    if (!val || tagsArrayRef.includes(val) || tagsArrayRef.length >= 10) return;
    tagsArrayRef.push(val);
    renderTags();
  }

  function renderTags() {
    wrap.querySelectorAll('.tag-chip').forEach(c => c.remove());
    tagsArrayRef.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `${tag}<button type="button" onclick="removeTag('${tag}',event)">×</button>`;
      wrap.insertBefore(chip, input);
    });
  }

  input.addEventListener('keydown', e => {
    if (['Enter', ',', ' '].includes(e.key)) {
      e.preventDefault();
      addTag(input.value);
      input.value = '';
    }
    if (e.key === 'Backspace' && !input.value && tagsArrayRef.length) {
      tagsArrayRef.pop();
      renderTags();
    }
  });

  wrap.addEventListener('click', () => input.focus());

  window._tagInputRef = tagsArrayRef;
  window.removeTag = (tag) => {
    const i = tagsArrayRef.indexOf(tag);
    if (i > -1) { tagsArrayRef.splice(i, 1); renderTags(); }
  };
}

// ─── CREDIT FORMATTER ─────────────────────────────────
function formatCredits(n = 0) {
  return `${n.toLocaleString()} CP`;
}

// ─── EMPTY STATE HTML ─────────────────────────────────
function emptyStateHTML(icon, title, desc, btnText = '', btnAction = '') {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <h3>${title}</h3>
      <p>${desc}</p>
      ${btnText ? `<button class="btn btn-primary" onclick="${btnAction}">${btnText}</button>` : ''}
    </div>`;
}

// ─── SEND NOTIFICATION (to Firestore) ─────────────────
async function sendNotification(userId, message, type = 'info') {
  try {
    await NOTIFICATIONS().add({
      userId, message, type,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.warn('Notification failed:', e); }
}

// ─── AUDIT LOG ────────────────────────────────────────
async function writeAuditLog(adminId, action, targetId, details = '') {
  try {
    await AUDIT_LOGS().add({
      adminId, action, targetId, details,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.warn('Audit log failed:', e); }
}

// ─── URL PARAMS ───────────────────────────────────────
function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

// ─── CONFIRM DIALOG ───────────────────────────────────
function confirmAction(message, onConfirm) {
  const overlay = document.getElementById('confirmModal');
  if (!overlay) return onConfirm(); // fallback
  document.getElementById('confirmMessage').textContent = message;
  openModal('confirmModal');
  document.getElementById('confirmYes').onclick = () => {
    closeModal('confirmModal');
    onConfirm();
  };
}

// ─── DEBOUNCE ─────────────────────────────────────────
function debounce(fn, delay = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
