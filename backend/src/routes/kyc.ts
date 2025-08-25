import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware, adminMiddleware, operatorMiddleware } from '../middleware/auth';
import User from '../models/User';

const router = Router();

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/kyc');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `kyc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB限制
    files: 5 // 最多5个文件
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('只允许上传 JPEG, PNG 或 PDF 文件'));
    }
  }
});

// 提交KYC申请
router.post('/submit', authMiddleware, upload.array('documents', 5), async (req: any, res) => {
  try {
    const { idType, idNumber, fullName, phoneNumber } = req.body;
    const userId = req.user.id;
    const files = req.files as Express.Multer.File[];
    
    if (!idType || !idNumber || !fullName) {
      return res.status(400).json({
        success: false,
        error: '请填写所有必需字段'
      });
    }
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: '请上传身份证件照片'
      });
    }
    
    // 检查用户是否已提交过KYC
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }
    
    if (user.kycVerified) {
      return res.status(400).json({
        success: false,
        error: '您的KYC已通过验证，无需重复提交'
      });
    }
    
    // 如果已有待审核的KYC，更新它
    if (user.kycDocuments && user.kycDocuments.uploadedAt && !user.kycDocuments.verifiedAt && !user.kycDocuments.rejectReason) {
      return res.status(400).json({
        success: false,
        error: '您的KYC正在审核中，请耐心等待'
      });
    }
    
    // 保存文件信息
    const documentUrls = files.map(file => `/uploads/kyc/${file.filename}`);
    
    // 更新用户KYC信息
    user.kycDocuments = {
      idType,
      idNumber,
      documentUrl: documentUrls[0], // 主要文档
      uploadedAt: new Date(),
      // 额外信息
      ...(fullName && { fullName }),
      ...(phoneNumber && { phoneNumber }),
      ...(documentUrls.length > 1 && { additionalDocs: documentUrls.slice(1) })
    };
    
    await user.save();
    
    res.json({
      success: true,
      message: 'KYC申请已提交，请等待审核',
      data: {
        submittedAt: user.kycDocuments.uploadedAt,
        documentsCount: files.length
      }
    });
  } catch (error: any) {
    console.error('KYC提交失败:', error);
    res.status(500).json({
      success: false,
      error: 'KYC提交失败',
      details: error.message
    });
  }
});

// 获取待审核的KYC列表
router.get('/pending', operatorMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, idType } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    const filter: any = {
      kycVerified: false,
      'kycDocuments.uploadedAt': { $exists: true },
      'kycDocuments.verifiedAt': { $exists: false },
      'kycDocuments.rejectReason': { $exists: false }
    };
    
    if (idType) {
      filter['kycDocuments.idType'] = idType;
    }
    
    const users = await User.find(filter)
      .select('walletAddress username kycDocuments createdAt')
      .sort({ 'kycDocuments.uploadedAt': -1 })
      .skip(skip)
      .limit(parseInt(limit as string));
    
    const total = await User.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        users: users.map(user => ({
          id: user._id,
          walletAddress: user.walletAddress,
          username: user.username,
          idType: user.kycDocuments?.idType,
          idNumber: user.kycDocuments?.idNumber,
          submittedAt: user.kycDocuments?.uploadedAt,
          documentUrl: user.kycDocuments?.documentUrl
        })),
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });
  } catch (error: any) {
    console.error('获取KYC列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取KYC列表失败',
      details: error.message
    });
  }
});

// 获取KYC详情
router.get('/:userId', operatorMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('walletAddress username kycDocuments kycVerified createdAt');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }
    
    res.json({
      success: true,
      data: {
        id: user._id,
        walletAddress: user.walletAddress,
        username: user.username,
        kycVerified: user.kycVerified,
        kycDocuments: user.kycDocuments,
        registeredAt: user.createdAt
      }
    });
  } catch (error: any) {
    console.error('获取KYC详情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取KYC详情失败',
      details: error.message
    });
  }
});

// 审核KYC - 通过
router.post('/:userId/approve', operatorMiddleware, async (req: any, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body;
    const operatorId = req.user.id;
    const operatorName = req.user.username;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }
    
    if (user.kycVerified) {
      return res.status(400).json({
        success: false,
        error: '该用户KYC已通过验证'
      });
    }
    
    if (!user.kycDocuments || !user.kycDocuments.uploadedAt) {
      return res.status(400).json({
        success: false,
        error: '该用户未提交KYC申请'
      });
    }
    
    // 更新KYC状态
    user.kycVerified = true;
    user.kycDocuments.verifiedAt = new Date();
    user.kycDocuments.verifiedBy = operatorName;
    if (notes) {
      user.kycDocuments.notes = notes;
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: 'KYC审核通过',
      data: {
        userId: user._id,
        walletAddress: user.walletAddress,
        verifiedAt: user.kycDocuments.verifiedAt,
        verifiedBy: operatorName
      }
    });
  } catch (error: any) {
    console.error('KYC审核失败:', error);
    res.status(500).json({
      success: false,
      error: 'KYC审核失败',
      details: error.message
    });
  }
});

// 审核KYC - 拒绝
router.post('/:userId/reject', operatorMiddleware, async (req: any, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const operatorId = req.user.id;
    const operatorName = req.user.username;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: '请提供拒绝原因'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }
    
    if (user.kycVerified) {
      return res.status(400).json({
        success: false,
        error: '该用户KYC已通过验证，无法拒绝'
      });
    }
    
    if (!user.kycDocuments || !user.kycDocuments.uploadedAt) {
      return res.status(400).json({
        success: false,
        error: '该用户未提交KYC申请'
      });
    }
    
    // 更新KYC状态
    user.kycVerified = false;
    user.kycDocuments.rejectReason = reason;
    user.kycDocuments.verifiedAt = new Date();
    user.kycDocuments.verifiedBy = operatorName;
    
    await user.save();
    
    res.json({
      success: true,
      message: 'KYC审核已拒绝',
      data: {
        userId: user._id,
        walletAddress: user.walletAddress,
        rejectReason: reason,
        rejectedAt: user.kycDocuments.verifiedAt,
        rejectedBy: operatorName
      }
    });
  } catch (error: any) {
    console.error('KYC拒绝失败:', error);
    res.status(500).json({
      success: false,
      error: 'KYC拒绝失败',
      details: error.message
    });
  }
});

// 获取KYC统计
router.get('/stats/overview', operatorMiddleware, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({});
    const kycVerified = await User.countDocuments({ kycVerified: true });
    const kycPending = await User.countDocuments({
      kycVerified: false,
      'kycDocuments.uploadedAt': { $exists: true },
      'kycDocuments.verifiedAt': { $exists: false },
      'kycDocuments.rejectReason': { $exists: false }
    });
    const kycRejected = await User.countDocuments({
      kycVerified: false,
      'kycDocuments.rejectReason': { $exists: true }
    });
    
    // 按证件类型统计
    const idTypeStats = await User.aggregate([
      { 
        $match: { 
          'kycDocuments.idType': { $exists: true } 
        } 
      },
      {
        $group: {
          _id: '$kycDocuments.idType',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          kycVerified,
          kycPending,
          kycRejected,
          kycSubmitted: kycVerified + kycPending + kycRejected,
          verificationRate: totalUsers > 0 ? ((kycVerified / totalUsers) * 100).toFixed(1) : '0'
        },
        idTypeStats,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('获取KYC统计失败:', error);
    res.status(500).json({
      success: false,
      error: '获取KYC统计失败',
      details: error.message
    });
  }
});

export default router;