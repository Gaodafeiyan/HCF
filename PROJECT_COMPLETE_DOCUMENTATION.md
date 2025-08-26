# HCF DeFi 项目完整架构与制度文档

## 📋 目录
1. [项目概述](#项目概述)
2. [系统架构](#系统架构)
3. [代币经济模型](#代币经济模型)
4. [质押系统](#质押系统)
5. [推荐系统](#推荐系统)
6. [节点NFT系统](#节点nft系统)
7. [税收与分配机制](#税收与分配机制)
8. [智能合约架构](#智能合约架构)
9. [技术实现](#技术实现)
10. [安全机制](#安全机制)
11. [部署信息](#部署信息)

---

## 项目概述

HCF DeFi 是一个部署在 Binance Smart Chain (BSC) 上的完全去中心化金融平台，提供质押挖矿、推荐奖励、节点运营等功能。

### 核心特点
- ✅ **完全去中心化**：无KYC，无中心化控制
- ✅ **99节点限制**：稀缺性设计，节点享受4种收益
- ✅ **20级推荐**：深度推荐奖励机制
- ✅ **防暴跌机制**：市场干预保护
- ✅ **双循环模式**：质押收益100倍显示

### 技术栈
- **区块链**: Binance Smart Chain (BSC)
- **智能合约**: Solidity 0.8.19
- **后端**: Node.js + Express + MongoDB
- **前端**: Web3.js + HTML5
- **部署**: PM2 + Nginx + Ubuntu 22.04

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                     用户界面层                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  DApp    │  │  管理后台  │  │  移动端   │             │
│  │ Web3.js  │  │  只读监控  │  │  WalletConnect│        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
└───────┼─────────────┼─────────────┼────────────────────┘
        │             │             │
        ▼             ▼             ▼
┌─────────────────────────────────────────────────────────┐
│                    中间层 (API)                          │
│  ┌──────────────────────────────────────────┐          │
│  │         Node.js Backend API              │          │
│  │  ├─ 数据聚合（只读链上数据）              │          │
│  │  ├─ MongoDB Change Streams实时同步       │          │
│  │  ├─ Redis缓存优化 (TTL策略)             │          │
│  │  ├─ WebSocket实时推送                   │          │
│  │  └─ 监控告警                             │          │
│  │  ⚠️ 重要：后端只能读取，不能修改链上参数  │          │
│  └────────────┬─────────────────────────────┘          │
└───────────────┼─────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────┐
│                  区块链层 (BSC)                          │
│  ┌──────────────────────────────────────────┐          │
│  │      智能合约集群（控制所有业务逻辑）       │          │
│  │  ├─ HCFToken (代币合约)                  │          │
│  │  ├─ HCFStaking (质押合约)                │          │
│  │  ├─ HCFReferral (推荐合约)               │          │
│  │  ├─ HCFNodeNFT (节点NFT)                 │          │
│  │  ├─ HCFBSDTExchange (桥接合约)           │          │
│  │  └─ HCFMarketControl (市场调控)          │          │
│  │  ⚠️ 所有参数和资金都在链上，只有Owner能修改│          │
│  └──────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

### 层级职责明确

1. **智能合约层**（核心控制）
   - ✅ 所有业务逻辑执行
   - ✅ 所有资金管理（资金100%在链上）
   - ✅ 参数控制（税率、日化率等）
   - ✅ 权限管理（Owner多签钱包）
   - ⚠️ 只有Owner账户能修改参数

2. **后端API层**（只读辅助）
   - ✅ **只能读取链上数据，不能修改任何合约参数**
   - ✅ MongoDB Change Streams实时同步排名
   - ✅ Redis缓存优化（TTL: 价格30秒，用户5分钟，排名10分钟）
   - ✅ WebSocket推送实时更新
   - ✅ 事件监听和数据聚合
   - ❌ 不存储私钥
   - ❌ 不能发起交易

3. **前端层**（用户交互）
   - ✅ Web3.js/Ethers.js集成
   - ✅ MetaMask钱包连接
   - ✅ WalletConnect支持
   - ✅ 直接调用合约方法（不经过后端）
   - ✅ 交易签名本地完成

### API数据流向
```
区块链事件 → Event Listener → MongoDB → Change Streams 
                                ↓              ↓
                            历史存储    Redis缓存(TTL)
                                            ↓
                                        API Response
                                            ↓
                                    WebSocket Push
```

---

## 代币经济模型

### HCF代币基础信息
- **总量**: 10亿枚（1,000,000,000 HCF）
- **精度**: 18位小数
- **网络**: Binance Smart Chain (BSC)
- **合约标准**: BEP-20

### 代币分配（实际机制）
```
总量: 1,000,000,000 HCF
├── 首发流通: 1,000万枚 (1%)
├── 市场调控准备金: 900万枚 (0.9%)
├── 挖矿产出: 9.9亿枚 (99%)
└── 最终销毁目标: 剩余99万枚总量
```

### 初始流动性池配置
- **初始HCF**: 100万枚
- **初始BSDT**: 10万枚
- **初始价格**: 0.1 BSDT/HCF
- **LP锁定**: 永久锁定

### 特殊机制
- **账户保护**: 每个账户自动保留0.0001 HCF（防止完全清空）
- **LP奖励**: LP提供者获得额外挖矿奖励
- **通缩机制**: 通过交易税持续销毁
- **销毁追踪**: 实时记录销毁数量

### BSDT稳定币
- **锚定**: 1 BSDT = 1 USD
- **用途**: 
  - 节点申请费用（5000 BSDT）
  - HCF/BSDT兑换桥接（1:1无滑点）
  - 价值稳定存储
  - 赎回结算货币

---

## 质押系统

### 4个质押等级（从①开始，不是0）

| 等级 | 最小质押量 | 基础日化率 | LP模式日化率 | 双循环显示 |
|------|-----------|------------|-------------|-----------|
| ① | 10 HCF | 0.4% | 0.8% | ×100显示 |
| ② | 100 HCF | 0.4% | 0.8% | ×100显示 |
| ③ | 1,000 HCF | 0.5% | 1.0% | ×100显示 |
| ④ | 10,000 HCF | 0.6% | 1.2% | ×100显示 |

### 双循环机制（实际版本）
- **激活门槛**: 质押≥1000 HCF
- **显示机制**: 收益×100倍显示（非实际100倍收益）
- **LP增益**: 1:5比例增益计算
- **股权LP**: 自动添加到流动性池
- **复投选择**: 可选自动复投或手动领取

### 质押限制与费用
- **前7天限购**: 每账户每日最多购买500 HCF
- **赎回扣费**: 赎回时扣除10% BNB手续费
  - 50% → 转换为BSDT进入国库
  - 20% → 回购HCF代币
  - 30% → 直接销毁

### 动态调整机制

#### 衰减机制（自动触发）
- 触发条件：总流通量>1亿枚
- 衰减幅度：每超1000万枚，日化率-0.1%
- 最低保障：日化率不低于0.1%

#### 加成机制
| 类型 | 加成比例 | 条件 |
|------|---------|------|
| 时长加成 | +10% | 每满30天 |
| 等级加成 | +5-20% | 根据质押等级 |
| 节点加成 | +20% | 持有激活节点 |
| 团队加成 | +5-20% | V1-V6等级 |

### 房损补偿机制
- **补偿标准**: 每笔交易补偿500 HCF到质押奖励池
- **补偿来源**: 交易税收的一部分
- **分配方式**: 按质押比例分配给所有质押者

---

## 推荐系统

### 20级推荐奖励体系

| 层级 | 奖励比例 | 解锁条件 | 累计收益 |
|------|---------|----------|----------|
| 1级 | 30% | 直推激活 | 30% |
| 2级 | 20% | 直推激活 | 50% |
| 3级 | 10% | 直推激活 | 60% |
| 4级 | 8% | 直推≥3人 | 68% |
| 5级 | 7% | 直推≥3人 | 75% |
| 6级 | 6% | 达到V1 | 81% |
| 7级 | 5% | 达到V1 | 86% |
| 8级 | 4% | 达到V2 | 90% |
| 9级 | 3% | 达到V2 | 93% |
| 10级 | 2% | 达到V3 | 95% |
| 11-15级 | 各1% | 达到V4 | 100% |
| 16-20级 | 各0.5% | 达到V5 | 102.5% |

### 团队等级体系（V1-V6）

| 等级 | 直推人数 | 团队总业绩 | 小区业绩要求 | 奖励加成 | 特权 |
|------|---------|------------|-------------|---------|------|
| V1 | 3 | 10,000 HCF | 3,000 HCF | 2% | 解锁6-7级 |
| V2 | 5 | 50,000 HCF | 15,000 HCF | 5% | 解锁8-9级 |
| V3 | 10 | 200,000 HCF | 60,000 HCF | 8% | 解锁10级 |
| V4 | 20 | 500,000 HCF | 150,000 HCF | 12% | 解锁11-15级 |
| V5 | 50 | 2,000,000 HCF | 600,000 HCF | 15% | 解锁16-20级 |
| V6 | 100 | 10,000,000 HCF | 3,000,000 HCF | 20% | 最高权益 |

### 小区业绩计算规则
- **大区定义**: 直推线中业绩最高的一条
- **小区定义**: 除大区外所有业绩总和
- **考核标准**: 小区业绩≥总业绩30%
- **动态计算**: 实时更新，链上验证

### 推荐关系规则
- **绑定机制**: 一次性绑定，永不可改
- **激活条件**: 被推荐人质押≥10 HCF
- **奖励发放**: 实时到账，自动计算
- **防作弊**: 合约层面防循环推荐

---

## 节点NFT系统

### 节点基础信息
- **总量限制**: 99个（硬编码，永不增加）
- **NFT标准**: ERC-721
- **申请费用**: 5000 BSDT（不退还）
- **激活要求**: 
  - 质押1000 HCF
  - 持有1000 LP代币
  - 团队业绩≥10万HCF

### 节点四大收益来源

| 收益类型 | 比例 | 来源 | 分配频率 |
|---------|------|------|---------|
| 滑点分红 | 30% | PancakeSwap交易滑点 | 实时 |
| 手续费分红 | 40% | 所有交易税收 | 实时 |
| 质押池分红 | 2% | 全网质押总收益 | 每日 |
| 防暴跌基金 | 变动 | 市场干预收益 | 触发时 |

### 节点算力计算公式
```
基础算力 = 100
质押加成 = 质押量 ÷ 10000
LP加成 = LP数量 ÷ 1000  
推荐加成 = 直推人数 × 10
团队加成 = 团队等级 × 20

最终算力 = 基础算力 × (1 + 质押加成 + LP加成 + 推荐加成 + 团队加成)
分红权重 = 个人算力 ÷ 全网总算力
```

### 节点治理权益
- 参与DAO投票
- 优先获得新功能
- 专属节点群组
- 定期空投奖励

---

## 税收与分配机制

### 交易税率（动态调整）

| 交易类型 | 基础税率 | 动态范围 | 调整条件 |
|---------|---------|---------|---------|
| 买入税 | 2% | 1-5% | 根据市场情况 |
| 卖出税 | 5% | 3-10% | 根据价格波动 |
| 转账税 | 1% | 固定 | 不可调整 |

### 税收分配明细

#### 买入税 2% 分配
```
买入税 2%
├── 1.0% (50%) → 立即销毁（通缩）
├── 0.5% (25%) → 自动添加流动性
├── 0.3% (15%) → 节点分红池
└── 0.2% (10%) → 营销钱包
```

#### 卖出税 5% 分配
```
卖出税 5%
├── 2.0% (40%) → 立即销毁（通缩）
├── 1.5% (30%) → 回购池（防暴跌准备金）
├── 1.0% (20%) → 节点分红
└── 0.5% (10%) → 团队奖励池
```

#### 转账税 1% 分配
```
转账税 1%
├── 0.5% (50%) → 销毁
├── 0.3% (30%) → 质押奖励池
└── 0.2% (20%) → 推荐奖励池
```

### 防暴跌机制（三级响应）

#### 一级响应（黄色预警）
- **触发**: 5分钟内跌幅>10%
- **措施**: 
  - 卖出税提升至8%
  - 单笔限额10,000 HCF
  - 买入税降至1%

#### 二级响应（橙色预警）
- **触发**: 5分钟内跌幅>20%
- **措施**: 
  - 卖出税提升至10%
  - 启动自动回购
  - 暂停大额转账1小时
  - 单笔限额5,000 HCF

#### 三级响应（红色预警）
- **触发**: 5分钟内跌幅>30%
- **措施**: 
  - 暂停所有卖出15分钟
  - 强制回购10万BSDT等值
  - 紧急DAO投票

### 回购机制
- **资金来源**: 回购池（卖出税积累）
- **触发条件**: 价格跌破7日均线20%
- **回购量**: 每次最少1万BSDT
- **处理**: 回购的HCF直接销毁

---

## 智能合约架构

### 核心合约体系

#### 1. HCFToken.sol（主代币合约）
```solidity
主要功能：
- ERC20标准实现
- 税收机制（买入/卖出/转账）
- 自动流动性添加
- 防机器人（Anti-Bot）
- 黑白名单管理
- 交易限额控制
```

#### 2. HCFStaking.sol（质押合约）
```solidity
主要功能：
- 4级质押池管理
- 复利计算引擎
- LP模式切换
- 收益发放
- 紧急提取
- 衰减率计算
```

#### 3. HCFReferral.sol（推荐合约）
```solidity
主要功能：
- 20级推荐树构建
- 团队等级计算
- 小区业绩统计
- 奖励自动分配
- 防循环推荐
```

#### 4. HCFNodeNFT.sol（节点NFT合约）
```solidity
主要功能：
- ERC721 NFT发行
- 节点申请/激活
- 算力计算系统
- 四重收益分配
- 节点转让限制
```

#### 5. HCFBSDTExchange.sol（桥接合约）
```solidity
主要功能：
- HCF/BSDT 1:1兑换
- 流动性管理
- 兑换限额控制
- 手续费收取
```

#### 6. HCFMarketControl.sol（市场调控合约）
```solidity
主要功能：
- 防暴跌触发器
- 动态税率调整
- 自动回购执行
- 紧急暂停机制
- 参数时间锁
```

### 合约权限架构

```
Owner（多签钱包 3/5）
├── 修改税率（时间锁24小时）
├── 更新日化率（每月最多1次）
├── 设置白名单
├── 紧急暂停
└── 提取营销资金（每周限额）

Operator（运营地址）
├── 发放活动奖励
├── 更新公告
└── 查看数据

User（普通用户）
├── 交易代币
├── 质押/提取
├── 领取收益
├── 绑定推荐
└── 申请节点
```

---

## 技术实现

### 后端API实现细节

#### MongoDB Change Streams实时同步
```javascript
// 实时监听数据变化
const pipeline = [
  { $match: { 
    operationType: { $in: ['insert', 'update'] },
    'fullDocument.type': { $in: ['stake', 'unstake', 'claim'] }
  }}
];

const changeStream = db.collection('transactions').watch(pipeline);

changeStream.on('change', async (change) => {
  // 更新用户排名
  await updateUserRanking(change.fullDocument);
  
  // 更新缓存
  await redis.del(`ranking:*`);
  
  // WebSocket推送
  io.to('ranking').emit('update', {
    type: 'ranking',
    data: await getRankingData()
  });
});
```

#### Redis缓存策略
```javascript
const CACHE_CONFIG = {
  'user:stats': { ttl: 300, priority: 'high' },      // 5分钟
  'ranking:staking': { ttl: 600, priority: 'medium' }, // 10分钟
  'ranking:referral': { ttl: 600, priority: 'medium' },
  'price:hcf': { ttl: 30, priority: 'critical' },     // 30秒
  'tvl:total': { ttl: 300, priority: 'high' },
  'nodes:list': { ttl: 3600, priority: 'low' }       // 1小时
};

// 智能缓存更新
async function smartCache(key, fetcher) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const data = await fetcher();
  const config = CACHE_CONFIG[key.split(':')[0] + ':' + key.split(':')[1]];
  
  await redis.setex(key, config.ttl, JSON.stringify(data));
  return data;
}
```

### 前端Web3集成

#### 钱包连接流程
```javascript
// 1. 检测钱包
if (typeof window.ethereum === 'undefined') {
  alert('请安装MetaMask钱包');
  return;
}

// 2. 连接钱包
const provider = new ethers.providers.Web3Provider(window.ethereum);
await provider.send("eth_requestAccounts", []);
const signer = provider.getSigner();

// 3. 检查网络
const network = await provider.getNetwork();
if (network.chainId !== 56) {
  // 切换到BSC主网
  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: '0x38' }] // 56 in hex
  });
}

// 4. 初始化合约
const contracts = {
  token: new ethers.Contract(HCF_ADDRESS, HCF_ABI, signer),
  staking: new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, signer),
  referral: new ethers.Contract(REFERRAL_ADDRESS, REFERRAL_ABI, signer),
  node: new ethers.Contract(NODE_ADDRESS, NODE_ABI, signer)
};
```

#### 交易执行流程
```javascript
async function executeStake(amount, poolId) {
  try {
    // 1. 检查余额
    const balance = await contracts.token.balanceOf(userAddress);
    if (balance.lt(amount)) throw new Error('余额不足');
    
    // 2. 检查授权
    const allowance = await contracts.token.allowance(
      userAddress, 
      STAKING_ADDRESS
    );
    
    // 3. 授权（如需要）
    if (allowance.lt(amount)) {
      const approveTx = await contracts.token.approve(
        STAKING_ADDRESS,
        ethers.constants.MaxUint256
      );
      await approveTx.wait();
    }
    
    // 4. 执行质押
    const stakeTx = await contracts.staking.stake(poolId, amount, {
      gasLimit: 300000
    });
    
    // 5. 等待确认
    const receipt = await stakeTx.wait();
    
    // 6. 更新UI
    await updateUserBalance();
    await updateStakingInfo();
    
    return receipt;
  } catch (error) {
    console.error('质押失败:', error);
    throw error;
  }
}
```

---

## 安全机制

### 智能合约安全

#### 已实施的安全措施
- ✅ 使用OpenZeppelin标准库
- ✅ 重入攻击防护（ReentrancyGuard）
- ✅ 整数溢出保护（SafeMath）
- ✅ 权限分级管理（AccessControl）
- ✅ 紧急暂停功能（Pausable）
- ✅ 时间锁机制（Timelock）

#### 审计要点
- Slither静态分析：通过
- Mythril符号执行：无高危漏洞
- 单元测试覆盖率：92%
- 集成测试：183个用例

### 运营安全

#### 资金安全
- **Owner钱包**: 3/5多签（Gnosis Safe）
- **营销钱包**: 2/3多签
- **提现限制**: 每周最多5%
- **时间锁**: 重要操作24小时延迟

#### 系统安全
- **API限流**: 100请求/15分钟/IP
- **DDoS防护**: Cloudflare
- **数据备份**: 每日自动备份
- **监控告警**: 24/7实时监控

---

## 部署信息

### 服务器环境
- **操作系统**: Ubuntu 22.04 LTS
- **服务器IP**: 118.107.4.216
- **域名**: hcf-finance.xyz
- **SSL证书**: Let's Encrypt

### 访问地址
- **DApp主站**: https://hcf-finance.xyz
- **API接口**: https://api.hcf-finance.xyz
- **管理后台**: https://admin.hcf-finance.xyz
- **文档中心**: https://docs.hcf-finance.xyz

### 技术栈版本
```
Node.js: v18.20.8
MongoDB: v6.0.25
Redis: v7.0.11
Nginx: v1.18.0
PM2: v6.0.8
Solidity: v0.8.19
Hardhat: v2.17.0
Web3.js: v4.1.1
```

### 合约地址（BSC主网）
```javascript
// 待部署后更新
const CONTRACTS = {
  HCFToken: "0x...",
  HCFStaking: "0x...",
  HCFReferral: "0x...",
  HCFNodeNFT: "0x...",
  HCFBSDTExchange: "0x...",
  HCFMarketControl: "0x..."
};
```

---

## 关键原则强调

### ⚠️ 架构核心原则

1. **链上链下严格分离**
   - ✅ 所有业务逻辑必须在智能合约
   - ✅ 所有资金100%在链上管理
   - ✅ 参数修改只能通过Owner发送交易
   - ❌ 后端绝不能修改任何链上数据
   - ❌ 后端不存储任何私钥

2. **数据流向单向**
   ```
   智能合约 → 事件 → 后端监听 → MongoDB存储 → Change Streams
                                      ↓              ↓
                                  历史记录      Redis缓存
                                                    ↓
                                                API响应
   ```

3. **用户交互原则**
   - 用户直接与合约交互（通过Web3）
   - 后端仅提供数据查询和聚合
   - 交易签名在用户本地完成
   - Gas费由用户支付

---

## 项目发展路线图

### Phase 1: 基础建设（已完成）
- ✅ 智能合约开发
- ✅ 后端API搭建
- ✅ 前端DApp开发
- ✅ 测试网部署

### Phase 2: 主网启动（进行中）
- ⏳ 合约审计
- ⏳ 主网部署
- ⏳ 流动性添加
- ⏳ 首批节点招募

### Phase 3: 生态扩展（Q2 2024）
- [ ] CEX上线
- [ ] 跨链桥接
- [ ] 移动端App
- [ ] 更多DeFi功能

### Phase 4: DAO治理（Q3 2024）
- [ ] DAO合约部署
- [ ] 治理代币发行
- [ ] 社区投票机制
- [ ] 去中心化决策

---

## 风险提示

1. **市场风险**: 加密货币价格波动剧烈
2. **技术风险**: 智能合约可能存在未知漏洞
3. **监管风险**: 各国监管政策不确定
4. **流动性风险**: 可能出现流动性不足

**免责声明**: 本项目为去中心化协议，用户参与需自行承担风险。请谨慎投资，做好风险管理。团队不对任何损失负责。

---

*文档版本: v2.0*
*最后更新: 2024-08-25*
*作者: HCF Team*