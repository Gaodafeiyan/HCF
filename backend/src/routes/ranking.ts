import { Router } from 'express';
import { getPersonalRanking, getRankingList } from '../controllers/rankingController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 获取个人排名
router.get('/personal/:walletAddress', authMiddleware, getPersonalRanking);

// 获取排名列表
router.get('/list', authMiddleware, getRankingList);

export default router;
