import request from 'supertest';
import app from '../src/app';
import mongoose from 'mongoose';

describe('HCF Backend API Tests', () => {
  beforeAll(async () => {
    // 连接测试数据库
    await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/hcf_test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });

  describe('Parameters API', () => {
    it('should get parameters list', async () => {
      const res = await request(app).get('/api/parameters');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Ranking API', () => {
    it('should get ranking list', async () => {
      const res = await request(app).get('/api/ranking/list');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Operational API', () => {
    it('should get analysis data', async () => {
      const res = await request(app).get('/api/operational/analysis');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
