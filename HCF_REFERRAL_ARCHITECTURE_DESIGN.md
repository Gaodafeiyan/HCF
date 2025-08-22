# 🔗 HCF推荐系统架构设计文档

## 📋 设计概览

HCF推荐系统是一个完整的多层推荐奖励机制，包含20级推荐体系和V1-V6团队等级系统，旨在激励用户推广和建立长期的推荐关系网络。

---

## 🏗️ 架构组成

### **1. 核心合约: HCFReferral.sol**

```solidity
contract HCFReferral {
    // 20级推荐体系 (20%~2% 递减)
    // V1-V6团队等级 (6%-36% 团队奖励)
    // 直推解锁机制
    // 推荐燃烧机制
}
```

### **2. 数据结构设计**

#### **用户数据结构**
```solidity
struct UserData {
    address referrer;           // 推荐人
    uint256 directCount;        // 直推人数
    uint256 teamLevel;          // 团队等级 (V1-V6)
    uint256 personalVolume;     // 个人业绩
    uint256 teamVolume;         // 团队业绩
    uint256 totalReferralReward; // 累计推荐奖励
    uint256 totalTeamReward;    // 累计团队奖励
    bool isActive;              // 是否激活
    uint256 joinTime;           // 加入时间
    uint256 lastRewardTime;     // 最后奖励时间
}
```

#### **团队等级配置**
```solidity
struct TeamLevelConfig {
    uint256 directRequirement;    // 直推要求
    uint256 teamVolumeRequirement; // 团队业绩要求
    uint256 rewardRate;           // 团队奖励率
    bool unlockRequired;          // 是否需要解锁
}
```

---

## 🎯 功能模块详解

### **1. 20级推荐体系**

#### **推荐费率分配**
```
级别 1:  20.0% 奖励
级别 2:  18.1% 奖励
级别 3:  16.2% 奖励
级别 4:  14.3% 奖励
级别 5:  12.4% 奖励
...递减...
级别 19: 3.8% 奖励  
级别 20: 2.9% 奖励
```

#### **奖励分发机制**
```javascript
// 伪代码逻辑
function distributeReferralRewards(user, rewardAmount) {
    address currentReferrer = users[user].referrer;
    
    for (level = 1; level <= 20 && currentReferrer != 0; level++) {
        if (users[currentReferrer].isActive) {
            uint256 reward = (rewardAmount * referralRates[level]) / 10000;
            uint256 burnAmount = (reward * referralBurnRate) / 10000;
            uint256 netReward = reward - burnAmount;
            
            // 发放净奖励
            transfer(currentReferrer, netReward);
            // 燃烧部分
            transfer(BURN_ADDRESS, burnAmount);
        }
        currentReferrer = users[currentReferrer].referrer;
    }
}
```

### **2. V1-V6团队等级系统**

#### **团队等级要求**
```
V1级别: 3个直推 + 10,000 HCF团队业绩 → 6% 团队奖励
V2级别: 5个直推 + 50,000 HCF团队业绩 → 12% 团队奖励  
V3级别: 8个直推 + 100,000 HCF团队业绩 → 18% 团队奖励
V4级别: 12个直推 + 500,000 HCF团队业绩 → 24% 团队奖励
V5级别: 20个直推 + 1,000,000 HCF团队业绩 → 30% 团队奖励
V6级别: 30个直推 + 5,000,000 HCF团队业绩 → 36% 团队奖励
```

#### **团队业绩计算**
```javascript
// 递归计算团队总业绩
function calculateTeamVolume(user) {
    uint256 totalVolume = users[user].personalVolume;
    
    // 遍历所有直推用户
    for (each directReferral) {
        totalVolume += calculateTeamVolumeRecursive(directReferral, depth);
    }
    
    return totalVolume;
}
```

### **3. 用户激活机制**

#### **激活条件**
```
质押要求: ≥100 HCF
激活流程:
1. 用户质押达到最低要求
2. 调用 activateUser() 函数
3. 系统验证质押金额
4. 设置激活状态和时间
5. 自动检查团队等级升级
```

