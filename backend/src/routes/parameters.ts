import { Router } from 'express';
import { getParameters, updateParameter } from '../controllers/parametersController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

// 获取参数列表
router.get('/', authMiddleware, getParameters);

// 更新参数 (需要管理员权限)
router.put('/:key', adminMiddleware, updateParameter);

export default router;
