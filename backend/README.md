# HCF DeFi Backend API

## 项目概述

HCF DeFi后端API系统，提供完整的DeFi生态系统数据服务和管理功能。

## 功能特性

- ✅ 智能合约数据桥接
- ✅ 用户管理和推荐系统
- ✅ 排名计算和奖励系统
- ✅ 参数管理和多签确认
- ✅ 监控警报和数据分析
- ✅ KYC验证和合规管理

## 技术栈

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: MongoDB + Mongoose
- **Blockchain**: Ethers.js (BSC)
- **Security**: JWT + Rate Limiting
- **Monitoring**: Winston + Node-cron

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 环境配置

复制 `env.config.js` 到 `.env` 并填写配置：

```bash
cp env.config.js .env
# 编辑 .env 文件
```

### 3. 启动开发服务器

```bash
npm run dev
```

### 4. 构建生产版本

```bash
npm run build
npm start
```

## API端点

### 参数管理
- `GET /api/parameters` - 获取参数列表
- `PUT /api/parameters/:key` - 更新参数

### 排名系统
- `GET /api/ranking/personal/:wallet` - 获取个人排名
- `GET /api/ranking/list` - 获取排名列表

### 运营管理
- `POST /api/operational/kyc/verify` - KYC验证
- `GET /api/operational/analysis` - 数据分析
- `GET /api/operational/monitoring/alerts` - 监控警报

## 项目结构

```
backend/
├── src/
│   ├── models/           # 数据模型
│   ├── routes/           # API路由
│   ├── controllers/      # 业务逻辑
│   ├── middleware/       # 中间件
│   ├── utils/            # 工具函数
│   ├── config/           # 配置文件
│   ├── types/            # TypeScript类型定义
│   └── app.ts            # 主应用文件
├── admin/                # 后台管理面板
├── tests/                # 测试文件
├── package.json
├── tsconfig.json
└── README.md
```

## 开发指南

### 添加新路由

1. 在 `src/routes/` 创建路由文件
2. 在 `src/controllers/` 创建控制器
3. 在 `src/app.ts` 中注册路由

### 添加新模型

1. 在 `src/models/` 创建模型文件
2. 定义Schema和接口
3. 添加必要的索引

### 测试

```bash
npm test              # 运行所有测试
npm run test:watch    # 监听模式
```

## 部署

### 本地部署

```bash
npm run build
npm start
```

### 服务器部署

```bash
# 使用PM2
pm2 start dist/app.js --name hcf-backend

# 使用Docker
docker build -t hcf-backend .
docker run -p 3001:3001 hcf-backend
```

## 监控和日志

- 健康检查: `GET /health`
- 日志级别: 通过环境变量 `LOG_LEVEL` 控制
- 监控端点: 通过 `/api/monitoring` 访问

## 安全特性

- JWT身份验证
- 请求限流
- 权限控制
- 多签确认
- 输入验证

## 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 创建Pull Request

## 许可证

MIT License
