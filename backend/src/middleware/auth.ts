import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

export interface AuthRequest extends Request {
  user?: any;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: '访问令牌缺失' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    const user = await User.findOne({ walletAddress: decoded.walletAddress });

    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: '无效的访问令牌' });
  }
};

export const adminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await authMiddleware(req, res, () => {});
    
    if (!req.user || req.user.teamLevel !== 'V6') {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    
    next();
  } catch (error) {
    res.status(403).json({ error: '权限验证失败' });
  }
};
