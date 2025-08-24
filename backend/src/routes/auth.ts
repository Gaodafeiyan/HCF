import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

const router = Router();

// 用户登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 临时管理员账户（实际应从数据库验证）
    if (username === 'admin' && password === 'admin123') {
      // 生成JWT令牌
      const token = jwt.sign(
        { 
          username: 'admin',
          role: 'admin',
          teamLevel: 'V6'
        },
        process.env.JWT_SECRET || 'hcf_defi_jwt_secret_key_2025',
        { expiresIn: '24h' }
      );
      
      res.json({
        success: true,
        token,
        user: {
          username: 'admin',
          role: 'admin',
          teamLevel: 'V6'
        }
      });
    } else {
      res.status(401).json({
        success: false,
        error: '用户名或密码错误'
      });
    }
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: '登录失败', 
      details: error.message 
    });
  }
});

// 用户注册（仅限管理员创建新管理员）
router.post('/register', async (req, res) => {
  try {
    const { walletAddress, username, password, teamLevel } = req.body;
    
    // 这里应该添加权限检查，确保只有管理员可以创建新管理员
    
    // 创建新用户
    const newUser = new User({
      walletAddress: walletAddress.toLowerCase(),
      username,
      password, // 实际应该加密存储
      teamLevel: teamLevel || 'V1',
      isActive: true,
      kycVerified: true
    });
    
    await newUser.save();
    
    res.json({
      success: true,
      message: '用户创建成功',
      user: {
        walletAddress: newUser.walletAddress,
        username: newUser.username,
        teamLevel: newUser.teamLevel
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: '注册失败', 
      details: error.message 
    });
  }
});

// 验证令牌
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: '令牌缺失'
      });
    }
    
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'hcf_defi_jwt_secret_key_2025'
    );
    
    res.json({
      success: true,
      user: decoded
    });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: '令牌无效或已过期'
    });
  }
});

export default router;
