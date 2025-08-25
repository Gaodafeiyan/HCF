import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { ethers } from 'ethers';

// 路由导入
import authRouter from './routes/auth';
import parametersRouter from './routes/parameters';
import rankingRouter from './routes/ranking';
import usersRouter from './routes/users';
import nodesRouter from './routes/nodes';
import controlsRouter from './routes/controls';
import monitoringRouter from './routes/monitoring';
import operationalRouter from './routes/operational';
// import kycRouter from './routes/kyc'; // KYC功能已移除，保持去中心化
import adminRouter from '../admin';

// 控制器导入
import { recalculateAllRankings } from './controllers/rankingController';
import { updateDecayRates } from './controllers/parametersController';

dotenv.config();

const app = express();

// 配置信任代理 - 修复rate-limit错误
app.set('trust proxy', true);

// 中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcElem: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 静态文件服务 - 用于访问上传的文档
app.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// 限流配置
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 限制每个IP 15分钟内最多100个请求
  message: '请求过于频繁，请稍后再试'
});
app.use('/api/', limiter);

// 数据库连接
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hcf_defi')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// BSC连接
const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC || 'https://bsc-dataseed1.binance.org/');
console.log('✅ BSC Provider connected');

// 路由
app.use('/api/auth', authRouter);
app.use('/api/parameters', parametersRouter);
app.use('/api/ranking', rankingRouter);
app.use('/api/users', usersRouter);
app.use('/api/nodes', nodesRouter);
app.use('/api/controls', controlsRouter);
app.use('/api/monitoring', monitoringRouter);
app.use('/api/operational', operationalRouter);
// app.use('/api/kyc', kycRouter); // KYC功能已移除，保持去中心化
app.use('/admin', adminRouter);

// 定时任务 - 串联所有机制
cron.schedule('0 0 * * *', async () => {
  console.log('🕐 执行每日定时任务...');
  try {
    await recalculateAllRankings(); // 重算排名
    await updateDecayRates(); // 更新衰减率
    console.log('✅ 每日任务完成');
  } catch (error) {
    console.error('❌ 每日任务失败:', error);
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      bsc: provider ? 'connected' : 'disconnected'
    }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 HCF Backend running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

export default app;
