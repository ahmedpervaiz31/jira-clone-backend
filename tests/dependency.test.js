import request from 'supertest';
import { app } from '../server.js';
import { connect, disconnect, clearDatabase } from './test.helper.js';

let token;

beforeAll(async () => {
  await connect();
  const userRes = await request(app)
    .post('/api/auth/register')
    .send({ username: 'depuser', password: 'password123' });
  token = userRes.body.token;
});
afterAll(async () => await disconnect());
afterEach(async () => await clearDatabase());

describe('Dependency Controller', () => {
  describe('Edge Case: Cross-board dependency', () => {
    test('Should not allow adding a dependency from a different board', async () => {
      const boardARes = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Board A', key: 'BA' });
      const boardBRes = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Board B', key: 'BB' });
      const boardA = boardARes.body;
      const boardB = boardBRes.body;
      const taskARes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task in A', status: 'to_do', boardId: boardA.id, order: '1' });
      const taskBRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task in B', status: 'to_do', boardId: boardB.id, order: '1' });
      const taskA = taskARes.body;
      const taskB = taskBRes.body;
      const res = await request(app)
        .post(`/api/tasks/${taskA.id}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependencies: [taskB.id] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });
  describe('Edge Case: Deleting a dependency task', () => {
    test('Should remove deleted task from dependencies array of dependent tasks', async () => {
      const boardRes = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Dep Board X', key: 'DBX' });
      const depBoardId = boardRes.body.id;

      const resX = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task X', status: 'to_do', boardId: depBoardId, order: '1' });
      const resY = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task Y', status: 'to_do', boardId: depBoardId, order: '2' });
      const taskX = resX.body;
      const taskY = resY.body;
      await request(app)
        .post(`/api/tasks/${taskX.id}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependencies: [taskY.id] });
      await request(app)
        .delete(`/api/tasks/${taskY.id}`)
        .set('Authorization', `Bearer ${token}`);
      const resXAfter = await request(app)
        .get(`/api/tasks/${taskX.id}`)
        .set('Authorization', `Bearer ${token}`);
      console.log('DEBUG dependencies:', resXAfter.body.dependencies);
      expect(Array.isArray(resXAfter.body.dependencies)).toBe(true);
      expect(resXAfter.body.dependencies).not.toContain(taskY.id);
    });
  });
  let taskA, taskB, taskC;
  let defaultBoardId;

  beforeEach(async () => {
    const boardRes = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dep Board', key: 'DB' });
    defaultBoardId = boardRes.body.id;

    const resA = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task A', status: 'to_do', boardId: defaultBoardId, order: '1' });
    const resB = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task B', status: 'to_do', boardId: defaultBoardId, order: '2' });
    const resC = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task C', status: 'to_do', boardId: defaultBoardId, order: '3' });
    taskA = resA.body;
    taskB = resB.body;
    taskC = resC.body;
  });

  describe('POST /api/tasks/:id/dependencies', () => {
    test('Should fail if dependencies is not an array', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskA.id}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependencies: 'not-an-array' });
      expect(res.status).toBe(400);
    });

    test('Should fail if dependencies array is empty', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskA.id}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependencies: [] });
      expect(res.status).toBe(400);
    });

    test('Should fail if task does not exist', async () => {
      const res = await request(app)
        .post('/api/tasks/605c5f8b2f8fb814c89c9999/dependencies')
        .set('Authorization', `Bearer ${token}`)
        .send({ dependencies: [taskB.id] });
      expect(res.status).toBe(404);
    });

    test('Should fail if dependencies are invalid', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskA.id}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependencies: ['605c5f8b2f8fb814c89c9999'] });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/tasks/:id/dependencies/:depId', () => {
    test('Should fail if dependency not found on task', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${taskA.id}/dependencies/${taskB.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    test('Should fail if task does not exist', async () => {
      const res = await request(app)
        .delete(`/api/tasks/605c5f8b2f8fb814c89c9999/dependencies/${taskB.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });
});
