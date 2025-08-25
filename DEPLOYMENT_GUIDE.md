# HCF DeFi 部署和使用指南

## 目录
1. [项目概述](#项目概述)
2. [快速开始](#快速开始)
3. [智能合约部署](#智能合约部署)
4. [后端部署](#后端部署)
5. [前端部署](#前端部署)
6. [运营管理](#运营管理)
7. [常见问题](#常见问题)

---

## 项目概述

HCF DeFi 是一个完全去中心化的金融平台，包含以下核心组件：

- **智能合约**: 12个合约处理所有链上逻辑
- **后端API**: Node.js服务提供数据聚合和缓存
- **前端DApp**: Web3界面供用户交互
- **管理后台**: 监控和管理工具

### 技术栈

- **区块链**: Binance Smart Chain (BSC)
- **智能合约**: Solidity 0.8.19
- **后端**: Node.js + Express + MongoDB
- **前端**: HTML5 + Web3.js
- **工具**: Hardhat, OpenZeppelin

---

## 快速开始

### 前置要求

```bash
# 安装必要工具
node --version  # 需要 v16+
npm --version   # 需要 v8+
git --version   # 需要 v2+

# 克隆项目
git clone https://github.com/yourname/hcf-defi.git
cd hcf-defi
```

### 本地开发环境

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入必要配置

# 3. 启动本地区块链（可选）
npx hardhat node

# 4. 部署合约到本地
npm run deploy:local

# 5. 启动后端
cd backend && npm run dev

# 6. 启动前端
cd frontend && npm run serve
```

---

## 智能合约部署

### 1. 准备部署账户

```javascript
// .env 文件配置
DEPLOYER_PRIVATE_KEY=你的私钥
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSCSCAN_API_KEY=你的BSCScan API密钥
```

### 2. 配置合约参数

```javascript
// scripts/deploy-config.js
module.exports = {
  // 初始参数
  buyTaxRate: 200,      // 2%
  sellTaxRate: 500,     // 5%
  transferTaxRate: 100, // 1%
  
  // 钱包地址
  marketingWallet: "0x...",
  teamWallet: "0x...",
  
  // 外部合约
  pancakeRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  bsdtToken: "0x..." // BSDT代币地址
};
```

### 3. 部署到测试网

```bash
# 部署到BSC测试网
npx hardhat run scripts/deploy.js --network testnet

# 输出示例：
# HCFToken deployed to: 0x...
# HCFStaking deployed to: 0x...
# HCFReferral deployed to: 0x...
# HCFNodeNFT deployed to: 0x...
```

### 4. 部署到主网

```bash
# 确认配置无误后部署到主网
npx hardhat run scripts/deploy.js --network mainnet

# 验证合约
npx hardhat verify --network mainnet 0x合约地址
```

### 5. 部署后配置

```javascript
// 1. 添加流动性
// 在PancakeSwap添加 HCF/BNB 交易对

// 2. 设置合约权限
await hcfToken.setStakingContract(stakingAddress);
await hcfToken.setReferralContract(referralAddress);

// 3. 初始化质押池
await hcfStaking.initializePools();

// 4. 转移所有权到多签钱包（推荐）
await hcfToken.transferOwnership(multiSigWallet);
```

---

## 后端部署

### 1. 服务器要求

- Ubuntu 20.04+ 或 CentOS 8+
- 2核 4GB RAM 最低配置
- Node.js 16+
- MongoDB 4.4+
- Nginx（反向代理）

### 2. 安装MongoDB

```bash
# Ubuntu
sudo apt-get install mongodb

# 启动MongoDB
sudo systemctl start mongodb
sudo systemctl enable mongodb
```

### 3. 部署后端服务

```bash
# 1. 上传代码到服务器
scp -r backend/ user@server:/var/www/hcf-backend

# 2. SSH连接到服务器
ssh user@server

# 3. 安装依赖
cd /var/www/hcf-backend
npm install --production

# 4. 配置环境变量
nano .env
# 填入生产环境配置

# 5. 使用PM2管理进程
npm install -g pm2
pm2 start src/app.js --name hcf-backend
pm2 save
pm2 startup
```

### 4. Nginx配置

```nginx
# /etc/nginx/sites-available/hcf-api
server {
    listen 80;
    server_name api.hcf-defi.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5. SSL配置（使用Let's Encrypt）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.hcf-defi.com
```

---

## 前端部署

### 1. 更新配置

```javascript
// frontend/js/config.js
const CONFIG = {
  // 更新为主网合约地址
  contracts: {
    HCFToken: "0x实际部署地址",
    HCFStaking: "0x实际部署地址",
    HCFReferral: "0x实际部署地址",
    HCFNodeNFT: "0x实际部署地址"
  },
  
  // API端点
  apiUrl: "https://api.hcf-defi.com",
  
  // 网络配置
  chainId: 56, // BSC主网
  rpcUrl: "https://bsc-dataseed.binance.org/"
};
```

### 2. 构建前端

```bash
# 如果使用构建工具
npm run build

# 生成静态文件
# dist/ 或 build/ 目录
```

### 3. 部署到CDN或服务器

#### 选项A: 使用Cloudflare Pages

```bash
# 1. 推送到GitHub
git push origin main

# 2. 在Cloudflare Pages连接仓库
# 3. 设置构建命令和输出目录
# 4. 自动部署
```

#### 选项B: 使用Nginx

```nginx
# /etc/nginx/sites-available/hcf-dapp
server {
    listen 80;
    server_name app.hcf-defi.com;
    root /var/www/hcf-frontend;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # 缓存静态资源
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 4. IPFS部署（可选）

```bash
# 安装IPFS
npm install -g ipfs-deploy

# 部署到IPFS
ipfs-deploy -p pinata frontend/
```

---

## 运营管理

### 1. 日常运营任务

#### 监控检查清单

- [ ] 检查合约余额和流动性
- [ ] 监控异常交易和价格波动
- [ ] 查看系统告警和错误日志
- [ ] 检查节点在线状态
- [ ] 审核用户反馈和问题

#### 参数调整指南

```javascript
// 链上参数调整（需要Owner权限）
// 1. 连接Owner钱包
// 2. 访问 contract-manager.html
// 3. 选择要修改的参数
// 4. 发送交易并支付Gas费

// 链下参数调整（管理后台）
// 1. 登录管理后台
// 2. 进入参数管理
// 3. 修改链下参数
// 4. 保存更改（立即生效）
```

### 2. 应急响应流程

#### 价格异常波动

```javascript
// 1. 检查是否触发防暴跌机制
const isInterventionActive = await marketControl.interventionActive();

// 2. 如需手动干预
await marketControl.triggerIntervention({ from: owner });

// 3. 调整税率稳定市场
await hcfToken.setSellTaxRate(1000); // 临时提高到10%
```

#### 安全事件响应

1. **立即暂停相关功能**
```javascript
await hcfToken.pause(); // 暂停代币转账
await hcfStaking.pauseStaking(); // 暂停质押
```

2. **通知社区**
- 发布公告说明情况
- 更新前端维护模式

3. **修复和恢复**
- 部署修复合约
- 迁移用户数据
- 逐步恢复功能

### 3. 数据备份

```bash
# MongoDB备份
mongodump --db hcf_defi --out /backup/$(date +%Y%m%d)

# 自动备份脚本
0 2 * * * /usr/bin/mongodump --db hcf_defi --out /backup/$(date +\%Y\%m\%d)

# 备份到云存储
aws s3 sync /backup s3://hcf-backups/
```

---

## 常见问题

### Q1: 用户无法连接钱包？

**解决方案**:
1. 确认用户安装了MetaMask
2. 检查网络是否为BSC主网
3. 清除浏览器缓存
4. 尝试其他钱包（TrustWallet等）

### Q2: 交易失败怎么办？

**可能原因**:
- Gas费不足
- 滑点设置太低
- 余额不足
- 合约暂停

**解决步骤**:
```javascript
// 检查用户余额
const balance = await hcfToken.balanceOf(userAddress);

// 检查授权
const allowance = await hcfToken.allowance(userAddress, spenderAddress);

// 增加Gas费
const tx = await contract.method({ gasPrice: web3.utils.toWei('10', 'gwei') });
```

### Q3: 如何处理合约升级？

**升级流程**:
1. 部署新合约
2. 暂停旧合约
3. 迁移必要数据
4. 更新前端合约地址
5. 通知用户迁移

### Q4: 节点申请失败？

**检查项**:
- BSDT余额 >= 5000
- 节点名额是否已满
- BSDT授权是否充足
- 交易Gas费是否足够

### Q5: 质押收益计算错误？

**验证方法**:
```javascript
// 获取用户质押信息
const stakeInfo = await staking.getUserStakeInfo(address, poolId);

// 计算预期收益
const dailyRate = await staking.poolRates(poolId);
const expectedReward = stakeInfo.amount * dailyRate / 10000;

// 对比实际收益
const actualReward = await staking.getPendingRewards(address);
```

---

## 技术支持

### 开发资源

- **源代码**: https://github.com/hcf-defi
- **文档**: https://docs.hcf-defi.com
- **API文档**: https://api.hcf-defi.com/docs

### 社区支持

- **Discord**: https://discord.gg/hcf-defi
- **Telegram**: https://t.me/hcf_defi
- **Twitter**: https://twitter.com/hcf_defi

### 报告问题

- **GitHub Issues**: https://github.com/hcf-defi/issues
- **Email**: support@hcf-defi.com
- **Bug Bounty**: security@hcf-defi.com

---

## 更新日志

### v1.0.0 (2024-01-15)
- 初始版本发布
- 核心功能实现
- 智能合约部署

### 计划功能
- [ ] 移动端应用
- [ ] 多链支持
- [ ] DAO治理
- [ ] 更多DeFi功能

---

**免责声明**: HCF DeFi是去中心化协议，用户需自行承担使用风险。请谨慎投资，做好风险管理。