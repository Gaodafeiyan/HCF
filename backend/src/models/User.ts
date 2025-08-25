import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  walletAddress: string;
  username?: string;
  password?: string;
  role?: 'admin' | 'operator' | 'viewer';
  referrer: string | null;
  referralLevel: number;
  teamLevel: 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | null;
  stakingAmount: number;
  stakingPool: number;
  totalRewards: number;
  totalReferralRewards: number;
  totalTeamRewards: number;
  smallDistrictPerformance: number; // 小区业绩
  referrals: string[];
  isActive: boolean;
  kycVerified: boolean;
  kycDocuments?: {
    idType: string;
    idNumber: string;
    documentUrl?: string;
    uploadedAt: Date;
    verifiedAt?: Date;
    verifiedBy?: string;
    rejectReason?: string;
  };
  lastLogin?: Date;
  loginAttempts?: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  walletAddress: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true 
  },
  username: {
    type: String,
    sparse: true,
    unique: true
  },
  password: {
    type: String,
    select: false // 默认不返回密码字段
  },
  role: {
    type: String,
    enum: ['admin', 'operator', 'viewer'],
    default: 'viewer'
  },
  referrer: { 
    type: String, 
    default: null,
    lowercase: true
  },
  referralLevel: { 
    type: Number, 
    default: 0 
  },
  teamLevel: { 
    type: String, 
    enum: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', null], 
    default: null 
  },
  stakingAmount: { 
    type: Number, 
    default: 0 
  },
  stakingPool: { 
    type: Number, 
    default: 0 
  },
  totalRewards: { 
    type: Number, 
    default: 0 
  },
  totalReferralRewards: { 
    type: Number, 
    default: 0 
  },
  totalTeamRewards: { 
    type: Number, 
    default: 0 
  },
  smallDistrictPerformance: { 
    type: Number, 
    default: 0 
  },
  referrals: [{ 
    type: String,
    lowercase: true
  }],
  isActive: { 
    type: Boolean, 
    default: true 
  },
  kycVerified: { 
    type: Boolean, 
    default: false 
  },
  kycDocuments: {
    idType: String,
    idNumber: String,
    documentUrl: String,
    uploadedAt: Date,
    verifiedAt: Date,
    verifiedBy: String,
    rejectReason: String
  },
  lastLogin: Date,
  loginAttempts: { 
    type: Number, 
    default: 0 
  },
  lockedUntil: Date
}, { 
  timestamps: true 
});

// 索引优化查询
UserSchema.index({ walletAddress: 1 });
UserSchema.index({ referrer: 1 });
UserSchema.index({ teamLevel: 1 });
UserSchema.index({ smallDistrictPerformance: 1 });
UserSchema.index({ stakingAmount: -1 });
UserSchema.index({ totalRewards: -1 });

export default mongoose.model<IUser>('User', UserSchema);
