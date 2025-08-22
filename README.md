# HCF DeFi Project

RWA-backed DeFi application with staking, referral rewards, and node mining.

## 项目概述
- **HCF代币**: 总量10亿，首发1000万，销毁至99万
- **BSDT稳定币**: 已上线，1:1锁定底池
- **质押系统**: 5等级收益，双循环机制
- **推荐奖励**: 20代推荐，团队激励
- **节点挖矿**: 99个节点，算力分红
- **兑换桥接**: HCF-USDT-USDC互换

## 项目结构
```
hcf-project/
├── contracts/     # 智能合约 (Hardhat)
├── backend/       # API服务器 (Node.js)
├── frontend/      # DApp界面 (React)
├── docs/          # 项目文档
└── scripts/       # 部署脚本
```

## 环境要求
- Node.js >= 18.x ✅ (当前: v20.13.1)
- npm >= 8.x ✅ (当前: v10.5.2) 
- Git ✅ (当前: v2.50.1)

## 快速开始
1. 安装依赖: `npm run setup`
2. 配置环境变量: 复制 `.env.example` 为 `.env`
3. 启动开发环境:
   - 合约: `npm run dev:contracts`
   - 后端: `npm run dev:backend`
   - 前端: `npm run dev:frontend`

## 开发阶段
- [x] 项目初始化和环境配置
- [ ] 智能合约开发 (HCF代币、质押、推荐、节点)
- [ ] 后端API开发
- [ ] 前端DApp开发
- [ ] 测试和部署

## 技术栈
- **智能合约**: Solidity, Hardhat, OpenZeppelin
- **后端**: Node.js, Express, MongoDB
- **前端**: React, TypeScript, Web3.js
- **区块链**: BSC (Binance Smart Chain)