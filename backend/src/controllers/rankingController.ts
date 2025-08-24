import { Request, Response } from 'express';
import User from '../models/User';

export const getPersonalRanking = async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    
    // 获取用户信息
    const user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 计算排名
    const ranking = await calculateUserRanking(walletAddress);
    
    // 计算奖励加成
    let bonusPercentage = 0;
    if (ranking.rank <= 100) {
      bonusPercentage = 20; // Top 100: 20%加成
    } else if (ranking.rank <= 299) {
      bonusPercentage = 10; // 101-299: 10%加成
    }

    // 检查小区排名资格
    let districtBonus = 0;
    if (user.smallDistrictPerformance > 0 && user.referrals.length > 1) {
      // 非单条线且有业绩，可以参与小区排名
      const districtRanking = await calculateDistrictRanking(walletAddress);
      if (districtRanking.rank <= 100) {
        districtBonus = 20;
      } else if (districtRanking.rank <= 299) {
        districtBonus = 10;
      }
    }

    res.json({
      success: true,
      data: {
        walletAddress,
        personalRank: ranking.rank,
        personalBonus: bonusPercentage,
        districtRank: districtRanking?.rank || null,
        districtBonus: districtBonus,
        totalBonus: Math.max(bonusPercentage, districtBonus),
        stakingAmount: user.stakingAmount,
        totalRewards: user.totalRewards,
        teamLevel: user.teamLevel
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: '获取排名失败', details: error.message });
  }
};

export const getRankingList = async (req: Request, res: Response) => {
  try {
    const { type = 'personal', limit = 100 } = req.query;
    
    let rankingData;
    if (type === 'personal') {
      rankingData = await getPersonalRankingList(parseInt(limit as string));
    } else if (type === 'district') {
      rankingData = await getDistrictRankingList(parseInt(limit as string));
    } else {
      return res.status(400).json({ error: '无效的排名类型' });
    }

    res.json({
      success: true,
      data: rankingData
    });
  } catch (error: any) {
    res.status(500).json({ error: '获取排名列表失败', details: error.message });
  }
};

export const recalculateAllRankings = async () => {
  try {
    console.log('🔄 开始重新计算所有排名...');
    
    // 重新计算个人排名
    await recalculatePersonalRankings();
    
    // 重新计算小区排名
    await recalculateDistrictRankings();
    
    console.log('✅ 所有排名重新计算完成');
  } catch (error: any) {
    console.error('❌ 排名重新计算失败:', error);
  }
};

// 辅助函数
async function calculateUserRanking(walletAddress: string) {
  // 按质押量排序
  const users = await User.find({ isActive: true })
    .sort({ stakingAmount: -1 })
    .select('walletAddress stakingAmount');
  
  const rank = users.findIndex(user => 
    user.walletAddress.toLowerCase() === walletAddress.toLowerCase()
  ) + 1;
  
  return { rank: rank > 0 ? rank : null };
}

async function calculateDistrictRanking(walletAddress: string) {
  // 按小区业绩排序，跳过零业绩和单条线
  const users = await User.find({ 
    isActive: true,
    smallDistrictPerformance: { $gt: 0 },
    $expr: { $gt: [{ $size: "$referrals" }, 1] }
  })
    .sort({ smallDistrictPerformance: -1 })
    .select('walletAddress smallDistrictPerformance');
  
  const rank = users.findIndex(user => 
    user.walletAddress.toLowerCase() === walletAddress.toLowerCase()
  ) + 1;
  
  return { rank: rank > 0 ? rank : null };
}

async function getPersonalRankingList(limit: number) {
  return await User.find({ isActive: true })
    .sort({ stakingAmount: -1 })
    .limit(limit)
    .select('walletAddress stakingAmount totalRewards teamLevel');
}

async function getDistrictRankingList(limit: number) {
  return await User.find({ 
    isActive: true,
    smallDistrictPerformance: { $gt: 0 },
    $expr: { $gt: [{ $size: "$referrals" }, 1] }
  })
    .sort({ smallDistrictPerformance: -1 })
    .limit(limit)
    .select('walletAddress smallDistrictPerformance teamLevel');
}

async function recalculatePersonalRankings() {
  // 个人排名重新计算逻辑
  console.log('🔄 重新计算个人排名...');
}

async function recalculateDistrictRankings() {
  // 小区排名重新计算逻辑
  console.log('�� 重新计算小区排名...');
}
