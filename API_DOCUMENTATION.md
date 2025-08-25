# HCF DeFi API 文档

## 概述

HCF DeFi 后端API提供数据聚合、缓存优化和管理功能。所有链上参数修改必须通过智能合约交易完成，后端仅负责读取和展示。

**基础URL**: `http://localhost:3001/api`

## 认证

管理员接口需要JWT认证：

```javascript
headers: {
  'Authorization': 'Bearer <token>'
}
```

## API 端点

### 1. 用户认证

#### POST /auth/login
管理员登录

**请求体**:
```json
{
  "username": "admin",
  "password": "password123"
}
```

**响应**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "username": "admin",
    "role": "admin"
  }
}
```

---

### 2. 用户数据

#### GET /users/stats
获取平台用户统计

**响应**:
```json
{
  "totalUsers": 1234,
  "activeUsers": 567,
  "totalStaked": "10000000",
  "totalVolume24h": "500000",
  "timestamp": "2024-01-15T10:00:00Z"
}
```

#### GET /users/:address
获取用户详细信息

**参数**:
- `address`: 用户钱包地址

**响应**:
```json
{
  "address": "0xABCD...1234",
  "balances": {
    "hcf": "10000",
    "bsdt": "5000",
    "bnb": "2.5"
  },
  "staking": {
    "total": "8000",
    "pools": [
      {
        "poolId": 2,
        "amount": "8000",
        "pendingRewards": "45.6",
        "lpMode": false
      }
    ]
  },
  "referral": {
    "referrer": "0x1234...5678",
    "directCount": 5,
    "teamSize": 123,
    "teamLevel": 3
  },
  "node": {
    "hasNode": true,
    "nodeId": 42,
    "isActive": true,
    "power": 100
  }
}
```

#### GET /users/:address/transactions
获取用户交易历史

**参数**:
- `address`: 用户钱包地址
- `limit`: 返回数量限制（默认20）
- `offset`: 偏移量（默认0）

**响应**:
```json
{
  "transactions": [
    {
      "txHash": "0xabc...",
      "type": "stake",
      "amount": "1000",
      "timestamp": "2024-01-15T09:30:00Z",
      "status": "success"
    }
  ],
  "total": 150
}
```

---

### 3. 排名系统

#### GET /ranking/staking
获取质押排名

**参数**:
- `limit`: 返回数量（默认100）

**响应**:
```json
{
  "rankings": [
    {
      "rank": 1,
      "address": "0x9876...5432",
      "amount": "500000",
      "percentage": "5.2"
    }
  ],
  "lastUpdate": "2024-01-15T10:00:00Z"
}
```

#### GET /ranking/referral
获取推荐排名

**响应**:
```json
{
  "rankings": [
    {
      "rank": 1,
      "address": "0x5432...9876",
      "directReferrals": 50,
      "teamSize": 500,
      "teamLevel": "V6"
    }
  ]
}
```

#### GET /ranking/nodes
获取节点排名

**响应**:
```json
{
  "rankings": [
    {
      "rank": 1,
      "nodeId": 1,
      "owner": "0x1357...2468",
      "power": 100,
      "totalRewards": "10000"
    }
  ]
}
```

---

### 4. 节点管理

#### GET /nodes
获取所有节点信息

**响应**:
```json
{
  "totalNodes": 89,
  "maxNodes": 99,
  "activeNodes": 85,
  "nodes": [
    {
      "id": 1,
      "owner": "0xABCD...1234",
      "isActive": true,
      "power": 100,
      "activationTime": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### GET /nodes/:id
获取特定节点信息

**响应**:
```json
{
  "id": 1,
  "owner": "0xABCD...1234",
  "isActive": true,
  "power": 100,
  "rewards": {
    "total": "10000",
    "claimed": "8000",
    "pending": "2000"
  }
}
```

---

### 5. 参数管理（仅链下参数）

#### GET /parameters
获取所有可配置参数

**需要认证**: 是

**响应**:
```json
{
  "offchain": {
    "maintenance_mode": false,
    "announcement": "欢迎来到HCF DeFi",
    "min_display_amount": "0.001",
    "max_tx_display": 100,
    "refresh_interval": 5
  },
  "onchain_readonly": {
    "buyTaxRate": "2",
    "sellTaxRate": "5",
    "transferTaxRate": "1",
    "note": "链上参数只读，修改需通过合约"
  }
}
```

#### POST /parameters/update
更新链下参数

**需要认证**: 是

**请求体**:
```json
{
  "key": "maintenance_mode",
  "value": true,
  "reason": "系统维护"
}
```

**响应**:
```json
{
  "success": true,
  "message": "参数已更新",
  "note": "仅影响前端显示"
}
```

---

### 6. 监控告警

#### GET /monitoring/alerts
获取系统告警

**需要认证**: 是

**响应**:
```json
{
  "alerts": [
    {
      "id": "alert_001",
      "level": "critical",
      "type": "price_drop",
      "message": "HCF价格5分钟内下跌超过10%",
      "timestamp": "2024-01-15T10:00:00Z",
      "resolved": false
    }
  ],
  "summary": {
    "critical": 3,
    "warning": 7,
    "info": 15
  }
}
```

#### POST /monitoring/alerts/:id/resolve
处理告警

**需要认证**: 是

**请求体**:
```json
{
  "action": "acknowledged",
  "note": "已通知技术团队"
}
```

---

### 7. 运营数据

#### GET /operational/dashboard
获取运营仪表盘数据

**需要认证**: 是

**响应**:
```json
{
  "metrics": {
    "tvl": "50000000",
    "dailyVolume": "1000000",
    "dailyTransactions": 5432,
    "priceUSD": "0.05",
    "marketCap": "50000000",
    "circulatingSupply": "500000000"
  },
  "charts": {
    "stakingTrend": [...],
    "volumeTrend": [...],
    "userGrowth": [...]
  }
}
```

#### GET /operational/export
导出数据

**需要认证**: 是

**参数**:
- `type`: 导出类型 (users|transactions|staking)
- `format`: 格式 (csv|json)
- `startDate`: 开始日期
- `endDate`: 结束日期

**响应**: 文件下载

---

### 8. 市场控制

#### GET /controls/status
获取市场控制状态

**需要认证**: 是

**响应**:
```json
{
  "antiDumpEnabled": true,
  "lastIntervention": "2024-01-15T08:00:00Z",
  "interventionCount": 3,
  "parameters": {
    "maxSellPercentage": "5",
    "cooldownPeriod": "3600"
  }
}
```

---

## 错误响应

所有错误响应格式：

```json
{
  "success": false,
  "error": "错误描述",
  "code": "ERROR_CODE"
}
```

常见错误码：
- `UNAUTHORIZED`: 未授权
- `INVALID_PARAMS`: 参数无效
- `NOT_FOUND`: 资源不存在
- `RATE_LIMITED`: 请求频率限制
- `INTERNAL_ERROR`: 服务器内部错误

---

## WebSocket 实时数据

连接地址: `ws://localhost:3001/ws`

### 订阅事件

```javascript
// 订阅价格更新
socket.emit('subscribe', { channel: 'price' });

// 订阅用户数据
socket.emit('subscribe', { 
  channel: 'user', 
  address: '0xABCD...1234' 
});
```

### 接收数据

```javascript
socket.on('price_update', (data) => {
  console.log('价格更新:', data.price);
});

socket.on('user_update', (data) => {
  console.log('用户数据更新:', data);
});
```

---

## 使用示例

### JavaScript/Fetch

```javascript
// 登录获取token
const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    username: 'admin',
    password: 'password123'
  })
});

const { token } = await loginResponse.json();

// 使用token访问受保护接口
const dashboardResponse = await fetch('http://localhost:3001/api/operational/dashboard', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const dashboardData = await dashboardResponse.json();
```

### cURL

```bash
# 登录
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'

# 获取用户统计
curl http://localhost:3001/api/users/stats

# 获取排名（带认证）
curl http://localhost:3001/api/ranking/staking \
  -H "Authorization: Bearer <token>"
```

---

## 注意事项

1. **链上参数只读**: 所有智能合约参数（税率、日化率等）只能通过区块链交易修改，API仅提供读取功能

2. **缓存策略**: 
   - 用户统计: 5分钟
   - 排名数据: 10分钟
   - 价格数据: 30秒
   - 交易历史: 1分钟

3. **限流规则**:
   - 普通接口: 100次/15分钟
   - 认证接口: 200次/15分钟
   - WebSocket: 10个并发连接/IP

4. **数据同步**: 
   - 链上数据通过定时任务同步
   - 关键数据实时监听区块链事件

5. **安全建议**:
   - 生产环境使用HTTPS
   - 定期更换JWT密钥
   - 实施IP白名单（管理接口）
   - 启用CORS限制

---

## 版本历史

- **v1.0.0** (2024-01-15): 初始版本
  - 基础API功能
  - 用户数据查询
  - 排名系统
  - 管理功能

---

## 联系支持

- 技术文档: https://docs.hcf-defi.com/api
- GitHub: https://github.com/hcf-defi/backend
- 技术支持: dev@hcf-defi.com