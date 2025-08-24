import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 获取节点信息
router.get('/:nodeId', authMiddleware, async (req, res) => {
  try {
    const { nodeId } = req.params;
    // 这里应该实现获取节点信息的逻辑
    res.json({ success: true, message: '节点信息获取成功' });
  } catch (error: any) {
    res.status(500).json({ error: '获取节点信息失败' });
  }
});

export default router;
