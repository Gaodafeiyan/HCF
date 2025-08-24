import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import User from '../models/User';
import Monitoring from '../models/Monitoring';

const router = Router();

// KYC验证
router.post('/kyc/verify', adminMiddleware, async (req, res) => {
  try {
    const { walletAddress, documentType, documentData, verifiedBy } = req.body;
    
    // 更新用户KYC状态
    await User.updateOne(
      { walletAddress: walletAddress.toLowerCase() },
      { 
        kycVerified: true,
        $set: { 
          'kyc.documentType': documentType,
          'kyc.verifiedAt': new Date(),
          'kyc.verifiedBy': verifiedBy
        }
      }
    );

    res.json({ 
      success: true, 
      message: 'KYC验证成功' 
    });
  } catch (error) {
    res.status(500).json({ error: 'KYC验证失败', details: error.message });
  }
});

// 数据分析
router.get('/analysis', adminMiddleware, async (req, res) => {
  try {
    // 用户统计
    const userStats = await User.aggregate([
      {
        $group: {
          _id: '$teamLevel',
          count: { $sum: 1 },
          totalStaking: { $sum: '$stakingAmount' },
          totalRewards: { $sum: '$totalRewards' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 活跃用户统计
    const activeUsers = await User.countDocuments({ isActive: true });
    const totalUsers = await User.countDocuments({});

    // 质押统计
    const stakingStats = await User.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalStaking: { $sum: '$stakingAmount' },
          avgStaking: { $avg: '$stakingAmount' },
          maxStaking: { $max: '$stakingAmount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        userStats,
        activeUsers,
        totalUsers,
        stakingStats: stakingStats[0] || {},
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ error: '数据分析失败', details: error.message });
  }
});

// 监控警报
router.get('/monitoring/alerts', adminMiddleware, async (req, res) => {
  try {
    const { level, resolved, limit = 50 } = req.query;
    
    const filter: any = {};
    if (level) filter.level = level;
    if (resolved !== undefined) filter.resolved = resolved === 'true';
    
    const alerts = await Monitoring.find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit as string));
    
    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    res.status(500).json({ error: '获取监控警报失败', details: error.message });
  }
});

export default router;
