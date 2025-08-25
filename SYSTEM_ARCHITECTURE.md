# HCF DeFi 系统架构与功能清单

## 🏗️ 系统架构图

```
┌─────────────────────────────────────────────────────────┐
│                     用户界面层                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  DApp    │  │  管理后台  │  │  移动端   │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
└───────┼─────────────┼─────────────┼────────────────────┘
        │             │             │
        ▼             ▼             ▼
┌─────────────────────────────────────────────────────────┐
│                    中间层 (API)                          │
│  ┌──────────────────────────────────────────┐          │
│  │         Node.js Backend API              │          │
│  │  ├─ 数据聚合                             │          │
│  │  ├─ 缓存优化                             │          │
│  │  └─ 管理功能                             │          │
│  └────────────┬─────────────────────────────┘          │
└───────────────┼─────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────┐
│                  区块链层 (BSC)                          │
│  ┌──────────────────────────────────────────┐          │
│  │           智能合约集群                     │          │
│  │  ├─ HCFToken (代币)                      │          │
│  │  ├─ HCFStaking (质押)                    │          │
│  │  ├─ HCFReferral (推荐)                   │          │
│  │  ├─ HCFNodeNFT (节点)                    │          │
│  │  ├─ HCFBSDTExchange (桥接)               │          │
│  │  └─ HCFMarketControl (调控)              │          │
│  └──────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

## 📊 功能分类清单

### 1. 🔗 纯链上功能（不需要后端）

#### 1.1 用户可直接调用
| 功能 | 合约 | 函数 | Gas费 | 说明 |
|------|------|------|-------|------|
| 转账HCF | HCFToken | transfer() | ~0.001 BNB | 包含1%转账税 |
| 买入HCF | PancakeSwap | swapBNBForTokens() | ~0.003 BNB | 2%买入税 |
| 卖出HCF | PancakeSwap | swapTokensForBNB() | ~0.003 BNB | 5%卖出税 |
| 质押HCF | HCFStaking | stake(poolId, amount) | ~0.002 BNB | 选择0-4池 |
| 提取本金 | HCFStaking | withdraw(poolId, amount) | ~0.002 BNB | 随时可取 |
| 领取收益 | HCFStaking | claimRewards() | ~0.001 BNB | 每日可领 |
| 绑定推荐人 | HCFReferral | bindReferrer(address) | ~0.001 BNB | 只能绑定一次 |
| 申请节点 | HCFNodeNFT | applyForNode() | ~0.003 BNB | 需5000 BSDT |
| 激活节点 | HCFNodeNFT | activateNode(nodeId) | ~0.002 BNB | 需1000 HCF+LP |
| 领取节点分红 | HCFNodeNFT | claimNodeRewards() | ~0.001 BNB | 按算力分配 |
| HCF换BSDT | HCFBSDTExchange | swapHCFToBSDT(amount) | ~0.002 BNB | 1:1兑换 |
| BSDT换HCF | HCFBSDTExchange | swapBSDTToHCF(amount) | ~0.002 BNB | 1:1兑换 |

#### 1.2 只有Owner可调用
| 功能 | 合约 | 函数 | 权限 | 说明 |
|------|------|------|------|------|
| 设置买入税 | HCFToken | setBuyTaxRate(rate) | Owner | 最高10% |
| 设置卖出税 | HCFToken | setSellTaxRate(rate) | Owner | 最高10% |
| 设置转账税 | HCFToken | setTransferTaxRate(rate) | Owner | 最高10% |
| 更新日化率 | HCFStaking | updateLevelRates(rates[]) | Owner | 5个池的率 |
| 设置LP倍数 | HCFStaking | setLPMultiplier(multi) | Owner | LP奖励倍数 |
| 设置推荐奖励 | HCFReferral | setReferralRates(rates[]) | Owner | 20级奖励 |
| 设置团队奖励 | HCFReferral | setTeamRates(rates[]) | Owner | V1-V6奖励 |
| 设置节点费用 | HCFNodeNFT | setApplicationFee(fee) | Owner | BSDT费用 |
| 触发市场干预 | HCFMarketControl | triggerIntervention() | Owner | 防暴跌 |
| 提取营销资金 | HCFToken | withdrawMarketing(amount) | Owner | 营销钱包 |

### 2. 💾 需要后端支持的功能

#### 2.1 数据查询类（优化性能）
| 功能 | API路径 | 用途 | 缓存时间 |
|------|---------|------|----------|
| 用户统计 | GET /api/users/stats | 总用户数、质押量等 | 5分钟 |
| 质押排名 | GET /api/ranking/staking | Top 100质押者 | 10分钟 |
| 推荐排名 | GET /api/ranking/referral | Top 100推荐者 | 10分钟 |
| 节点排名 | GET /api/ranking/nodes | 节点算力排名 | 10分钟 |
| 交易历史 | GET /api/users/:address/txs | 用户交易记录 | 1分钟 |
| 收益记录 | GET /api/users/:address/rewards | 历史收益 | 5分钟 |
| 价格数据 | GET /api/price/hcf | HCF实时价格 | 30秒 |
| TVL数据 | GET /api/stats/tvl | 总锁仓价值 | 5分钟 |

#### 2.2 管理功能类（需要权限）
| 功能 | API路径 | 权限 | 用途 |
|------|---------|------|------|
| 管理员登录 | POST /api/auth/login | Public | 获取JWT |
| 查看仪表盘 | GET /api/operational/dashboard | Admin | 数据总览 |
| 发布公告 | POST /api/announcement/create | Admin | 前端公告 |
| 设置维护模式 | POST /api/settings/maintenance | Admin | 暂停前端 |
| 导出数据 | GET /api/export/users | Admin | Excel导出 |
| 查看日志 | GET /api/logs | Admin | 系统日志 |
| 监控告警 | GET /api/monitoring/alerts | Admin | 异常提醒 |

### 3. 🎨 纯前端功能

#### 3.1 钱包交互
| 功能 | 实现方式 | 库/工具 |
|------|----------|---------|
| 连接钱包 | Web3Modal | web3modal |
| 切换网络 | wallet_switchEthereumChain | ethers.js |
| 添加代币 | wallet_watchAsset | MetaMask API |
| 签名消息 | personal_sign | ethers.js |
| 监听事件 | contract.on('event') | ethers.js |

#### 3.2 本地功能
| 功能 | 存储位置 | 用途 |
|------|----------|------|
| 主题切换 | localStorage | 深色/浅色模式 |
| 语言切换 | localStorage | 中/英文 |
| 滑点设置 | localStorage | 交易滑点容忍度 |
| 历史记录 | IndexedDB | 交易历史缓存 |
| 收藏地址 | localStorage | 常用地址簿 |

## 🔄 核心业务流程

### 流程1：新用户入场
```
1. 用户访问DApp
2. 连接MetaMask钱包
3. 切换到BSC网络
4. 在PancakeSwap购买HCF（2%税）
5. 选择质押池(0-4)
6. 调用stake()函数质押
7. 每日claim()领取收益
8. 可选：申请节点（需5000 BSDT）
```

### 流程2：推荐关系建立
```
1. 老用户分享推荐链接
2. 新用户点击链接
3. 新用户连接钱包
4. 调用bindReferrer()绑定
5. 新用户质押后
6. 推荐奖励自动分配（20级）
7. 达到条件升级团队等级(V1-V6)
```

### 流程3：节点运营
```
1. 准备5000 BSDT
2. 调用applyForNode()申请
3. 获得节点NFT
4. 准备1000 HCF + 1000 LP
5. 调用activateNode()激活
6. 开始获得4种分红：
   - 滑点分红
   - 手续费分红
   - 质押池2%
   - 防暴跌收益
