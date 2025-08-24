import { Request, Response } from 'express';
import Parameter from '../models/Parameter';
import { multiSigManager } from '../utils/multiSig';

export const getParameters = async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const filter = category ? { category, isActive: true } : { isActive: true };
    
    const parameters = await Parameter.find(filter).sort({ key: 1 });
    res.json({ success: true, data: parameters });
  } catch (error: any) {
    res.status(500).json({ error: '获取参数失败', details: error.message });
  }
};

export const updateParameter = async (req: Request, res: Response) => {
  try {
    const { key, value, description } = req.body;
    const updatedBy = (req as any).user.walletAddress;

    // 查找现有参数
    let parameter = await Parameter.findOne({ key });
    
    if (!parameter) {
      return res.status(404).json({ error: '参数不存在' });
    }

    // 检查是否需要多签确认
    const criticalParams = ['dailyYieldBase', 'buyTaxRate', 'sellTaxRate', 'decayRate'];
    if (criticalParams.includes(key)) {
      // 创建多签交易
      const txData = {
        to: process.env.HCF_TOKEN_ADDRESS || '',
        value: '0',
        data: '0x', // 这里应该包含实际的合约调用数据
        nonce: 0
      };
      
      const multiSigTx = await multiSigManager.createTransaction(txData);
      
      // 等待多签确认
      const isExecutable = await multiSigManager.isExecutable(multiSigTx.nonce.toString());
      
      if (!isExecutable) {
        return res.status(400).json({ 
          error: '需要多签确认', 
          multiSigTx: multiSigTx.nonce 
        });
      }
    }

    // 更新参数
    const oldValue = parameter.value;
    parameter.value = value;
    parameter.description = description || parameter.description;
    parameter.updatedBy = updatedBy;
    
    // 添加到历史记录
    parameter.history.push({
      value: oldValue,
      timestamp: new Date(),
      updatedBy,
      multiSigTx: criticalParams.includes(key) ? 'confirmed' : undefined
    });

    await parameter.save();

    res.json({ 
      success: true, 
      message: '参数更新成功',
      data: parameter 
    });
  } catch (error: any) {
    res.status(500).json({ error: '参数更新失败', details: error.message });
  }
};

export const updateDecayRates = async () => {
  try {
    console.log('🔄 开始更新衰减率...');
    
    // 获取总质押量 (这里应该从合约获取)
    const totalStaked = 0; // 简化版本
    
    // 如果总质押超过1亿，应用衰减
    if (totalStaked > 100_000_000) {
      const decayRate = 0.001; // 0.1%衰减
      
      // 更新所有质押池的收益率
      const pools = [0, 1, 2, 3, 4];
      for (const pool of pools) {
        const paramKey = `pool${pool}DailyRate`;
        const currentRate = await getParameterValue(paramKey);
        const newRate = Math.max(0, currentRate - decayRate);
        
        // 这里应该调用参数更新逻辑
        console.log(`池${pool}收益率从${currentRate}更新为${newRate}`);
      }
      
      console.log('✅ 衰减率更新完成');
    }
  } catch (error: any) {
    console.error('❌ 衰减率更新失败:', error);
  }
};

// 辅助函数
async function getParameterValue(key: string): Promise<number> {
  const param = await Parameter.findOne({ key });
  return param ? parseFloat(param.value) : 0;
}
