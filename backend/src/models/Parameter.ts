import mongoose, { Schema, Document } from 'mongoose';

export interface IParameter extends Document {
  key: string;
  value: string;
  description: string;
  category: 'staking' | 'referral' | 'node' | 'market' | 'control';
  isActive: boolean;
  history: Array<{
    value: string;
    timestamp: Date;
    updatedBy: string;
    multiSigTx?: string;
  }>;
  updatedBy: string;
  updatedAt: Date;
}

const ParameterSchema = new Schema<IParameter>({
  key: { 
    type: String, 
    required: true, 
    unique: true 
  },
  value: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  category: { 
    type: String, 
    required: true, 
    enum: ['staking', 'referral', 'node', 'market', 'control'] 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  history: [{
    value: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: String, required: true },
    multiSigTx: { type: String }
  }],
  updatedBy: { 
    type: String, 
    required: true 
  }
}, { 
  timestamps: true 
});

// 索引
ParameterSchema.index({ key: 1 });
ParameterSchema.index({ category: 1 });
ParameterSchema.index({ isActive: 1 });

export default mongoose.model<IParameter>('Parameter', ParameterSchema);
