# 🚀 HCF DeFi 生产部署指南

**版本**: v1.0  
**部署日期**: 2025年8月22日  
**目标网络**: BSC 主网/测试网

---

## 📋 部署前检查清单

### ✅ **必备条件**
- [ ] **新钱包准备**: 生成全新的钱包地址和私钥
- [ ] **BNB余额**: 至少0.5 BNB用于合约部署和初始交易
- [ ] **环境安全**: 确保私钥只存储在安全的服务器环境
- [ ] **网络配置**: 验证BSC RPC连接稳定

### ⚠️ **安全要求**
- [ ] **私钥管理**: 绝对不要将真实私钥提交到任何代码仓库
- [ ] **环境变量**: 使用`.env`文件管理敏感配置
- [ ] **权限控制**: 确保部署钱包只用于合约管理

---

## 🔧 环境配置

### 1. **创建安全的.env文件**
```bash
# 在服务器创建 .env 文件 (不要添加到Git)
cd /your/secure/server/path/hcf-project/contracts

cat > .env << 'EOF'
# 🔐 生产环境配置 - 请使用真实值替换
PRIVATE_KEY=your_new_wallet_private_key_here
BSC_RPC_URL=https://bsc-dataseed.binance.org
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545

# 合约地址 - 部署后更新
BSDT_CONTRACT_ADDRESS=0xCaE20256ec5E5a56c9c84A668377A77b7544482b
USDC_CONTRACT_ADDRESS=0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d
HCF_CONTRACT_ADDRESS=will_be_deployed

# 钱包地址配置
MARKETING_WALLET=your_marketing_wallet_address
LP_WALLET=your_lp_wallet_address  
NODE_WALLET=your_node_wallet_address
EOF
```

### 2. **验证Hardhat配置**
```javascript
// hardhat.config.js 确保使用环境变量
require('dotenv').config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error("请在.env文件中设置PRIVATE_KEY");
}
```

---

## 🚀 部署步骤

### **Phase 1: 测试网部署** (推荐先执行)

```bash
# 1. 切换到合约目录
cd /your/server/path/hcf-project/contracts

# 2. 安装依赖
npm install

# 3. 编译合约
npx hardhat compile

# 4. 部署到BSC测试网
npx hardhat run scripts/deploy.js --network bsc_testnet

# 5. 验证部署结果
npx hardhat verify --network bsc_testnet CONTRACT_ADDRESS \"BSDT_ADDRESS\" \"MARKETING_ADDRESS\" \"LP_ADDRESS\" \"NODE_ADDRESS\"
```

### **Phase 2: 主网部署**

```bash
# ⚠️ 确认测试网验证无误后执行
npx hardhat run scripts/deploy.js --network bsc_mainnet

# 验证合约
npx hardhat verify --network bsc_mainnet CONTRACT_ADDRESS \"BSDT_ADDRESS\" \"MARKETING_ADDRESS\" \"LP_ADDRESS\" \"NODE_ADDRESS\"
```

---

## 📝 部署脚本示例

创建 `scripts/deploy.js`:

