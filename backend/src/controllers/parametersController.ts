import { Request, Response } from 'express';
import Parameter from '../models/Parameter';

// 获取参数列表
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

// 更新链下参数（仅影响前端显示，不影响合约）
export const updateParameter = async (req: Request, res: Response) => {
  try {
    const { key, value, description } = req.body;
    const updatedBy = (req as any).user.walletAddress;

    // 查找现有参数
    let parameter = await Parameter.findOne({ key });
    
    if (!parameter) {
      return res.status(404).json({ error: '参数不存在' });
    }

    // 警告：这些参数仅用于前端显示，不会影响智能合约
    console.log(`⚠️ 更新链下参数: ${key} = ${value} (仅影响前端显示)`);

    // 更新参数
    const oldValue = parameter.value;
    parameter.value = value;
    parameter.description = description || parameter.description;
    parameter.updatedBy = updatedBy;
    
    // 添加到历史记录
    parameter.history.push({
      value: oldValue,
      timestamp: new Date(),
      updatedBy
      // note: 'offchain_only' - 链下参数标记（TypeScript类型定义中需要添加）
    });

    await parameter.save();

    res.json({ 
      success: true, 
      message: '链下参数更新成功（不影响合约）',
      data: parameter,
      warning: '此参数仅影响前端显示，实际合约参数需通过区块链交易修改'
    });
  } catch (error: any) {
    res.status(500).json({ error: '参数更新失败', details: error.message });
  }
};

// 注意：已删除无效的衰减率函数和虚假的多签机制
// 所有影响合约的参数必须通过智能合约直接调用修改