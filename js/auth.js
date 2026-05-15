/**
 * ═══════════════════════════════════════════
 * CAMPUSFREELANCE — AUTH.JS  (INDEX-SAFE)
 * ═══════════════════════════════════════════
 */

let currentUser     = null;
let currentUserData = null;

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    try {
      const snap = await USERS().doc(user.uid).get();
      if (snap.exists) {
        currentUserData = { id: snap.id, ...snap.data() };
        onUserReady(currentUserData);
      } else {
        onUserReady(null);
      }
    } catch (e) {
      console.error('User fetch error:', e);
      onUserReady(null);
    }
  } else {
    currentUser     = null;
    currentUserData = null;
    onUserReady(null);
  }
});

window.onUserReady = function(userData) {};

// ─── GUARDS ───────────────────────────────────────────────
function requireAuth() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = getAuthPath() + 'login.html'; return; }

    const snap = await USERS().doc(user.uid).get();
    if (!snap.exists) { window.location.href = getAuthPath() + 'login.html'; return; }

    const data = snap.data();

    if (data.isSuspended) {
      await auth.signOut();
      window.location.href = getAuthPath() + 'login.html?err=suspended';
      return;
    }

    if (!data.isApproved) {
      window.location.href = getAuthPath() + 'login.html?err=pending';
      return;
    }

    currentUser     = user;
    currentUserData = { id: snap.id, ...data };
    window.onUserReady(currentUserData);
  });
}

function requireAdmin() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = getAdminAuthPath() + 'login.html'; return; }

    const snap = await USERS().doc(user.uid).get();
    if (!snap.exists) { signOut(); return; }

    const data = snap.data();
    if (!['admin', 'super_admin'].includes(data.role)) {
      window.location.href = '../user/dashboard.html';
      return;
    }

    currentUser     = user;
    currentUserData = { id: snap.id, ...data };
    window.onUserReady(currentUserData);
  });
}

function requireGuest() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      const snap = await USERS().doc(user.uid).get();
      if (snap.exists) {
        const role = snap.data().role;
        if (['admin', 'super_admin'].includes(role)) {
          window.location.href = 'admin/dashboard.html';
        } else {
          window.location.href = 'user/dashboard.html';
        }
      }
    }
  });
}

function getAuthPath() {
  const p = window.location.pathname;
  return (p.includes('/user/') || p.includes('/admin/')) ? '../' : '';
}

function getAdminAuthPath() { return '../'; }

// ─── SIGN OUT ─────────────────────────────────────────────
async function signOut() {
  await auth.signOut();
  const path = getAuthPath();
  window.location.href = path ? path + '../index.html' : 'index.html';
}

// ─── REGISTER ─────────────────────────────────────────────
async function registerUser(formData) {
  const { name, email, password, role, collegeId, department } = formData;

  const cred = await auth.createUserWithEmailAndPassword(email, password);
  const uid  = cred.user.uid;
  await cred.user.updateProfile({ displayName: name });

  const autoApproved = AUTO_POST_ROLES.includes(role);

  await USERS().doc(uid).set({
    name, email, role,
    collegeId:    collegeId || '',
    department:   department || '',
    isApproved:   autoApproved,
    isSuspended:  false,
    isDeleted:    false,
    canPost:      AUTO_POST_ROLES.includes(role),
    creditsAvailable: STARTER_CREDITS[role] || 0,
    creditsEscrow:    0,
    creditsEarned:    0,
    creditsSpent:     0,
    rating:           0,
    ratingCount:      0,
    completedTasks:   0,
    postRequestsCount: 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  if (STARTER_CREDITS[role] > 0) {
    await TRANSACTIONS().add({
      fromUser: 'system',
      toUser:   uid,
      amount:   STARTER_CREDITS[role],
      type:     'bonus',
      note:     'Welcome starter credits',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  return { uid, isApproved: autoApproved };
}

// ─── LOGIN ────────────────────────────────────────────────
async function loginUser(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  const snap = await USERS().doc(cred.user.uid).get();

  if (!snap.exists) throw new Error('User profile not found. Contact admin.');

  const data = snap.data();
  if (data.isSuspended) {
    await auth.signOut();
    throw new Error('Your account has been suspended. Contact admin.');
  }

  return { uid: cred.user.uid, ...data };
}

// ─── RESET PASSWORD ───────────────────────────────────────
async function resetPassword(email) {
  await auth.sendPasswordResetEmail(email);
}

// ─── POPULATE SIDEBAR ─────────────────────────────────────
function populateSidebarUser(userData) {
  const nameEl   = document.getElementById('sidebarName');
  const roleEl   = document.getElementById('sidebarRole');
  const credEl   = document.getElementById('sidebarCredits');
  const avatarEl = document.getElementById('sidebarAvatar');

  if (nameEl)   nameEl.textContent   = userData.name || 'User';
  if (roleEl)   roleEl.textContent   = ROLE_INFO[userData.role]?.label || userData.role;
  if (credEl)   credEl.textContent   = formatCredits(userData.creditsAvailable || 0);
  if (avatarEl) {
    avatarEl.textContent   = getInitials(userData.name);
    avatarEl.style.background = stringToColor(userData.name);
  }
}

// ─── FRIENDLY AUTH ERRORS ─────────────────────────────────
function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':        'No account found with this email.',
    'auth/wrong-password':        'Incorrect password.',
    'auth/email-already-in-use':  'An account with this email already exists.',
    'auth/weak-password':         'Password must be at least 6 characters.',
    'auth/invalid-email':         'Please enter a valid email address.',
    'auth/too-many-requests':     'Too many failed attempts. Try again later.',
    'auth/network-request-failed':'Network error. Check your connection.',
    'auth/invalid-credential':    'Incorrect email or password.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}
