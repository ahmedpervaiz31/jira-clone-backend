import mongoose from 'mongoose';
import Board from './models/Board.model.js';
import Task from './models/Task.model.js';
import { generateRank } from './utils/lexorank.helper.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/jira-clone';
const STATUSES = ['to_do', 'in_progress', 'done'];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


// Large pool of meaningful task words for software projects
const TASK_WORDS = [
  'Implement', 'Fix', 'Refactor', 'Design', 'Document', 'Test', 'Deploy', 'Review', 'Optimize', 'Integrate',
  'Configure', 'Upgrade', 'Migrate', 'Remove', 'Add', 'Update', 'Validate', 'Monitor', 'Automate', 'Secure',
  'Research', 'Prototype', 'Debug', 'Analyze', 'Plan', 'Setup', 'Cleanup', 'Sync', 'Split', 'Merge',
  'Generate', 'Schedule', 'Enable', 'Disable', 'Patch', 'Audit', 'Benchmark', 'Scale', 'Localize', 'Translate',
  'Style', 'Lint', 'Format', 'Profile', 'Cache', 'Log', 'Authorize', 'Authenticate', 'Seed', 'Bootstrap',
  'Handle', 'Route', 'Queue', 'Stream', 'Compress', 'Encrypt', 'Decrypt', 'Validate', 'Sanitize', 'Render',
  'Paginate', 'Sort', 'Filter', 'Index', 'Snapshot', 'Archive', 'Restore', 'Backup', 'Purge', 'Notify',
  'Track', 'Visualize', 'Export', 'Import', 'Sync', 'Assign', 'Unassign', 'Invite', 'Remove', 'Block',
  'Unblock', 'Approve', 'Reject', 'Escalate', 'Defer', 'Prioritize', 'Estimate', 'Document', 'Summarize', 'Explain',
  'Map', 'Link', 'Unlink', 'Clone', 'Fork', 'Rebase', 'Cherry-pick', 'Tag', 'Release', 'Hotfix',
  'Onboard', 'Offboard', 'Train', 'Support', 'Demo', 'Present', 'Meet', 'Coordinate', 'Sync', 'Align'
];

const TASK_TOPICS = [
  'API', 'UI', 'Database', 'Auth', 'Notifications', 'Logging', 'Testing', 'Deployment', 'Docs', 'Performance',
  'Security', 'Frontend', 'Backend', 'Cache', 'Session', 'User', 'Board', 'Task', 'Email', 'Webhooks',
  'Mobile', 'Analytics', 'Integration', 'CI/CD', 'Monitoring', 'Error Handling', 'Permissions', 'Roles', 'Settings', 'Profile',
  'Search', 'Filter', 'Sort', 'Export', 'Import', 'Sync', 'Theme', 'Accessibility', 'Localization', 'SEO',
  'Scheduler', 'Queue', 'Rate Limiting', 'Billing', 'Subscription', 'Feedback', 'Chat', 'Bot', 'AI', 'ML'
];


// Track used task titles globally to avoid repeats
const USED_TASK_TITLES = new Set();
function randomTitle() {
  let tries = 0;
  let title;
  do {
    const verb = TASK_WORDS[randomInt(0, TASK_WORDS.length - 1)];
    const topic = TASK_TOPICS[randomInt(0, TASK_TOPICS.length - 1)];
    title = `${verb} ${topic}`;
    tries++;
    // If we run out of unique combos, allow repeats after 100 tries
    if (tries > 100) break;
  } while (USED_TASK_TITLES.has(title));
  USED_TASK_TITLES.add(title);
  return title;
}

// Generate a random due date within the next 90 days
function randomDueDate() {
  const now = new Date();
  const daysToAdd = randomInt(3, 90);
  const due = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  return due.toISOString().slice(0, 10);
}

// Example user pool
const USERNAMES = [
  'alice', 'bob', 'carol', 'dave', 'eve', 'frank', 'grace', 'heidi', 'ivan', 'judy',
  'mallory', 'oscar', 'peggy', 'trent', 'victor', 'wendy', 'zoe', 'sam', 'kim', 'leo'
];

