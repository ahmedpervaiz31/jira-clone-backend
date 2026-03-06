import request from 'supertest';
import { app } from '../server.js';
import { connect, disconnect, clearDatabase } from './test.helper.js';
import Task from '../models/Task.model.js';
import { jest } from '@jest/globals'; let token;
let boardId;

beforeAll(async () => {
  await connect();
  const userRes = await request(app)
    .post('/api/auth/register')
    .send({ username: 'taskuser', password: 'password123' });
  token = userRes.body.token;
  const boardRes = await request(app)
    .post('/api/boards')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Task Board', key: 'TB' });
  boardId = boardRes.body.id;
});
afterAll(async () => await disconnect());
afterEach(async () => await clearDatabase());

describe('Task Controller Edge Cases', () => {
  let taskId;
  beforeEach(async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Edge Task', status: 'todo', boardId });
    taskId = res.body.id;
  });

  describe('POST /api/tasks', () => {
    test('Should fail if required fields are missing', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'No Status', boardId });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    test('Should fail if not authenticated', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'No Auth', status: 'todo', boardId });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/tasks', () => {
    test('Should fail for invalid filter', async () => {
      const res = await request(app)
        .get('/api/tasks?limit=notanumber')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });
    test('Should fail if not authenticated', async () => {
      const res = await request(app)
        .get('/api/tasks');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/tasks/:id', () => {
    test('Should fail for invalid task id', async () => {
      const res = await request(app)
        .put('/api/tasks/invalidid')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Update' });
      expect(res.status).toBe(400);
    });
    test('Should fail if not authenticated', async () => {
      const res = await request(app)
        .put(`/api/tasks/${taskId}`)
        .send({ title: 'Update' });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    test('Should fail for invalid task id', async () => {
      const res = await request(app)
        .delete('/api/tasks/invalidid')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });
    test('Should fail if not authenticated', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${taskId}`);
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/tasks/:id/move', () => {
    test('Should fail for invalid task id', async () => {
      const res = await request(app)
        .put('/api/tasks/invalidid/move')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'done' });
      expect(res.status).toBe(400);
    });
    test('Should fail if not authenticated', async () => {
      const res = await request(app)
        .put(`/api/tasks/${taskId}/move`)
        .send({ status: 'done' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/tasks/:id', () => {
    test('Should return 404 for non-existent task', async () => {
      const res = await request(app)
        .get('/api/tasks/605c5f8b2f8fb814c89c9999')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
    test('Should fail for invalid task id', async () => {
      const res = await request(app)
        .get('/api/tasks/invalidid')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });
    test('Should fail if not authenticated', async () => {
      const res = await request(app)
        .get(`/api/tasks/${taskId}`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/tasks/batch', () => {
    test('Should fail if ids is not an array', async () => {
      const res = await request(app)
        .post('/api/tasks/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: 'notanarray' });
      expect(res.status).toBe(400);
    });
    test('Should fail if ids array is empty', async () => {
      const res = await request(app)
        .post('/api/tasks/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [] });
      expect(res.status).toBe(400);
    });
    test('Should fail if not authenticated', async () => {
      const res = await request(app)
        .post('/api/tasks/batch')
        .send({ ids: [taskId] });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/tasks/search', () => {
    test('Should return empty array if no match', async () => {
      const res = await request(app)
        .get(`/api/tasks/search?q=NoSuchTask&boardId=${boardId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
    test('Should fail if not authenticated', async () => {
      const res = await request(app)
        .get(`/api/tasks/search?q=Edge&boardId=${boardId}`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/tasks/assigned/:userId', () => {
    test('Should fail if username param is missing', async () => {
      const res = await request(app)
        .get('/api/tasks/assigned/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
    test('Should fail if not authenticated', async () => {
      const res = await request(app)
        .get('/api/tasks/assigned/taskuser');
      expect(res.status).toBe(401);
    });
  });
});