7. 定期claim()领取
```

### 流程4：管理员操作
```
1. 访问/admin后台
2. 输入账号密码登录
3. 查看数据仪表盘
4. 如需修改链上参数：
   a. 退出后台
   b. 打开BSCScan
   c. 连接Owner钱包
   d. 调用对应函数
   e. 支付Gas费
   f. 等待确认
5. 如需修改链下参数：
   a. 在后台直接修改
   b. 点击保存
   c. 立即生效
```

## 📝 部署检查清单

### 合约部署前
- [ ] 设置正确的Owner地址
- [ ] 配置初始税率(2%/5%/1%)
- [ ] 设置营销钱包地址
- [ ] 配置PancakeSwap路由地址
- [ ] 设置BSDT代币地址

### 合约部署后
- [ ] 验证合约代码
- [ ] 添加初始流动性
- [ ] 设置合理的日化率
- [ ] 配置推荐奖励比例
- [ ] 转移Owner到多签钱包

### 后端部署
- [ ] 配置MongoDB连接
- [ ] 设置JWT密钥
- [ ] 配置BSC RPC节点
- [ ] 设置合约地址
- [ ] 启动定时任务

### 前端部署
- [ ] 配置合约ABI
- [ ] 设置合约地址
- [ ] 配置API端点
- [ ] 设置网络ID(56)
- [ ] 测试钱包连接

## 🚀 快速开始

### 本地开发
```bash
# 1. 克隆项目
git clone https://github.com/yourname/hcf-defi.git

# 2. 安装依赖
cd contracts && npm install
cd ../backend && npm install
cd ../frontend && npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑.env文件

# 4. 部署合约（测试网）
cd contracts
npx hardhat run scripts/deploy.js --network testnet

# 5. 启动后端
cd backend
npm run dev

# 6. 启动前端
cd frontend
npm start
```

### 生产部署
```bash
# 1. 部署合约到主网
npx hardhat run scripts/deploy.js --network mainnet

# 2. 验证合约
npx hardhat verify --network mainnet CONTRACT_ADDRESS

# 3. 部署后端(PM2)
pm2 start npm --name "hcf-backend" -- start

# 4. 部署前端(Nginx)
npm run build
cp -r build/* /var/www/html/
```

## 📞 技术支持

- 文档: https://docs.hcf-defi.com
- Discord: https://discord.gg/hcf-defi
- Telegram: https://t.me/hcf_defi
- Email: support@hcf-defi.com

---

最后更新: 2024-01-15