const USER_PASSWORD = '123456';

async function ensureUsers() {
  const User = (await import('./models/User.model.js')).default;
  const users = await User.find();
  if (users.length < USERNAMES.length) {
    for (const username of USERNAMES) {
      if (!users.find(u => u.username === username)) {
        await User.create({ username, password: USER_PASSWORD });
      }
    }
  }
  return await User.find();
}

async function populate() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');


  await Board.deleteMany({});
  await Task.deleteMany({});

  // Ensure users exist
  const User = (await import('./models/User.model.js')).default;
  const allUsers = await ensureUsers();

  for (let b = 0; b < 40; b++) {
    // Board name: either '[FirstWord] [SecondWord]' or '[FirstWord]'
    const firstWord = TASK_TOPICS[randomInt(0, TASK_TOPICS.length - 1)];
    const useSecond = Math.random() < 0.6; // 60% chance to use two words
    let boardName = firstWord;
    if (useSecond) {
      let secondWord;
      do {
        secondWord = TASK_TOPICS[randomInt(0, TASK_TOPICS.length - 1)];
      } while (secondWord === firstWord);
      boardName = `${firstWord} ${secondWord}`;
    }
    const boardKey = `B${b + 1}`;
    // Randomly decide if board is public or private
    const isPrivate = Math.random() < 0.2; // ~20% private
    // Assign 2-5 random members if private, else 0-2 for public
    const numMembers = isPrivate ? randomInt(2, 5) : randomInt(0, 2);
    const memberUsers = [];
    const memberIndexes = new Set();
    while (memberUsers.length < numMembers) {
      const idx = randomInt(0, allUsers.length - 1);
      if (!memberIndexes.has(idx)) {
        memberIndexes.add(idx);
        memberUsers.push(allUsers[idx]._id);
      }
    }
    const board = new Board({
      name: boardName,
      key: boardKey,
      nextDisplayNumber: 1,
      tasks: [],
      members: memberUsers,
      flag: isPrivate ? 'private' : 'public'
    });
    await board.save();

    let displayNumber = 1;
    let lastOrder = {};
    for (const status of STATUSES) {
      lastOrder[status] = null;
    }

    const numTasks = randomInt(5, 10);
    for (let t = 0; t < numTasks; t++) {
      // Distribute tasks across statuses
      const status = STATUSES[t % STATUSES.length];
      const order = lastOrder[status] ? generateRank(lastOrder[status], null) : '0|h00000';
      lastOrder[status] = order;
      // Assign a real user to some tasks
      let assignedTo = '';
        const userIdx = randomInt(0, allUsers.length - 1);
        assignedTo = allUsers[userIdx].username;
      // Randomly assign dependencies (up to 2 previous tasks)
      let dependencies = [];
      if (t > 1 && Math.random() < 0.4) {
        const depCount = randomInt(1, Math.min(2, t));
        const depIndexes = new Set();
        while (depIndexes.size < depCount) {
          depIndexes.add(randomInt(0, t - 1));
        }
        dependencies = Array.from(depIndexes).map(i => board.tasks[i]);
      }
      const dueDate = randomDueDate();
      const task = new Task({
        title: randomTitle(),
        status,
        boardId: board._id,
        description: `Description for ${boardName} task ${t + 1}`,
        assignedTo,
        dueDate,
        order,
        displayId: `${boardKey}-${displayNumber}`,
        dependencies
      });
      await task.save();
      board.tasks.push(task._id);
      displayNumber++;
    }
    await board.save();
    console.log(`Created ${board.flag} ${boardName} with ${numTasks} tasks and ${memberUsers.length} members.`);
  }
  console.log('✅ Database population complete');
  await mongoose.disconnect();
}

populate().catch(err => {
  console.error('❌ Population error:', err);
  process.exit(1);
});