```javascript
const { ethers } = require(\"hardhat\");

async function main() {
  console.log(\"🚀 开始部署HCF DeFi合约...\");
  
  const [deployer] = await ethers.getSigners();
  console.log(\"部署账户:\", deployer.address);
  console.log(\"账户余额:\", ethers.utils.formatEther(await deployer.getBalance()), \"BNB\");

  // 钱包地址配置
  const bsdtAddress = process.env.BSDT_CONTRACT_ADDRESS;
  const marketingWallet = process.env.MARKETING_WALLET;
  const lpWallet = process.env.LP_WALLET;
  const nodeWallet = process.env.NODE_WALLET;

  // 部署HCF Token
  const HCFToken = await ethers.getContractFactory(\"HCFToken\");
  const hcfToken = await HCFToken.deploy(
    bsdtAddress,
    marketingWallet,
    lpWallet,
    nodeWallet
  );
  await hcfToken.deployed();
  console.log(\"✅ HCF Token 部署成功:\", hcfToken.address);

  // 部署HCF Staking
  const HCFStaking = await ethers.getContractFactory(\"HCFStaking\");
  const hcfStaking = await HCFStaking.deploy(
    hcfToken.address,
    bsdtAddress,
    process.env.USDC_CONTRACT_ADDRESS
  );
  await hcfStaking.deployed();
  console.log(\"✅ HCF Staking 部署成功:\", hcfStaking.address);

  // 初始化设置
  await hcfToken.enableTrading();
  console.log(\"✅ 交易已启用\");

  console.log(\"\\n📋 部署总结:\");
  console.log(\"HCF Token:\", hcfToken.address);
  console.log(\"HCF Staking:\", hcfStaking.address);
  console.log(\"🎉 部署完成!\");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

---

## ⚡ 部署后验证

### **功能验证清单**
```bash
# 1. 验证Token基础信息
npx hardhat console --network bsc_mainnet
> const token = await ethers.getContractAt(\"HCFToken\", \"YOUR_TOKEN_ADDRESS\")
> await token.name()  // 应该返回 \"HCF Token\"
> await token.totalSupply()  // 应该返回 10000000000000000000000000 (10M HCF)

# 2. 验证税费设置
> await token.buyTaxRate()  // 应该返回 200 (2%)
> await token.sellTaxRate() // 应该返回 500 (5%)

# 3. 验证钱包地址
> await token.marketingWallet() // 应该返回你设置的营销钱包地址
```

### **安全检查**
- [ ] 验证Owner权限正确设置
- [ ] 确认税费分配地址正确
- [ ] 测试基础转账功能
- [ ] 验证质押合约连接正常

---

## 🛡️ 生产环境安全指南

### **1. 服务器安全**
```bash
# 设置文件权限
chmod 600 .env
chmod 700 contracts/

# 定期备份私钥(离线存储)
cp .env backup_$(date +%Y%m%d).env
```

### **2. 监控设置**
```bash
# 设置钱包余额监控
# 创建脚本监控异常交易
# 设置Gas价格警报
```

### **3. 应急响应**
```bash
# 如发现异常，立即执行:
# 1. 暂停交易: hcfToken.pauseTrading()
# 2. 暂停质押: hcfStaking.pauseStaking() 
# 3. 转移资金到安全钱包
```

---

## 📊 Gas费用预估

| 操作 | Gas消耗 | 成本(5 Gwei) |
|------|---------|-------------|
| **合约部署** | ~2,000,000 | ~0.01 BNB |
| **启用交易** | ~50,000 | ~0.00025 BNB |
| **普通转账** | ~180,000 | ~0.0009 BNB |
| **质押操作** | ~150,000 | ~0.00075 BNB |

**建议准备**: 0.5 BNB用于部署和初始操作

---

## 🔄 升级和维护

### **定期维护任务**
- [ ] **每周**: 检查合约余额和税费收集情况
- [ ] **每月**: 验证质押奖励计算准确性  
- [ ] **季度**: 进行安全审计和代码review

### **升级准备**
- 保留旧版本合约备份
- 准备用户迁移方案
- 测试新功能兼容性

---

## 📞 支持和联系

### **技术支持**
- **合约问题**: 检查BSCScan上的交易记录
- **Gas优化**: 监控网络拥堵情况调整Gas价格
- **安全事件**: 立即暂停相关功能并分析

### **监控工具**
- **BSCScan**: https://bscscan.com
- **DeFiPulse**: 监控TVL和用户活跃度
- **Telegram Bot**: 设置交易和异常监控

---

## ✅ 部署成功确认

部署完成后，请确认以下信息并妥善保存：

```
🎯 HCF DeFi 部署信息
========================
网络: BSC Mainnet
HCF Token: 0x... 
HCF Staking: 0x...
部署钱包: 0x...
部署时间: 2025-08-22
初始供应: 10,000,000 HCF
部署成本: X.XX BNB

⚠️ 请将此信息安全保存并备份!
```

**🎉 恭喜！HCF DeFi 项目已成功部署到生产环境！**

---
*本指南包含完整的生产部署流程，请严格按照安全要求执行每个步骤。*