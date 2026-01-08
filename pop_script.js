// Script to populate the database with sample boards and tasks
import mongoose from 'mongoose';
import Board from './models/Board.model.js';
import Task from './models/Task.model.js';
import { generateRank } from './utils/lexorank.helper.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/jira-clone';
const STATUSES = ['to_do', 'in_progress', 'done'];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomTitle() {
  const words = ['Fix', 'Update', 'Refactor', 'Test', 'Deploy', 'Design', 'Review', 'Document', 'Plan', 'Discuss'];
  return words[randomInt(0, words.length - 1)] + ' ' + Math.random().toString(36).substring(2, 7);
}

async function populate() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // Remove existing boards and tasks for a clean slate
  await Board.deleteMany({});
  await Task.deleteMany({});

  for (let b = 0; b < 40; b++) {
    const boardName = `Board ${b + 1}`;
    const boardKey = `B${b + 1}`;
    const board = new Board({
      name: boardName,
      key: boardKey,
      nextDisplayNumber: 1,
      tasks: []
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
      const task = new Task({
        title: randomTitle(),
        status,
        boardId: board._id,
        description: `Description for ${boardName} task ${t + 1}`,
        assignedTo: '',
        dueDate: null,
        order,
        displayId: `${boardKey}-${displayNumber}`,
        dependencies: []
      });
      await task.save();
      board.tasks.push(task._id);
      displayNumber++;
    }
    await board.save();
    console.log(`Created ${boardName} with ${numTasks} tasks.`);
  }
  console.log('✅ Database population complete');
  await mongoose.disconnect();
}

populate().catch(err => {
  console.error('❌ Population error:', err);
  process.exit(1);
});
