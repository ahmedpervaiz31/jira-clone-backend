import request from 'supertest';
import { app } from '../server.js';
import User from '../models/User.model.js';
import { connect, disconnect, clearDatabase } from './test.helper.js';

beforeAll(async () => await connect());
afterAll(async () => await disconnect());
afterEach(async () => await clearDatabase());

describe('Auth Controller & Middleware', () => {
  const mockUser = {
    username: 'testuser',
    password: 'password123'
  };

  describe('POST /api/auth/register', () => {
    test('Should register a new user and return a token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(mockUser);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.username).toBe(mockUser.username);
      expect(res.body.user).not.toHaveProperty('password');
    });

    test('Should fail if username already exists', async () => {
      await User.create(mockUser);
      const res = await request(app)
        .post('/api/auth/register')
        .send(mockUser);
      expect(res.status).toBe(409); 
      expect(res.body.error).toBeDefined();
    });

    test('Should fail if username or password is missing', async () => {
      let res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'useronly' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();

      res = await request(app)
        .post('/api/auth/register')
        .send({ password: 'passonly' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    test('Should fail if username or password is not a string', async () => {
      let res = await request(app)
        .post('/api/auth/register')
        .send({ username: 123, password: 'pass' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();

      res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'user', password: {} });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    test('Should login and return a token for valid credentials', async () => {
      await request(app).post('/api/auth/register').send(mockUser);

      const res = await request(app)
        .post('/api/auth/login')
        .send(mockUser);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
    });

    test('Should reject invalid passwords', async () => {
      await request(app).post('/api/auth/register').send(mockUser);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: mockUser.username, password: 'wrongpassword' });
      expect(res.status).toBe(401); 
    });

    test('Should fail if username or password is missing', async () => {
      let res = await request(app)
        .post('/api/auth/login')
        .send({ username: mockUser.username });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();

      res = await request(app)
        .post('/api/auth/login')
        .send({ password: mockUser.password });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    test('Should fail if username or password is not a string', async () => {
      let res = await request(app)
        .post('/api/auth/login')
        .send({ username: 123, password: 'pass' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();

      res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'user', password: {} });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  
  describe('GET /api/protected', () => {
    test('Should deny access to protected routes without a token', async () => {
      const res = await request(app).get('/api/protected');
      expect(res.status).toBe(401); 
    });

    test('Should allow access with a valid token', async () => {
      const registerRes = await request(app).post('/api/auth/register').send(mockUser);
      const token = registerRes.body.token;

      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe(mockUser.username);
    });
  });

  describe('GET /api/auth/me', () => {
    test('Should deny access if not authenticated', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    test('Should return user info if authenticated', async () => {
      const registerRes = await request(app).post('/api/auth/register').send(mockUser);
      const token = registerRes.body.token;
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe(mockUser.username);
      expect(res.body.user).not.toHaveProperty('password');
    });
  });
});