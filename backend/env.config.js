# HCF Backend Environment Configuration Template
# Copy this file to .env and fill in your values

# 服务器配置
PORT=3001
NODE_ENV=development

# 数据库配置
MONGO_URI=mongodb://localhost:27017/hcf_defi

# BSC网络配置
BSC_RPC=https://bsc-dataseed1.binance.org/
BSC_CHAIN_ID=56
BSC_EXPLORER=https://bscscan.com

# 合约地址 (从部署脚本获取)
HCF_TOKEN_ADDRESS=
HCF_STAKING_ADDRESS=
HCF_REFERRAL_ADDRESS=
HCF_NODE_NFT_ADDRESS=
HCF_MARKET_CONTROL_ADDRESS=

# 多签钱包
MULTISIG_ADDRESS=
MULTISIG_OWNERS=

# JWT密钥
JWT_SECRET=hcf_defi_jwt_secret_key_2025

# 监控配置
ALERT_WEBHOOK=
EMAIL_SERVICE=gmail
EMAIL_USER=
EMAIL_PASS=

# Redis配置
REDIS_URL=redis://localhost:6379
