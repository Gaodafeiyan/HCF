import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 获取监控状态
router.get('/status', authMiddleware, async (req, res) => {
  try {
    // 这里应该实现获取监控状态的逻辑
    res.json({ success: true, message: '监控状态获取成功' });
  } catch (error) {
    res.status(500).json({ error: '获取监控状态失败' });
  }
});

export default router;
