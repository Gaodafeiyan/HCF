import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import User from '../models/User';
import Monitoring from '../models/Monitoring';

const router = Router();

// 仪表盘数据
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    // 用户统计
    const totalUsers = await User.countDocuments({});
    const activeUsers = await User.countDocuments({ isActive: true });
    const kycVerifiedUsers = await User.countDocuments({ kycVerified: true });
    
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
    
    // 节点统计（模拟数据，实际需要从合约获取）
    const nodeStats = {
      activeNodes: Math.floor(Math.random() * 20) + 80, // 80-99
      maxNodes: 99,
      onlineRate: (Math.random() * 5 + 95).toFixed(1) // 95-100%
    };
    
    // 每日交易量（模拟数据）
    const dailyVolume = Math.floor(Math.random() * 500000) + 100000; // 100k-600k
    
    // 最近警报数量
    const alertCount = await Monitoring.countDocuments({ 
      resolved: false,
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        kycVerifiedUsers,
        totalStaking: stakingStats[0]?.totalStaking || 0,
        avgStaking: stakingStats[0]?.avgStaking || 0,
        maxStaking: stakingStats[0]?.maxStaking || 0,
        activeNodes: nodeStats.activeNodes,
        maxNodes: nodeStats.maxNodes,
        onlineRate: nodeStats.onlineRate,
        dailyVolume,
        alertCount,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      success: false,
      error: '获取仪表盘数据失败', 
      details: error.message 
    });
  }
});

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
  } catch (error: any) {
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
  } catch (error: any) {
    res.status(500).json({ error: '数据分析失败', details: error.message });
  }
});

// 监控警报列表
router.get('/monitoring/alerts', authMiddleware, async (req, res) => {
  try {
    const { level, resolved, type, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    const filter: any = {};
    if (level) filter.level = level;
    if (resolved !== undefined) filter.resolved = resolved === 'true';
    if (type) filter.type = type;
    
    const alerts = await Monitoring.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit as string));
    
    const total = await Monitoring.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        alerts,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: '获取监控警报失败', 
      details: error.message 
    });
  }
});

// 监控统计
router.get('/monitoring/stats', authMiddleware, async (req, res) => {
  try {
    // 按级别统计
    const levelStats = await Monitoring.aggregate([
      {
        $group: {
          _id: '$level',
          count: { $sum: 1 },
          unresolved: { 
            $sum: { $cond: [{ $eq: ['$resolved', false] }, 1, 0] } 
          }
        }
      }
    ]);
    
    // 按类型统计
    const typeStats = await Monitoring.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          unresolved: { 
            $sum: { $cond: [{ $eq: ['$resolved', false] }, 1, 0] } 
          }
        }
      }
    ]);
    
    // 最近24小时新增警报
    const recent24h = await Monitoring.countDocuments({
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    // 未处理警报总数
    const totalUnresolved = await Monitoring.countDocuments({ resolved: false });
    
    // 系统健康状态
    const criticalAlerts = await Monitoring.countDocuments({ 
      level: 'red', 
      resolved: false 
    });
    
    const systemStatus = criticalAlerts > 0 ? 'critical' : 
                        totalUnresolved > 10 ? 'warning' : 'healthy';
    
    res.json({
      success: true,
      data: {
        overview: {
          totalUnresolved,
          recent24h,
          systemStatus,
          criticalAlerts
        },
        levelStats,
        typeStats,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: '获取监控统计失败', 
      details: error.message 
    });
  }
});

// 处理警报
router.post('/monitoring/alerts/:alertId/resolve', operatorMiddleware, async (req: any, res) => {
  try {
    const { alertId } = req.params;
    const { actionTaken } = req.body;
    const operatorName = req.user.username;
    
    const alert = await Monitoring.findById(alertId);
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: '警报不存在'
      });
    }
    
    if (alert.resolved) {
      return res.status(400).json({
        success: false,
        error: '警报已处理'
      });
    }
    
    alert.resolved = true;
    alert.resolvedBy = operatorName;
    alert.resolvedAt = new Date();
    if (actionTaken) {
      alert.actionTaken = actionTaken;
    }
    
    await alert.save();
    
    res.json({
      success: true,
      message: '警报已处理',
      data: alert
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: '处理警报失败', 
      details: error.message 
    });
  }
});

// 创建测试警报（仅管理员）
router.post('/monitoring/alerts/test', adminMiddleware, async (req: any, res) => {
  try {
    const { type, level, title, message } = req.body;
    
    const testAlert = new Monitoring({
      type: type || 'system_alert',
      level: level || 'yellow',
      title: title || '测试警报',
      message: message || '这是一个测试警报，用于验证监控系统功能',
      data: {
        createdBy: req.user.username,
        isTest: true
      }
    });
    
    await testAlert.save();
    
    res.json({
      success: true,
      message: '测试警报已创建',
      data: testAlert
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: '创建测试警报失败', 
      details: error.message 
    });
  }
});

export default router;
