/**
 * ═══════════════════════════════════════════
 * CAMPUSFREELANCE — ADMIN.JS  (INDEX-SAFE)
 * All Firestore queries use at most ONE orderBy.
 * All filtering is done in JavaScript after fetch.
 * ═══════════════════════════════════════════
 */

// ─── APPROVE USER ─────────────────────────────────────────
async function approveUser(adminId, userId) {
  await USERS().doc(userId).update({
    isApproved: true,
    approvedBy: adminId,
    approvedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await sendNotification(userId, '🎉 Your account has been approved! You can now access CampusFreelance.', 'success');
  await writeAuditLog(adminId, 'user_approved', userId, 'Account approved');
}

// ─── SUSPEND USER ─────────────────────────────────────────
async function suspendUser(adminId, userId, reason = '') {
  await USERS().doc(userId).update({
    isSuspended:   true,
    suspendedBy:   adminId,
    suspendReason: reason,
    suspendedAt:   firebase.firestore.FieldValue.serverTimestamp()
  });
  await sendNotification(userId, `Your account has been suspended. Reason: ${reason}`, 'error');
  await writeAuditLog(adminId, 'user_suspended', userId, `Reason: ${reason}`);
}

// ─── UNSUSPEND USER ───────────────────────────────────────
async function unsuspendUser(adminId, userId) {
  await USERS().doc(userId).update({
    isSuspended:   false,
    suspendedBy:   null,
    suspendReason: '',
    suspendedAt:   null
  });
  await sendNotification(userId, 'Your account has been reinstated.', 'info');
  await writeAuditLog(adminId, 'user_unsuspended', userId, 'Account reinstated');
}

// ─── GRANT POST PRIVILEGE ─────────────────────────────────
async function grantPostPrivilege(adminId, userId) {
  await USERS().doc(userId).update({
    canPost:                true,
    postPrivilegeGrantedBy: adminId,
    postPrivilegeGrantedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await sendNotification(userId, '✅ You can now post tasks freely without approval!', 'success');
  await writeAuditLog(adminId, 'privilege_granted', userId, 'Post privilege granted');
}

// ─── REVOKE POST PRIVILEGE ────────────────────────────────
async function revokePostPrivilege(adminId, userId) {
  await USERS().doc(userId).update({
    canPost:                false,
    postPrivilegeGrantedBy: null,
    postPrivilegeGrantedAt: null
  });
  await sendNotification(userId, 'Your post privilege has been revoked.', 'warning');
  await writeAuditLog(adminId, 'privilege_revoked', userId, 'Post privilege revoked');
}

// ─── DELETE USER (soft) ───────────────────────────────────
async function deleteUser(adminId, userId) {
  await USERS().doc(userId).update({
    isDeleted: true,
    deletedBy:  adminId,
    deletedAt:  firebase.firestore.FieldValue.serverTimestamp()
  });
  await writeAuditLog(adminId, 'user_deleted', userId, 'User account removed');
}

// ─── APPROVE POST REQUEST ─────────────────────────────────
async function approvePostRequest(adminId, requestId) {
  const snap = await POST_REQUESTS().doc(requestId).get();
  const data = snap.data();

  const taskRef = await TASKS().add({
    ...data.taskDraft,
    postedBy:  data.requestedBy,
    status:    TASK_STATUS.OPEN,
    type:      'task',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await lockEscrow(data.requestedBy, data.taskDraft.reward, 'Task reward escrow');

  await POST_REQUESTS().doc(requestId).update({
    status:     'approved',
    reviewedBy: adminId,
    taskId:     taskRef.id,
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await sendNotification(data.requestedBy, '✅ Your task request was approved and is now live!', 'success');
  await writeAuditLog(adminId, 'post_request_approved', requestId, `Task created: ${taskRef.id}`);
}

// ─── REJECT POST REQUEST ──────────────────────────────────
async function rejectPostRequest(adminId, requestId, reason) {
  const snap = await POST_REQUESTS().doc(requestId).get();
  const data = snap.data();

  await POST_REQUESTS().doc(requestId).update({
    status:          'rejected',
    reviewedBy:      adminId,
    rejectionReason: reason,
    reviewedAt:      firebase.firestore.FieldValue.serverTimestamp()
  });

  await sendNotification(data.requestedBy, `❌ Your task request was rejected. Reason: ${reason}`, 'error');
  await writeAuditLog(adminId, 'post_request_rejected', requestId, `Reason: ${reason}`);
}

// ─── RESOLVE DISPUTE ──────────────────────────────────────
async function resolveDispute(adminId, disputeId, decision, splitRatio = 1.0) {
  const dSnap    = await DISPUTES().doc(disputeId).get();
  const dData    = dSnap.data();
  const taskSnap = await TASKS().doc(dData.taskId).get();
  const tData    = taskSnap.data();

  const amount  = dData.escrowAmount;
  const posterId = tData.postedBy;
  const doerId   = tData.assignedTo;

  if (decision === 'full_release') {
    await releaseEscrow(posterId, doerId, amount, dData.taskId);
    await TASKS().doc(dData.taskId).update({ status: TASK_STATUS.COMPLETED });
  } else if (decision === 'refund') {
    await refundEscrow(posterId, amount, dData.taskId, 'Dispute resolved — refunded to poster');
    await TASKS().doc(dData.taskId).update({ status: TASK_STATUS.CANCELLED });
  } else if (decision === 'split') {
    const doerAmt   = Math.round(amount * splitRatio);
    const posterAmt = amount - doerAmt;
    if (doerAmt > 0)   await releaseEscrow(posterId, doerId, doerAmt, dData.taskId);
    if (posterAmt > 0) await refundEscrow(posterId, posterAmt, dData.taskId, 'Dispute split');
    await TASKS().doc(dData.taskId).update({ status: TASK_STATUS.COMPLETED });
  }

  await DISPUTES().doc(disputeId).update({
    status:        'resolved',
    adminDecision: decision,
    resolvedBy:    adminId,
    resolvedAt:    firebase.firestore.FieldValue.serverTimestamp()
  });

  await writeAuditLog(adminId, 'dispute_resolved', disputeId, `Decision: ${decision}`);
}

// ─── DELETE TASK ──────────────────────────────────────────
async function adminDeleteTask(adminId, taskId, reason = '') {
  const task = await TASKS().doc(taskId).get();
  const data = task.data();

  if (data.status === TASK_STATUS.OPEN && data.reward) {
    await refundEscrow(data.postedBy, data.reward, taskId, 'Admin removed task');
  }

  await TASKS().doc(taskId).update({
    status:       'cancelled',
    deletedBy:    adminId,
    deleteReason: reason,
    deletedAt:    firebase.firestore.FieldValue.serverTimestamp()
  });

  await sendNotification(data.postedBy, `Your task "${data.title}" was removed by admin. ${reason ? 'Reason: ' + reason : ''}`, 'error');
  await writeAuditLog(adminId, 'task_deleted', taskId, reason);
}

// ─── CHANGE USER ROLE ─────────────────────────────────────
async function changeUserRole(adminId, userId, newRole) {
  if (currentUserData?.role !== 'super_admin') throw new Error('Only Super Admins can change roles.');

  const oldSnap = await USERS().doc(userId).get();
  const oldRole = oldSnap.data().role;

  await USERS().doc(userId).update({
    role:       newRole,
    canPost:    AUTO_POST_ROLES.includes(newRole),
    isApproved: true
  });

  await sendNotification(userId, `Your role has been changed to ${ROLE_INFO[newRole]?.label || newRole}`, 'info');
  await writeAuditLog(adminId, 'role_changed', userId, `${oldRole} → ${newRole}`);
}

// ─── LOAD ADMIN STATS ─────────────────────────────────────
// FIX: fetch all docs then count in JS — no compound queries needed
async function loadAdminStats() {
  const [usersSnap, tasksSnap, postReqSnap, disputesSnap] = await Promise.all([
    USERS().get(),
    TASKS().get(),
    POST_REQUESTS().get(),
    DISPUTES().get()
  ]);

  const users     = usersSnap.docs.map(d => d.data());
  const tasks     = tasksSnap.docs.map(d => d.data());
  const postReqs  = postReqSnap.docs.map(d => d.data());
  const disputes  = disputesSnap.docs.map(d => d.data());

  return {
    totalUsers:   users.filter(u => !u.isDeleted).length,
    totalTasks:   tasks.filter(t => t.status !== 'cancelled').length,
    pendingUsers: users.filter(u => !u.isApproved && !u.isSuspended && !u.isDeleted).length,
    pendingReqs:  postReqs.filter(r => r.status === 'pending').length,
    openDisputes: disputes.filter(d => d.status === 'open').length,
    activeTasks:  tasks.filter(t => [TASK_STATUS.OPEN, TASK_STATUS.IN_PROGRESS].includes(t.status)).length
  };
}

// ─── LOAD ALL USERS ───────────────────────────────────────
// FIX: simple fetch with no compound filters — all filtering in JS
async function loadAllUsers(filters = {}) {
  // Single orderBy only — no compound query, no index needed
  const snap = await USERS().orderBy('createdAt', 'desc').get();

  let users = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u => !u.isDeleted); // filter deleted in JS

  if (filters.role) {
    users = users.filter(u => u.role === filters.role);
  }

  if (filters.approved !== undefined) {
    users = users.filter(u => u.isApproved === filters.approved);
  }

  if (filters.search) {
    const s = filters.search.toLowerCase();
    users = users.filter(u =>
      u.name?.toLowerCase().includes(s) ||
      u.email?.toLowerCase().includes(s)
    );
  }

  if (filters.status === 'pending') {
    users = users.filter(u => !u.isApproved && !u.isSuspended);
  } else if (filters.status === 'approved') {
    users = users.filter(u => u.isApproved && !u.isSuspended);
  } else if (filters.status === 'suspended') {
    users = users.filter(u => u.isSuspended);
  }

  return users;
}

// ─── LOAD AUDIT LOG ───────────────────────────────────────
// FIX: single orderBy, no compound filter
async function loadAuditLog(limit = 50) {
  const snap = await AUDIT_LOGS()
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── MINI CHART ───────────────────────────────────────────
function renderMiniChart(containerId, values = []) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const max = Math.max(...values, 1);
  container.innerHTML = values.map(v =>
    `<div class="mini-bar" title="${v}" style="height:${Math.round((v/max)*56)+4}px"></div>`
  ).join('');
}
