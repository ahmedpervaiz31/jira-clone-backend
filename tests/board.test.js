import request from 'supertest';
import { app } from '../server.js';
import Board from '../models/Board.model.js';
import User from '../models/User.model.js';
import Task from '../models/Task.model.js';
import { connect, disconnect, clearDatabase } from './test.helper.js';

let token;
let userId;

beforeAll(async () => {
  await connect();
  const userRes = await request(app)
    .post('/api/auth/register')
    .send({ username: 'boarduser', password: 'password123' });
  token = userRes.body.token;
  userId = userRes.body.user.id;
});
afterAll(async () => await disconnect());
afterEach(async () => await clearDatabase());

describe('Board Controller', () => {
  describe('POST /api/boards', () => {
    test('Should create a new board', async () => {
      const res = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Board', key: 'TB' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Board');
      expect(res.body).toHaveProperty('id');
    });

    test('Should fail if name is missing', async () => {
      const res = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: 'TB' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    test('Should fail if not authenticated', async () => {
      const res = await request(app)
        .post('/api/boards')
        .send({ name: 'No Auth Board', key: 'NA' });
      expect(res.status).toBe(401);
    });

    test('Should fail if name is not a string', async () => {
      const res = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 12345, key: 'NUM' });
      expect(res.status).toBe(400);
    });

    test('Should allow creating boards with duplicate keys (if allowed)', async () => {
      await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Board 1', key: 'DUP' });
      const res = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Board 2', key: 'DUP' });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/boards', () => {
    test('Should list all boards for the user', async () => {
      await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Board 1', key: 'B1' });
      await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Board 2', key: 'B2' });
      const res = await request(app)
        .get('/api/boards')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThanOrEqual(2);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('hasMore');
    });

    test('Should fail if not authenticated', async () => {
      const res = await request(app)
        .get('/api/boards');
      expect(res.status).toBe(401);
    });

    test('Should paginate results', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/boards')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: `Board ${i}`, key: `K${i}` });
      }
      const res = await request(app)
        .get('/api/boards?page=2&limit=2')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /api/boards/:id', () => {
    test('Should get a board by ID', async () => {
      const createRes = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Board By ID', key: 'BID' });
      const boardId = createRes.body.id;
      const res = await request(app)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Board By ID');
    });

    test('Should return 404 for non-existent board', async () => {
      const res = await request(app)
        .get('/api/boards/605c5f8b2f8fb814c89c9999')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    test('Should fail for invalid board ID', async () => {
      const res = await request(app)
        .get('/api/boards/invalidid')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    test('Should fail if not authenticated', async () => {
      const createRes = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'NoAuth Board', key: 'NAUTH' });
      const boardId = createRes.body.id;
      const res = await request(app)
        .get(`/api/boards/${boardId}`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/boards/search', () => {
    test('Should search boards by name or key', async () => {
      await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Alpha Board', key: 'ALPHA' });
      await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Beta Board', key: 'BETA' });
      const res = await request(app)
        .get('/api/boards/search?q=Alpha')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some(b => b.name === 'Alpha Board')).toBe(true);
    });

    test('Should return empty array if no match', async () => {
      const res = await request(app)
        .get('/api/boards/search?q=NoSuchBoard')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    test('Should fail if not authenticated', async () => {
      const res = await request(app)
        .get('/api/boards/search?q=Alpha');
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/boards/:id', () => {
    test('Should delete a board', async () => {
      const createRes = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Delete Board', key: 'DEL' });
      const boardId = createRes.body.id;
      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task on Board', status: 'todo', boardId });
      const res = await request(app)
        .delete(`/api/boards/${boardId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted/);

      const tasks = await Task.find({ boardId });
      expect(tasks.length).toBe(0);
    });

    test('Should return 404 if board does not exist', async () => {
      const res = await request(app)
        .delete('/api/boards/605c5f8b2f8fb814c89c9999')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    test('Should fail for invalid board ID', async () => {
      const res = await request(app)
        .delete('/api/boards/invalidid')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    test('Should fail if not authenticated', async () => {
      const createRes = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'NoAuth Delete', key: 'NADEL' });
      const boardId = createRes.body.id;
      const res = await request(app)
        .delete(`/api/boards/${boardId}`);
      expect(res.status).toBe(401);
    });
  });
});
