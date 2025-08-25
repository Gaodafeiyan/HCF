import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

// 扩展Request接口
export interface AuthRequest extends Request {
  user?: any;
}

// JWT认证中间件
export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: '请先登录'
      });
    }
    
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'hcf_defi_jwt_secret_key_2025'
    ) as any;
    
    // 从数据库获取最新用户信息
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: '用户不存在或已被禁用'
      });
    }
    
    // 检查账户是否被锁定
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({
        success: false,
        error: '账户已被锁定，请稍后重试'
      });
    }
    
    req.user = {
      id: user._id,
      username: user.username,
      walletAddress: user.walletAddress,
      role: user.role,
      teamLevel: user.teamLevel
    };
    
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: '登录已过期，请重新登录'
      });
    }
    
    return res.status(401).json({
      success: false,
      error: '认证失败'
    });
  }
};

// 管理员权限中间件
export const adminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '请先登录'
    });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: '权限不足，需要管理员权限'
    });
  }
  
  next();
};

// 操作员权限中间件（管理员和操作员都可以）
export const operatorMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '请先登录'
    });
  }
  
  if (req.user.role !== 'admin' && req.user.role !== 'operator') {
    return res.status(403).json({
      success: false,
      error: '权限不足，需要操作员或管理员权限'
    });
  }
  
  next();
};

// 团队等级权限中间件
export const teamLevelMiddleware = (requiredLevel: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: '请先登录'
      });
    }
    
    const levelOrder = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
    const userLevelIndex = levelOrder.indexOf(req.user.teamLevel);
    const requiredLevelIndex = levelOrder.indexOf(requiredLevel);
    
    if (userLevelIndex < requiredLevelIndex) {
      return res.status(403).json({
        success: false,
        error: `权限不足，需要${requiredLevel}或更高团队等级`
      });
    }
    
    next();
  };
};

// KYC验证中间件
export const kycRequiredMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '请先登录'
      });
  }
  
  const user = await User.findById(req.user.id);
  
  if (!user?.kycVerified) {
    return res.status(403).json({
      success: false,
      error: '请先完成KYC认证'
    });
  }
  
  next();
};

// 请求限流中间件（防止暴力破解）
export const loginRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const { username } = req.body;
  
  if (!username) {
    return next();
  }
  
  const user = await User.findOne({ username });
  
  if (user) {
    // 检查是否被锁定
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingTime = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000 / 60);
      return res.status(423).json({
        success: false,
        error: `账户已被锁定，请${remainingTime}分钟后重试`
      });
    }
    
    // 如果登录失败次数过多，锁定账户
    if (user.loginAttempts && user.loginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 锁定30分钟
      await user.save();
      
      return res.status(423).json({
        success: false,
        error: '登录失败次数过多，账户已被锁定30分钟'
      });
    }
  }
  
  next();
};

export default {
  authMiddleware,
  adminMiddleware,
  operatorMiddleware,
  teamLevelMiddleware,
  kycRequiredMiddleware,
  loginRateLimiter
};