#### **推荐人绑定**
```javascript
function setReferrer(referrer) {
    require(referrer != msg.sender, "Cannot refer yourself");
    require(users[msg.sender].referrer == address(0), "Already has referrer");
    require(users[referrer].isActive, "Referrer not activated");
    require(!isCircularReferral(msg.sender, referrer), "Circular referral detected");
    
    users[msg.sender].referrer = referrer;
    directReferrals[referrer].push(msg.sender);
    users[referrer].directCount++;
}
```

### **4. 燃烧机制**

#### **燃烧参数**
```
推荐奖励燃烧率: 10% (referralBurnRate = 1000)
团队奖励燃烧率: 5% (teamBurnRate = 500)
燃烧地址: 0x000000000000000000000000000000000000dEaD
```

#### **燃烧执行**
```javascript
// 每次奖励分发时自动执行燃烧
uint256 burnAmount = (reward * burnRate) / 10000;
uint256 netReward = reward - burnAmount;

// 发放净奖励给用户
hcfToken.transfer(user, netReward);
// 燃烧销毁部分
hcfToken.transfer(BURN_ADDRESS, burnAmount);

emit RewardBurned(user, burnAmount, rewardType);
```

---

## 🔗 系统集成

### **1. 与HCFStaking集成**

```solidity
// HCFStaking调用推荐奖励分发
function claimRewards() external {
    uint256 reward = calculateReward(msg.sender);
    
    // 发放基础奖励
    _mintReward(msg.sender, reward);
    
    // 触发推荐奖励分发
    if (address(referralContract) != address(0)) {
        referralContract.distributeReferralRewards(msg.sender, reward);
        referralContract.distributeTeamRewards(msg.sender, reward);
    }
}
```

### **2. 与HCFRanking集成**

```javascript
// 复合奖励计算示例
总奖励 = 基础奖励 × (1 + 推荐加成 + 排名加成 + 周期倍数 + LP增强)

示例:
基础奖励: 100 HCF
推荐奖励: 100 × 20% = 20 HCF (1级推荐)
排名加成: 100 × 20% = 20 HCF (前100名)
周期倍数: 100 × 100 = 10000 HCF (周期激活)
LP增强: 100 × 4 = 400 HCF (LP用户)

用户最终收到: 100 HCF (基础)
推荐人收到: 20 HCF (推荐奖励)
周期奖励: 10000 HCF (额外)
LP增强: 400 HCF (额外)
```

---

## 📊 经济模型分析

### **1. 奖励分配比例**

```
总奖励池分配:
├─ 用户基础奖励: 60%
├─ 推荐奖励: 25% (20级分配)
├─ 团队奖励: 10% (V1-V6分配)
└─ 燃烧销毁: 5%
```

### **2. 燃烧通缩机制**

```
每日预期燃烧:
├─ 推荐奖励燃烧: 总推荐奖励的10%
├─ 团队奖励燃烧: 总团队奖励的5%
├─ 预估日燃烧量: ~1000 HCF
└─ 年化燃烧量: ~365,000 HCF (约0.037%总供应量)
```

### **3. 激励平衡分析**

```
推荐激励强度:
├─ 1级推荐20%: 强激励直推
├─ 2-5级15-10%: 中等激励建团队  
├─ 6-20级10-3%: 弱激励深度推荐
└─ 团队奖励6-36%: 超强激励大团队

经济平衡点:
├─ 推荐用户需激活质押: 防止刷量
├─ 团队业绩要求递增: 防止等级通胀
├─ 燃烧机制: 维持代币稀缺性
└─ 等级解锁: 防止快速升级
```

---

## 🧪 测试策略

### **1. 单元测试覆盖**

```javascript
✅ 推荐关系绑定测试
├─ 有效推荐人设置
├─ 无效场景拒绝 (自推荐、循环推荐)
├─ 推荐人激活状态检查
└─ 重复绑定防护

✅ 20级奖励分发测试  
├─ 奖励费率正确计算
├─ 20级链条完整分发
├─ 燃烧机制正确执行
└─ 非激活用户跳过

✅ 团队等级系统测试
├─ V1-V6等级升级条件
├─ 团队业绩递归计算
├─ 团队奖励正确分发
└─ 等级奖励差异化

✅ 激活机制测试
├─ 质押要求验证
├─ 激活状态管理
├─ 重复激活防护
└─ 激活时间记录
```

