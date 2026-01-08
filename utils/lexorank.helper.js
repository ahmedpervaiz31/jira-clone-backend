import Task from '../models/Task.model.js';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = ALPHABET.length;

const DELIMITER = '|';
const DEFAULT_BUCKET = '0';

const MIN_CHAR = ALPHABET[0];
const MAX_CHAR = ALPHABET[BASE - 1];

const REBALANCE_THRESHOLD = 32; 

const charToVal = (c) => ALPHABET.indexOf(c);
const valToChar = (v) => ALPHABET[v];

export const compareStrings = (a, b) => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

function nextBucket(bucket) {
  return (parseInt(bucket, 10) + 1).toString();
}

export const parseRank = (full) => {
  if (!full) return { bucket: DEFAULT_BUCKET, rank: '' };

  const [bucket, rank] = full.split(DELIMITER);
  if (rank === undefined) {
    return { bucket: DEFAULT_BUCKET, rank: bucket };
  }

  return { bucket, rank };
};

const formatRank = (bucket, rank) => `${bucket}${DELIMITER}${rank}`;

function between(prev = '', next = '') {
  let result = '';
  let i = 0;

  while (true) {
    const prevVal = i < prev.length ? charToVal(prev[i]) : 0;
    const nextVal = i < next.length ? charToVal(next[i]) : BASE - 1;

    if (nextVal - prevVal > 1) {
      const mid = Math.floor((prevVal + nextVal) / 2);
      result += valToChar(mid);
      return result;
    }
    result += valToChar(prevVal);
    i++;
  }
}

export function generateRank(prevFull, nextFull) {
  const p = parseRank(prevFull);
  const n = parseRank(nextFull);
  
  let bucket =
    p.rank && n.rank ? p.bucket :
    p.rank ? p.bucket :
    n.rank ? n.bucket :
    DEFAULT_BUCKET;

  if (!p.rank && !n.rank) {
    return formatRank(bucket, 'h');
  }

  const newRank = between(p.rank, n.rank);
  return formatRank(bucket, newRank);
}

export async function rebalanceBoard(boardId) {
  const tasks = await Task.find({ boardId }).sort({ order: 1 });
  if (!tasks.length) return;

  const currentBucket = parseRank(tasks[0].order).bucket;
  const newBucket = nextBucket(currentBucket);

  const base = ALPHABET.length;
  const step = Math.floor(Math.pow(base, 8) / (tasks.length + 1));

  const updates = tasks.map((task, i) => {
    const val = step * (i + 1);
    const rank = val.toString(base);
    return {
      updateOne: {
        filter: { _id: task._id },
        update: { order: formatRank(newBucket, rank) }
      }
    };
  });

  await Task.bulkWrite(updates);
}

export const shouldRebalance = (tasks) =>
  tasks.some(t => parseRank(t.order).rank.length > REBALANCE_THRESHOLD);
