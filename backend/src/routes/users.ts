import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 获取用户信息
router.get('/:walletAddress', authMiddleware, async (req, res) => {
  try {
    const { walletAddress } = req.params;
    // 这里应该实现获取用户信息的逻辑
    res.json({ success: true, message: '用户信息获取成功' });
  } catch (error: any) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

export default router;
