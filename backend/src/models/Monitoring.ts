import mongoose, { Schema, Document } from 'mongoose';

export interface IMonitoring extends Document {
  type: 'price_alert' | 'stake_alert' | 'referral_alert' | 'node_alert' | 'system_alert';
  level: 'red' | 'yellow' | 'green';
  title: string;
  message: string;
  data: object;
  timestamp: Date;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  actionTaken?: string;
}

const MonitoringSchema = new Schema<IMonitoring>({
  type: { 
    type: String, 
    required: true,
    enum: ['price_alert', 'stake_alert', 'referral_alert', 'node_alert', 'system_alert']
  },
  level: { 
    type: String, 
    required: true,
    enum: ['red', 'yellow', 'green']
  },
  title: { 
    type: String, 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  data: { 
    type: Schema.Types.Mixed, 
    default: {} 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  resolved: { 
    type: Boolean, 
    default: false 
  },
  resolvedBy: { 
    type: String 
  },
  resolvedAt: { 
    type: Date 
  },
  actionTaken: { 
    type: String 
  }
}, { 
  timestamps: true 
});

// 索引优化
MonitoringSchema.index({ type: 1, timestamp: -1 });
MonitoringSchema.index({ level: 1, resolved: 1 });
MonitoringSchema.index({ timestamp: -1 });

export default mongoose.model<IMonitoring>('Monitoring', MonitoringSchema);
