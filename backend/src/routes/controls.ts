import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 获取控制状态
router.get('/status', authMiddleware, async (req, res) => {
  try {
    // 这里应该实现获取控制状态的逻辑
    res.json({ success: true, message: '控制状态获取成功' });
  } catch (error) {
    res.status(500).json({ error: '获取控制状态失败' });
  }
});

export default router;
