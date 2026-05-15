/**
 * ═══════════════════════════════════════════
 * CAMPUSFREELANCE — CREDITS.JS  (INDEX-SAFE)
 * ═══════════════════════════════════════════
 */

// ─── SPEND ────────────────────────────────────────────────
async function spendCredits(userId, amount, note = '') {
  const snap = await USERS().doc(userId).get();
  const data = snap.data();
  if (data.creditsAvailable < amount) {
    throw new Error(`Insufficient credits. You have ${data.creditsAvailable} CP, need ${amount} CP.`);
  }

  const batch = db.batch();
  batch.update(USERS().doc(userId), {
    creditsAvailable: firebase.firestore.FieldValue.increment(-amount),
    creditsSpent:     firebase.firestore.FieldValue.increment(amount)
  });
  const txRef = TRANSACTIONS().doc();
  batch.set(txRef, {
    type: 'spend', fromUser: userId, toUser: 'system',
    amount, note, taskId: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
}

// ─── EARN ─────────────────────────────────────────────────
async function earnCredits(userId, amount, note = '', taskId = null) {
  const batch = db.batch();
  batch.update(USERS().doc(userId), {
    creditsAvailable: firebase.firestore.FieldValue.increment(amount),
    creditsEarned:    firebase.firestore.FieldValue.increment(amount)
  });
  const txRef = TRANSACTIONS().doc();
  batch.set(txRef, {
    type: 'earn', fromUser: 'system', toUser: userId,
    amount, note, taskId,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
}

// ─── LOCK ESCROW ──────────────────────────────────────────
async function lockEscrow(userId, amount, note = '') {
  const snap = await USERS().doc(userId).get();
  const data = snap.data();
  if (data.creditsAvailable < amount) {
    throw new Error(`Need ${amount} CP to post this task. You have ${data.creditsAvailable} CP.`);
  }

  const batch = db.batch();
  batch.update(USERS().doc(userId), {
    creditsAvailable: firebase.firestore.FieldValue.increment(-amount),
    creditsEscrow:    firebase.firestore.FieldValue.increment(amount)
  });
  const txRef = TRANSACTIONS().doc();
  batch.set(txRef, {
    type: 'escrow_lock', fromUser: userId, toUser: 'escrow',
    amount, note,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
}

// ─── RELEASE ESCROW ───────────────────────────────────────
async function releaseEscrow(fromUserId, toUserId, amount, taskId) {
  const batch = db.batch();
  batch.update(USERS().doc(fromUserId), {
    creditsEscrow: firebase.firestore.FieldValue.increment(-amount),
    creditsSpent:  firebase.firestore.FieldValue.increment(amount)
  });
  batch.update(USERS().doc(toUserId), {
    creditsAvailable: firebase.firestore.FieldValue.increment(amount),
    creditsEarned:    firebase.firestore.FieldValue.increment(amount)
  });
  const txRef = TRANSACTIONS().doc();
  batch.set(txRef, {
    type: 'escrow_release', fromUser: fromUserId, toUser: toUserId,
    amount, taskId, note: 'Task completion payment',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
}

// ─── REFUND ESCROW ────────────────────────────────────────
async function refundEscrow(userId, amount, taskId, note = 'Task refund') {
  const batch = db.batch();
  batch.update(USERS().doc(userId), {
    creditsAvailable: firebase.firestore.FieldValue.increment(amount),
    creditsEscrow:    firebase.firestore.FieldValue.increment(-amount)
  });
  const txRef = TRANSACTIONS().doc();
  batch.set(txRef, {
    type: 'escrow_refund', fromUser: 'escrow', toUser: userId,
    amount, taskId, note,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
}

// ─── ADMIN TOP-UP ─────────────────────────────────────────
async function adminTopUp(adminId, targetUserId, amount, note = 'Admin credit allocation') {
  const batch = db.batch();
  batch.update(USERS().doc(targetUserId), {
    creditsAvailable: firebase.firestore.FieldValue.increment(amount),
    creditsEarned:    firebase.firestore.FieldValue.increment(amount)
  });
  const txRef = TRANSACTIONS().doc();
  batch.set(txRef, {
    type: 'admin_topup', fromUser: adminId, toUser: targetUserId,
    amount, note, taskId: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();

  await writeAuditLog(adminId, 'credit_topup', targetUserId, `Added ${amount} CP. Note: ${note}`);
  await sendNotification(targetUserId, `${amount} CP added to your wallet by Admin. Note: ${note}`, 'credit');
}

// ─── GRANT BONUS ──────────────────────────────────────────
async function grantBonus(userId, amount, reason) {
  await earnCredits(userId, amount, reason);
  await sendNotification(userId, `🎉 Bonus ${amount} CP credited: ${reason}`, 'bonus');
}

// ─── RATE USER ────────────────────────────────────────────
async function rateUser(taskId, fromUserId, toUserId, score, comment = '') {
  // FIX: fetch all ratings for this task, filter in JS
  const existing = await RATINGS().where('taskId', '==', taskId).get();
  const alreadyRated = existing.docs.some(d => d.data().fromUser === fromUserId);
  if (alreadyRated) throw new Error('You already rated this user for this task.');

  await RATINGS().add({
    taskId, fromUser: fromUserId, toUser: toUserId,
    score, comment,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Recalculate average — fetch by toUser only (single where)
  const allRatings = await RATINGS().where('toUser', '==', toUserId).get();
  const total = allRatings.docs.reduce((sum, d) => sum + d.data().score, 0);
  const avg   = total / allRatings.size;

  await USERS().doc(toUserId).update({
    rating:      Math.round(avg * 10) / 10,
    ratingCount: allRatings.size
  });

  if (score === 5) await grantBonus(toUserId, 10, '5-star rating bonus');
  if (score === 4) await grantBonus(toUserId,  5, '4-star rating bonus');
}

// ─── GET TRANSACTIONS ─────────────────────────────────────
// FIX: two simple single-where queries instead of compound
async function getUserTransactions(userId, limit = 30) {
  const [received, sent] = await Promise.all([
    TRANSACTIONS().where('toUser',   '==', userId).orderBy('createdAt', 'desc').limit(limit).get(),
    TRANSACTIONS().where('fromUser', '==', userId).orderBy('createdAt', 'desc').limit(limit).get()
  ]);

  const all = [
    ...received.docs.map(d => ({ id: d.id, direction: 'in',  ...d.data() })),
    ...sent.docs.map(d =>     ({ id: d.id, direction: 'out', ...d.data() }))
  ].sort((a, b) => {
    const ta = a.createdAt?.toDate?.()?.getTime?.() || 0;
    const tb = b.createdAt?.toDate?.()?.getTime?.() || 0;
    return tb - ta;
  });

  return all.slice(0, limit);
}

// ─── RENDER TRANSACTION ROW ───────────────────────────────
function renderTxRow(tx) {
  const isCredit = ['earn', 'escrow_release', 'admin_topup', 'bonus', 'escrow_refund']
    .includes(tx.type) && tx.direction === 'in';

  const typeLabels = {
    earn:            '✅ Task Earned',
    spend:           '💸 Task Posted',
    escrow_lock:     '🔒 Escrowed',
    escrow_release:  '✅ Payment Released',
    escrow_refund:   '↩️ Refunded',
    admin_topup:     '🏦 Admin Top-up',
    bonus:           '🎉 Bonus'
  };

  return `
    <tr>
      <td>
        <div class="tx-type">${typeLabels[tx.type] || tx.type}</div>
        <div style="font-size:12px;color:var(--text-muted)">${tx.note || '—'}</div>
      </td>
      <td class="tx-amount ${isCredit ? 'credit' : 'debit'}">
        ${isCredit ? '+' : '-'}${formatCredits(tx.amount)}
      </td>
      <td style="font-size:13px;color:var(--text-muted)">${timeAgo(tx.createdAt)}</td>
    </tr>`;
}