### **2. 集成测试场景**

```javascript
✅ 完整用户生命周期
└─ 注册→绑定推荐→质押→激活→获得奖励→团队升级

✅ 复合奖励计算
└─ 推荐奖励 + 排名加成 + 周期倍数 + LP增强

✅ 大规模推荐网络
└─ 1000+用户推荐网络压力测试

✅ 跨合约交互
└─ Staking ↔ Referral ↔ Ranking 无缝集成
```

---

## ⚙️ 管理员功能

### **1. 参数配置**

```solidity
// 推荐费率调整
function updateReferralRate(uint256 level, uint256 rate) external onlyOwner;

// 团队等级配置
function updateTeamLevelConfig(
    uint256 level,
    uint256 directRequirement,
    uint256 teamVolumeRequirement,
    uint256 rewardRate,
    bool unlockRequired
) external onlyOwner;

// 燃烧率调整
function updateBurnRates(uint256 _referralBurnRate, uint256 _teamBurnRate) external onlyOwner;

// 激活要求调整
function updateActivationStakeAmount(uint256 amount) external onlyOwner;
```

### **2. 查询功能**

```solidity
// 用户数据查询
function getUserData(address user) external view returns (UserData memory);

// 推荐路径查询
function getReferralPath(address user) external view returns (address[] memory);

// 潜在奖励计算
function calculatePotentialReferralReward(address user, uint256 baseReward) external view returns (uint256);
function calculatePotentialTeamReward(address user, uint256 baseReward) external view returns (uint256);
```

---

## 🔒 安全机制

### **1. 防护措施**

```
✅ 循环推荐检测: 防止A→B→C→A循环
✅ 重复激活防护: 防止重复激活刷奖励
✅ 推荐人状态验证: 只能绑定激活用户
✅ 权限控制: Owner才能修改系统参数
✅ 重入攻击防护: ReentrancyGuard保护
✅ 整数溢出防护: SafeMath和最新Solidity
```

### **2. 限制机制**

```
✅ 最大推荐等级: 20级限制 (防止无限递归)
✅ 最大团队等级: V6级限制 (防止等级通胀)
✅ 燃烧率上限: 50%最高燃烧率
✅ 奖励率上限: 推荐最高30%，团队最高50%
✅ 递归深度限制: 防止无限递归计算
```

---

## 📈 预期效果

### **1. 用户增长效应**

```
推荐激励 → 用户主动推广 → 新用户注册 → 质押激活 → 奖励分发 → 更多推广动力

预期增长:
├─ 月新增用户: +2000 (通过推荐)
├─ 活跃推荐者: 500+ (积极推荐用户)
├─ 大团队领袖: 50+ (V3+等级用户)
└─ 推荐网络深度: 平均8-12级
```

### **2. 代币经济效应**

```
燃烧通缩 → 代币稀缺性提升 → 价值提升 → 推荐激励增强 → 更多用户参与

经济循环:
├─ 日燃烧量: ~1000 HCF
├─ 月燃烧量: ~30,000 HCF  
├─ 年通缩率: ~3.65% (持续降低供应量)
└─ 价值提升: 推荐奖励实际价值增加
```

---

## 🚀 部署计划

### **1. 部署顺序**

```
第1步: 部署HCFReferral合约
第2步: 在HCFStaking中设置referralContract地址
第3步: 设置初始推荐费率和团队等级配置
第4步: 启用推荐功能
第5步: 开始推荐系统运营
```

### **2. 初始配置**

```javascript
// 推荐费率: 20级递减 (20%→2%)
// 团队等级: V1-V6 (6%→36%)
// 燃烧率: 推荐10%, 团队5%
// 激活要求: 100 HCF质押
```

---

**总结**: HCF推荐系统通过20级推荐体系和V1-V6团队等级机制，创建了强激励的用户推广网络，同时通过燃烧机制维持代币通缩，形成可持续的增长飞轮效应。

---

*本架构设计确保了推荐系统的完整性、安全性和可扩展性，为HCF项目的长期发展奠定坚实基础。*