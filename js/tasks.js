/**
 * ═══════════════════════════════════════════
 * CAMPUSFREELANCE — TASKS.JS  (INDEX-SAFE)
 * All Firestore queries use simple single-field
 * orderBy. All filtering done in JavaScript.
 * ═══════════════════════════════════════════
 */

// ─── CREATE REGULAR TASK ──────────────────────────────────
async function createTask(taskData, userId) {
  await lockEscrow(userId, taskData.reward, 'Task reward escrow');

  const ref = await TASKS().add({
    ...taskData,
    postedBy:        userId,
    assignedTo:      null,
    status:          TASK_STATUS.OPEN,
    type:            'task',
    isCollaborative: false,
    applicants:      [],
    createdAt:       firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt:       firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

// ─── SUBMIT POST REQUEST ──────────────────────────────────
async function submitPostRequest(taskDraft, userId) {
  const user = await USERS().doc(userId).get();
  if (user.data().creditsAvailable < 5) {
    throw new Error('Insufficient credits. You need at least 5 CP to submit a request.');
  }

  await spendCredits(userId, 5, 'Post request submission fee');
  await USERS().doc(userId).update({
    postRequestsCount: firebase.firestore.FieldValue.increment(1)
  });

  const ref = await POST_REQUESTS().add({
    requestedBy:     userId,
    taskDraft,
    status:          'pending',
    reviewedBy:      null,
    rejectionReason: '',
    createdAt:       firebase.firestore.FieldValue.serverTimestamp(),
    reviewedAt:      null
  });
  return ref.id;
}

// ─── APPLY FOR TASK ───────────────────────────────────────
async function applyForTask(taskId, userId, message) {
  // FIX: fetch apps for this task and filter in JS — no compound where needed
  const existing = await APPLICATIONS().where('taskId', '==', taskId).get();
  const alreadyApplied = existing.docs.some(d => d.data().applicantId === userId);
  if (alreadyApplied) throw new Error('You already applied for this task.');

  const task = await TASKS().doc(taskId).get();
  if (!task.exists) throw new Error('Task not found.');
  if (task.data().postedBy === userId) throw new Error('You cannot apply for your own task.');
  if (task.data().status !== TASK_STATUS.OPEN) throw new Error('This task is no longer open.');

  await APPLICATIONS().add({
    taskId,
    applicantId: userId,
    message:     message || '',
    status:      'pending',
    appliedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    reviewedAt:  null
  });

  await sendNotification(
    task.data().postedBy,
    `Someone applied for your task: "${task.data().title}"`,
    'application'
  );
}

// ─── ACCEPT APPLICATION ───────────────────────────────────
async function acceptApplication(appId, taskId, applicantId, posterId) {
  const batch = db.batch();

  batch.update(APPLICATIONS().doc(appId), {
    status:     'accepted',
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  batch.update(TASKS().doc(taskId), {
    assignedTo: applicantId,
    status:     TASK_STATUS.IN_PROGRESS,
    updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
  });

  // FIX: fetch by taskId only, filter pending in JS
  const others = await APPLICATIONS().where('taskId', '==', taskId).get();
  others.forEach(doc => {
    if (doc.id !== appId && doc.data().status === 'pending') {
      batch.update(APPLICATIONS().doc(doc.id), { status: 'rejected' });
    }
  });

  await batch.commit();
  await sendNotification(applicantId, 'Your application was accepted! Get started.', 'success');
}

// ─── MARK TASK FOR REVIEW ─────────────────────────────────
async function markTaskForReview(taskId, userId) {
  const task = await TASKS().doc(taskId).get();
  if (!task.exists) throw new Error('Task not found.');
  if (task.data().assignedTo !== userId) throw new Error('Unauthorized.');

  await TASKS().doc(taskId).update({
    status:    TASK_STATUS.REVIEW,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await sendNotification(
    task.data().postedBy,
    `Task "${task.data().title}" has been submitted for review.`,
    'review'
  );
}

// ─── CONFIRM TASK COMPLETION ──────────────────────────────
async function confirmTaskCompletion(taskId, userId) {
  const task = await TASKS().doc(taskId).get();
  const data = task.data();
  if (data.postedBy !== userId) throw new Error('Unauthorized.');
  if (data.status !== TASK_STATUS.REVIEW) throw new Error('Task is not under review.');

  await releaseEscrow(data.postedBy, data.assignedTo, data.reward, taskId);

  await TASKS().doc(taskId).update({
    status:      TASK_STATUS.COMPLETED,
    completedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
  });

  await USERS().doc(data.assignedTo).update({
    completedTasks: firebase.firestore.FieldValue.increment(1)
  });

  await sendNotification(
    data.assignedTo,
    `Task completed! ${formatCredits(data.reward)} has been added to your wallet.`,
    'success'
  );
}

// ─── RAISE DISPUTE ────────────────────────────────────────
async function raiseDispute(taskId, raisedBy, against, reason) {
  const task = await TASKS().doc(taskId).get();
  const data = task.data();

  await DISPUTES().add({
    taskId, raisedBy, against, reason,
    escrowAmount:  data.reward,
    status:        'open',
    adminDecision: '',
    resolvedBy:    null,
    createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
    resolvedAt:    null
  });

  await TASKS().doc(taskId).update({ status: TASK_STATUS.DISPUTED });
  await sendNotification(against, `A dispute was raised on task "${data.title}".`, 'warning');
}

// ─── CREATE EVENT TASK ────────────────────────────────────
async function createEventTask(eventData, adminId) {
  const { leads = [], ...rest } = eventData;

  const collaborators = leads.map(uid => ({
    userId:  uid,
    role:    'lead',
    status:  'confirmed',
    addedBy: adminId,
    joinedAt: new Date()
  }));

  const ref = await TASKS().add({
    ...rest,
    postedBy:         adminId,
    type:             'event',
    isCollaborative:  true,
    collaborators,
    seatsFilled:      leads.length,
    seatsOpen:        (eventData.collaboratorLimit || 5) - leads.length,
    applicationOpen:  true,
    status:           TASK_STATUS.OPEN,
    createdAt:        firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt:        firebase.firestore.FieldValue.serverTimestamp()
  });

  for (const uid of leads) {
    await sendNotification(uid, `You've been assigned as Lead for event: "${rest.title}"`, 'event');
  }

  return ref.id;
}

// ─── APPLY FOR EVENT ──────────────────────────────────────
async function applyForEvent(taskId, userId, message) {
  const task = await TASKS().doc(taskId).get();
  const data = task.data();

  if (!data.applicationOpen) throw new Error('Applications are closed for this event.');
  if (data.seatsOpen <= 0)   throw new Error('No seats available.');

  const isAlready = (data.collaborators || []).some(c => c.userId === userId);
  if (isAlready) throw new Error('You are already part of this event.');

  // FIX: fetch by taskId only, check applicant in JS
  const existing = await EVENT_APPS().where('taskId', '==', taskId).get();
  const alreadyApplied = existing.docs.some(d => d.data().applicantId === userId);
  if (alreadyApplied) throw new Error('You already applied for this event.');

  await EVENT_APPS().add({
    taskId, applicantId: userId,
    appliedFor:      'member',
    message:         message || '',
    status:          'pending',
    reviewedBy:      null,
    rejectionReason: '',
    appliedAt:       firebase.firestore.FieldValue.serverTimestamp(),
    reviewedAt:      null
  });

  const leads = (data.collaborators || []).filter(c => c.role === 'lead');
  for (const lead of leads) {
    await sendNotification(lead.userId, `New application for event: "${data.title}"`, 'event');
  }
}

// ─── APPROVE EVENT MEMBER ─────────────────────────────────
async function approveEventMember(appId, taskId, applicantId, leadId) {
  const task = await TASKS().doc(taskId).get();
  const data = task.data();
  if (data.seatsOpen <= 0) throw new Error('No seats available.');

  const newCollab = {
    userId:  applicantId,
    role:    'member',
    status:  'confirmed',
    addedBy: leadId,
    joinedAt: new Date()
  };

  await TASKS().doc(taskId).update({
    collaborators:  firebase.firestore.FieldValue.arrayUnion(newCollab),
    seatsFilled:    firebase.firestore.FieldValue.increment(1),
    seatsOpen:      firebase.firestore.FieldValue.increment(-1),
    applicationOpen: data.seatsOpen - 1 > 0,
    updatedAt:      firebase.firestore.FieldValue.serverTimestamp()
  });

  await EVENT_APPS().doc(appId).update({
    status:     'approved',
    reviewedBy: leadId,
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await sendNotification(applicantId, `Your application for the event was approved! 🎉`, 'success');
}

// ─── SEND EVENT INVITE ────────────────────────────────────
async function sendEventInvite(taskId, fromUserId, toUserId, message) {
  const task = await TASKS().doc(taskId).get();
  if (!task.exists) throw new Error('Task not found.');

  await EVENT_INVITES().add({
    taskId, fromUser: fromUserId, toUser: toUserId, message,
    status:      'pending',
    createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
    respondedAt: null
  });

  await sendNotification(toUserId, `You've been invited to join an event: "${task.data().title}"`, 'invite');
}

// ─── LOAD OPEN TASKS ──────────────────────────────────────
// FIX: single where + single orderBy — no compound index needed
async function loadOpenTasks({ tags, search, type, limit = 50 } = {}) {
  // Base query: only open tasks, ordered by newest first
  const snap = await TASKS()
    .where('status', '==', TASK_STATUS.OPEN)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  let tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // All extra filtering in JS — no extra Firestore indexes needed
  if (type) {
    tasks = tasks.filter(t => t.type === type);
  }

  if (tags && tags.length) {
    tasks = tasks.filter(t => tags.some(tag => (t.tags || []).includes(tag)));
  }

  if (search) {
    const s = search.toLowerCase();
    tasks = tasks.filter(t =>
      t.title?.toLowerCase().includes(s) ||
      t.description?.toLowerCase().includes(s)
    );
  }

  return tasks;
}

// ─── LOAD MY POSTED TASKS ─────────────────────────────────
// FIX: single where only, no orderBy on different field
async function loadMyPostedTasks(userId) {
  const snap = await TASKS()
    .where('postedBy', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── LOAD MY ASSIGNED TASKS ───────────────────────────────
async function loadMyAssignedTasks(userId) {
  const snap = await TASKS()
    .where('assignedTo', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── RENDER TASK CARD ─────────────────────────────────────
function renderTaskCard(task, userData, options = {}) {
  const isEvent = task.type === 'event';
  const days    = daysLeft(task.deadline);

  const deadlineLabel = days === null ? '' :
    days < 0  ? '<span class="badge badge-red">Overdue</span>' :
    days <= 3 ? `<span class="badge badge-yellow">${days}d left</span>` :
                `<span style="color:var(--text-muted);font-size:13px">${days} days left</span>`;

  const tagsHTML = (task.tags || [])
    .map(t => `<span class="tag">${t}</span>`).join('');

  let seatBar = '';
  if (isEvent && task.collaboratorLimit) {
    const pct = Math.round(((task.seatsFilled || 0) / task.collaboratorLimit) * 100);
    seatBar = `
      <div class="seat-bar">
        <div class="seat-bar-label">
          <span>👥 ${task.seatsFilled || 0}/${task.collaboratorLimit} collaborators</span>
          <span>${task.seatsOpen || 0} open</span>
        </div>
        <div class="seat-bar-track">
          <div class="seat-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  const actionBtn = options.hideAction ? '' : `
    <button class="btn btn-primary btn-sm"
      onclick="${isEvent ? `applyEvent('${task.id}')` : `applyTask('${task.id}')`}">
      ${isEvent ? '🎪 Apply to Join' : '📝 Apply'}
    </button>`;

  return `
    <div class="task-card ${isEvent ? 'event-task' : ''}" id="task-${task.id}">
      <div class="task-card-header">
        <div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
            ${isEvent ? '<span class="badge badge-purple">🎪 EVENT</span>' : ''}
            ${statusHTML(task.status)}
          </div>
          <div class="task-card-title">${task.title}</div>
        </div>
        <div class="task-reward">${task.reward}<small> CP</small></div>
      </div>
      <p style="font-size:13px;color:var(--text-muted);line-height:1.5;margin-bottom:8px">
        ${(task.description || '').slice(0, 120)}${(task.description || '').length > 120 ? '...' : ''}
      </p>
      ${seatBar}
      <div class="task-card-tags">${tagsHTML}</div>
      <div class="task-card-footer">
        <div class="task-card-meta" style="margin:0">
          <span>📅 ${deadlineLabel}</span>
        </div>
        ${actionBtn}
      </div>
    </div>`;
}
