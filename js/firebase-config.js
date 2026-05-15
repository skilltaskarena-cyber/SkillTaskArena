/**
 * ═══════════════════════════════════════════
 * CAMPUSFREELANCE — FIREBASE CONFIG
 * ═══════════════════════════════════════════
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://console.firebase.google.com
 * 2. Create a new project named "campusfreelance"
 * 3. Enable Authentication (Email/Password)
 * 4. Create a Firestore Database (start in test mode)
 * 5. Replace the config values below with your own
 * 6. Deploy Firestore Security Rules from README
 */

 const firebaseConfig = {
    apiKey: "AIzaSyDANmJLVYRH1KGa6cX1Pxc5EBnZ6oWNj2A",
    authDomain: "collegefreelance.firebaseapp.com",
    projectId: "collegefreelance",
    storageBucket: "collegefreelance.firebasestorage.app",
    messagingSenderId: "970084861457",
    appId: "1:970084861457:web:8607732262d6a66b2bd3b0"
  };

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Exports (available globally)
const auth = firebase.auth();
const db   = firebase.firestore();

// Firestore settings
db.settings({ ignoreUndefinedProperties: true });

// ─── COLLECTION REFS ──────────────────────────────────
const USERS         = () => db.collection('users');
const TASKS         = () => db.collection('tasks');
const APPLICATIONS  = () => db.collection('applications');
const NOTIFICATIONS = () => db.collection('notifications');
const TRANSACTIONS  = () => db.collection('transactions');
const AUDIT_LOGS    = () => db.collection('auditLogs');
const POST_REQUESTS = () => db.collection('postRequests');
const DISPUTES      = () => db.collection('disputes');
const DIRECT_REQ    = () => db.collection('directRequests');
const EVENT_APPS    = () => db.collection('eventApplications');
const EVENT_INVITES = () => db.collection('eventInvites');
const RATINGS       = () => db.collection('ratings');

// ─── ROLE CONSTANTS ───────────────────────────────────
const ROLES = {
  STUDENT:          'student',
  TEACHING_STAFF:   'teaching_staff',
  NONTEACHING_STAFF:'nonteaching_staff',
  EXTERNAL:         'external',
  ADMIN:            'admin',
  SUPER_ADMIN:      'super_admin'
};

// Roles that can post tasks without approval
const AUTO_POST_ROLES = [
  ROLES.TEACHING_STAFF,
  ROLES.NONTEACHING_STAFF,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN
];

// Roles that can create event tasks
const EVENT_CREATOR_ROLES = [
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN
];

// ─── STARTER CREDITS BY ROLE ──────────────────────────
const STARTER_CREDITS = {
  [ROLES.STUDENT]:           100,
  [ROLES.TEACHING_STAFF]:    200,
  [ROLES.NONTEACHING_STAFF]: 150,
  [ROLES.EXTERNAL]:           50,
  [ROLES.ADMIN]:               0,
  [ROLES.SUPER_ADMIN]:         0
};

// ─── TASK STATUS ──────────────────────────────────────
const TASK_STATUS = {
  OPEN:       'open',
  IN_PROGRESS:'in_progress',
  REVIEW:     'review',
  COMPLETED:  'completed',
  DISPUTED:   'disputed',
  CANCELLED:  'cancelled'
};

// ─── ROLE DISPLAY INFO ────────────────────────────────
const ROLE_INFO = {
  student:           { label: 'Student',            icon: '🎓', color: 'blue'   },
  teaching_staff:    { label: 'Teaching Staff',      icon: '👨‍🏫', color: 'green'  },
  nonteaching_staff: { label: 'Non-Teaching Staff',  icon: '🏢', color: 'purple' },
  external:          { label: 'External User',       icon: '🌐', color: 'yellow' },
  admin:             { label: 'Admin',               icon: '🛡️', color: 'red'    },
  super_admin:       { label: 'Super Admin',         icon: '👑', color: 'orange' }
};
