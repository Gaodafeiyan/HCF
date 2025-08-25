import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

// 用户登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: '用户名和密码是必需的'
      });
    }

    // 从数据库查找用户
    const user = await User.findOne({ username }).select('+password');
    
    if (!user) {
      // 如果是第一次登录且是默认管理员，创建账户
      if (username === 'admin' && password === 'admin123') {
        const hashedPassword = await bcrypt.hash(password, 10);
        const adminUser = new User({
          username: 'admin',
          password: hashedPassword,
          role: 'admin',
          teamLevel: 'V6',
          walletAddress: '0x' + '0'.repeat(40), // 默认地址
          isActive: true,
          kycVerified: true
        });
        await adminUser.save();
        
        // 生成JWT令牌
        const token = jwt.sign(
          { 
            id: adminUser._id,
            username: adminUser.username,
            role: adminUser.role,
            teamLevel: adminUser.teamLevel
          },
          process.env.JWT_SECRET || 'hcf_defi_jwt_secret_key_2025',
          { expiresIn: '24h' }
        );
        
        return res.json({
          success: true,
          token,
          user: {
            username: adminUser.username,
            role: adminUser.role,
            teamLevel: adminUser.teamLevel
          }
        });
      }
      
      return res.status(401).json({
        success: false,
        error: '用户名或密码错误'
      });
    }
    
    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password || '');
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: '用户名或密码错误'
      });
    }
    
    // 更新最后登录时间
    user.lastLogin = new Date();
    await user.save();
    
    // 生成JWT令牌
    const token = jwt.sign(
      { 
        id: user._id,
        username: user.username,
        role: user.role || 'operator',
        teamLevel: user.teamLevel
      },
      process.env.JWT_SECRET || 'hcf_defi_jwt_secret_key_2025',
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        role: user.role || 'operator',
        teamLevel: user.teamLevel
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      error: '登录失败', 
      details: error.message 
    });
  }
});

// 用户注册（需要管理员权限和邀请码）
router.post('/register', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { walletAddress, username, password, role = 'operator', teamLevel = 'V1' } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: '用户名和密码是必需的'
      });
    }
    
    // 检查用户名是否已存在
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: '用户名已存在'
      });
    }
    
    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 创建新用户
    const newUser = new User({
      walletAddress: walletAddress?.toLowerCase() || '0x' + '0'.repeat(40),
      username,
      password: hashedPassword,
      role, // admin, operator, viewer
      teamLevel,
      isActive: true,
      kycVerified: false,
      createdAt: new Date()
    });
    
    await newUser.save();
    
    res.json({
      success: true,
      message: '用户创建成功',
      user: {
        username: newUser.username,
        role: newUser.role,
        teamLevel: newUser.teamLevel
      }
    });
  } catch (error: any) {
    console.error('Register error:', error);
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
    ) as any;
    
    res.json({
      success: true,
      user: {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role,
        teamLevel: decoded.teamLevel
      }
    });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: '令牌无效或已过期'
    });
  }
});

// 修改密码
router.post('/change-password', authMiddleware, async (req: any, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: '请提供旧密码和新密码'
      });
    }
    
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }
    
    // 验证旧密码
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password || '');
    if (!isOldPasswordValid) {
      return res.status(401).json({
        success: false,
        error: '旧密码错误'
      });
    }
    
    // 更新密码
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    
    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: '密码修改失败',
      details: error.message
    });
  }
});

// 获取当前用户信息
router.get('/me', authMiddleware, async (req: any, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        walletAddress: user.walletAddress,
        role: user.role,
        teamLevel: user.teamLevel,
        isActive: user.isActive,
        kycVerified: user.kycVerified,
        lastLogin: user.lastLogin
      }
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: '获取用户信息失败',
      details: error.message
    });
  }
});

export default router;