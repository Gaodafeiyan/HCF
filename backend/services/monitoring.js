// Monitoring and Alert System
const EventEmitter = require('events');
const axios = require('axios');
const { ethers } = require('ethers');

class MonitoringService extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.alerts = new Map();
        this.metrics = new Map();
        this.thresholds = this.initializeThresholds();
        this.intervals = new Map();
    }

    initializeThresholds() {
        return {
            // 价格监控阈值
            price: {
                drop1h: -5,         // 1小时跌幅5%
                drop24h: -10,       // 24小时跌幅10%
                drop30m: -3,        // 30分钟跌幅3%
                pump1h: 20,         // 1小时涨幅20%（防pump）
                pump24h: 50         // 24小时涨幅50%
            },
            
            // 交易监控阈值
            transaction: {
                largeTransfer: 100000,      // 大额转账 100k HCF
                whaleThreshold: 1000000,    // 巨鲸阈值 1M HCF
                unusualGas: 100,             // 异常Gas价格 100 Gwei
                failureRate: 0.1             // 失败率10%
            },
            
            // 系统性能阈值
            system: {
                cpuUsage: 80,               // CPU使用率80%
                memoryUsage: 85,             // 内存使用率85%
                diskUsage: 90,               // 磁盘使用率90%
                apiResponseTime: 3000,       // API响应时间3秒
                blockDelay: 10               // 区块延迟10个
            },
            
            // 流动性监控阈值
            liquidity: {
                impermanentLoss: 5,          // 无常损失5%
                lpChange: -20,               // LP变化-20%
                tvlDrop: -15,                // TVL下跌15%
                slippage: 3                  // 滑点3%
            },
            
            // 安全监控阈值
            security: {
                unusualActivity: 10,         // 10次异常活动
                flashLoanDetection: true,    // 闪电贷检测
                rugPullPattern: true,        // Rug Pull模式
                washTradingThreshold: 5      // 洗盘交易5次
            }
        };
    }

    async initialize(contracts, db, redis) {
        this.contracts = contracts;
        this.db = db;
        this.redis = redis;
        
        // 启动监控任务
        this.startPriceMonitoring();
        this.startTransactionMonitoring();
        this.startSystemMonitoring();
        this.startLiquidityMonitoring();
        this.startSecurityMonitoring();
        
        console.log('Monitoring service initialized');
    }

    // ========== 价格监控 ==========
    
    startPriceMonitoring() {
        const interval = setInterval(async () => {
            try {
                const priceData = await this.getPriceData();
                await this.checkPriceAlerts(priceData);
                await this.recordPriceMetrics(priceData);
            } catch (error) {
                console.error('Price monitoring error:', error);
            }
        }, 30000); // 每30秒
        
        this.intervals.set('price', interval);
    }

    async getPriceData() {
        // 获取当前价格
        const currentPrice = await this.contracts.exchange.getHCFPrice();
        
        // 获取历史价格
        const [price30m, price1h, price24h] = await Promise.all([
            this.getHistoricalPrice(30 * 60 * 1000),
            this.getHistoricalPrice(60 * 60 * 1000),
            this.getHistoricalPrice(24 * 60 * 60 * 1000)
        ]);
        
        return {
            current: parseFloat(ethers.utils.formatEther(currentPrice)),
            change30m: this.calculateChange(price30m, currentPrice),
            change1h: this.calculateChange(price1h, currentPrice),
            change24h: this.calculateChange(price24h, currentPrice),
            timestamp: Date.now()
        };
    }

    async checkPriceAlerts(priceData) {
        const alerts = [];
        
        // 检查价格下跌
        if (priceData.change30m < this.thresholds.price.drop30m) {
            alerts.push({
                type: 'PRICE_DROP_30M',
                severity: 'warning',
                data: priceData
            });
        }
        
        if (priceData.change1h < this.thresholds.price.drop1h) {
            alerts.push({
                type: 'PRICE_DROP_1H',
                severity: 'high',
                data: priceData
            });
        }
        
        if (priceData.change24h < this.thresholds.price.drop24h) {
            alerts.push({
                type: 'PRICE_DROP_24H',
                severity: 'critical',
                data: priceData
            });
        }
        
        // 检查价格暴涨（防pump）
        if (priceData.change1h > this.thresholds.price.pump1h) {
            alerts.push({
                type: 'PRICE_PUMP_1H',
                severity: 'warning',
                data: priceData
            });
        }
        
        if (priceData.change24h > this.thresholds.price.pump24h) {
            alerts.push({
                type: 'PRICE_PUMP_24H',
                severity: 'high',
                data: priceData
            });
        }
        
        // 发送告警
        for (const alert of alerts) {
            await this.sendAlert(alert);
        }
    }

    // ========== 交易监控 ==========
    
    startTransactionMonitoring() {
        // 监听Transfer事件
        this.contracts.token.on('Transfer', async (from, to, amount, event) => {
            try {
                await this.analyzeTransfer(from, to, amount, event);
            } catch (error) {
                console.error('Transaction monitoring error:', error);
            }
        });
        
        // 监听交易失败
        const interval = setInterval(async () => {
            await this.checkFailedTransactions();
        }, 60000); // 每分钟
        
        this.intervals.set('transactions', interval);
    }

    async analyzeTransfer(from, to, amount, event) {
        const amountHCF = parseFloat(ethers.utils.formatEther(amount));
        
        // 大额转账检测
        if (amountHCF >= this.thresholds.transaction.largeTransfer) {
            await this.sendAlert({
                type: 'LARGE_TRANSFER',
                severity: amountHCF >= this.thresholds.transaction.whaleThreshold ? 'critical' : 'high',
                data: {
                    from,
                    to,
                    amount: amountHCF,
                    txHash: event.transactionHash
                }
            });
        }
        
        // 洗盘交易检测
        await this.detectWashTrading(from, to, amountHCF);
        
        // 异常模式检测
        await this.detectUnusualPatterns(from, to, amountHCF);
    }

    async detectWashTrading(from, to, amount) {
        const key = `washtrading:${from}:${to}`;
        const count = await this.redis.incr(key);
        await this.redis.expire(key, 3600); // 1小时过期
        
        if (count >= this.thresholds.security.washTradingThreshold) {
            await this.sendAlert({
                type: 'WASH_TRADING_DETECTED',
                severity: 'critical',
                data: { from, to, count, amount }
            });
        }
    }

    async detectUnusualPatterns(from, to, amount) {
        // 检查是否为新地址大额交易
        const fromHistory = await this.db.collection('users').findOne({ address: from });
        const toHistory = await this.db.collection('users').findOne({ address: to });
        
        if (!fromHistory && amount > 10000) {
            await this.sendAlert({
                type: 'NEW_ADDRESS_LARGE_TX',
                severity: 'warning',
                data: { address: from, amount }
            });
        }
        
        // 检查是否为合约地址
        const fromCode = await this.contracts.provider.getCode(from);
        const toCode = await this.contracts.provider.getCode(to);
        
        if (fromCode !== '0x' || toCode !== '0x') {
            // 合约交互
            await this.analyzeContractInteraction(from, to, amount);
        }
    }

    async analyzeContractInteraction(from, to, amount) {
        // 检查是否为已知DEX
        const knownDEXs = [
            '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap Router
            '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'  // PancakeSwap Factory
        ];
        
        if (knownDEXs.includes(from) || knownDEXs.includes(to)) {
            // DEX交易
            if (amount > 50000) {
                await this.sendAlert({
                    type: 'LARGE_DEX_TRADE',
                    severity: 'info',
                    data: { dex: from || to, amount }
                });
            }
        } else {
            // 未知合约
            await this.sendAlert({
                type: 'UNKNOWN_CONTRACT_INTERACTION',
                severity: 'warning',
                data: { from, to, amount }
            });
        }
    }

    async checkFailedTransactions() {
        const recentBlocks = 10;
        const latestBlock = await this.contracts.provider.getBlockNumber();
        
        let totalTxs = 0;
        let failedTxs = 0;
        
        for (let i = 0; i < recentBlocks; i++) {
            const block = await this.contracts.provider.getBlockWithTransactions(latestBlock - i);
            
            for (const tx of block.transactions) {
                if (tx.to === this.contracts.token.address || 
                    tx.to === this.contracts.staking.address ||
                    tx.to === this.contracts.exchange.address) {
                    totalTxs++;
                    
                    const receipt = await this.contracts.provider.getTransactionReceipt(tx.hash);
                    if (receipt.status === 0) {
                        failedTxs++;
                    }
                }
            }
        }
        
        const failureRate = totalTxs > 0 ? failedTxs / totalTxs : 0;
        
        if (failureRate > this.thresholds.transaction.failureRate) {
            await this.sendAlert({
                type: 'HIGH_FAILURE_RATE',
                severity: 'high',
                data: { failureRate, failedTxs, totalTxs }
            });
        }
    }

    // ========== 系统监控 ==========
    
    startSystemMonitoring() {
        const interval = setInterval(async () => {
            try {
                await this.checkSystemHealth();
                await this.checkAPIPerformance();
                await this.checkBlockchainSync();
            } catch (error) {
                console.error('System monitoring error:', error);
            }
        }, 60000); // 每分钟
        
        this.intervals.set('system', interval);
    }

    async checkSystemHealth() {
        const os = require('os');
        
        // CPU使用率
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;
        
        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });
        
        const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);
        
        // 内存使用率
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memUsage = ((totalMem - freeMem) / totalMem) * 100;
        
        // 检查阈值
        if (cpuUsage > this.thresholds.system.cpuUsage) {
            await this.sendAlert({
                type: 'HIGH_CPU_USAGE',
                severity: 'warning',
                data: { cpuUsage }
            });
        }
        
        if (memUsage > this.thresholds.system.memoryUsage) {
            await this.sendAlert({
                type: 'HIGH_MEMORY_USAGE',
                severity: 'warning',
                data: { memUsage }
            });
        }
        
        // 记录metrics
        await this.recordMetric('system.cpu', cpuUsage);
        await this.recordMetric('system.memory', memUsage);
    }

    async checkAPIPerformance() {
        const endpoints = [
            '/api/user/0x0000000000000000000000000000000000000000',
            '/api/rankings',
            '/api/price'
        ];
        
        for (const endpoint of endpoints) {
            const start = Date.now();
            
            try {
                await axios.get(`http://localhost:3000${endpoint}`, {
                    timeout: this.thresholds.system.apiResponseTime
                });
                
                const responseTime = Date.now() - start;
                await this.recordMetric(`api.response.${endpoint}`, responseTime);
                
                if (responseTime > this.thresholds.system.apiResponseTime) {
                    await this.sendAlert({
                        type: 'SLOW_API_RESPONSE',
                        severity: 'warning',
                        data: { endpoint, responseTime }
                    });
                }
            } catch (error) {
                await this.sendAlert({
                    type: 'API_ERROR',
                    severity: 'high',
                    data: { endpoint, error: error.message }
                });
            }
        }
    }

    async checkBlockchainSync() {
        try {
            const latestBlock = await this.contracts.provider.getBlockNumber();
            const lastProcessedBlock = await this.redis.get('lastProcessedBlock');
            
            if (lastProcessedBlock) {
                const delay = latestBlock - parseInt(lastProcessedBlock);
                
                if (delay > this.thresholds.system.blockDelay) {
                    await this.sendAlert({
                        type: 'BLOCK_SYNC_DELAY',
                        severity: 'high',
                        data: { latestBlock, lastProcessedBlock, delay }
                    });
                }
            }
        } catch (error) {
            console.error('Block sync check error:', error);
        }
    }

    // ========== 流动性监控 ==========
    
    startLiquidityMonitoring() {
        const interval = setInterval(async () => {
            try {
                await this.checkLiquidityHealth();
                await this.checkImpermanentLoss();
                await this.checkTVL();
            } catch (error) {
                console.error('Liquidity monitoring error:', error);
            }
        }, 300000); // 每5分钟
        
        this.intervals.set('liquidity', interval);
    }

    async checkLiquidityHealth() {
        try {
            // 获取流动性池信息
            const pairAddress = this.config.HCF_BSDT_PAIR;
            const pairContract = new ethers.Contract(
                pairAddress,
                ['function getReserves() view returns (uint112, uint112, uint32)'],
                this.contracts.provider
            );
            
            const reserves = await pairContract.getReserves();
            const hcfReserve = parseFloat(ethers.utils.formatEther(reserves[0]));
            const bsdtReserve = parseFloat(ethers.utils.formatEther(reserves[1]));
            
            // 检查流动性变化
            const lastReserves = await this.redis.get('lastReserves');
            if (lastReserves) {
                const last = JSON.parse(lastReserves);
                const hcfChange = ((hcfReserve - last.hcf) / last.hcf) * 100;
                const bsdtChange = ((bsdtReserve - last.bsdt) / last.bsdt) * 100;
                
                if (hcfChange < this.thresholds.liquidity.lpChange || 
                    bsdtChange < this.thresholds.liquidity.lpChange) {
                    await this.sendAlert({
                        type: 'LIQUIDITY_DROP',
                        severity: 'high',
                        data: { hcfChange, bsdtChange, hcfReserve, bsdtReserve }
                    });
                }
            }
            
            // 保存当前储备
            await this.redis.set('lastReserves', JSON.stringify({
                hcf: hcfReserve,
                bsdt: bsdtReserve,
                timestamp: Date.now()
            }));
            
        } catch (error) {
            console.error('Liquidity health check error:', error);
        }
    }

    async checkImpermanentLoss() {
        // 计算无常损失
        const users = await this.db.collection('lp_providers')
            .find({ active: true })
            .toArray();
        
        for (const user of users) {
            const currentValue = await this.calculateLPValue(user.lpTokens);
            const initialValue = user.initialValue;
            
            if (initialValue > 0) {
                const loss = ((initialValue - currentValue) / initialValue) * 100;
                
                if (loss > this.thresholds.liquidity.impermanentLoss) {
                    await this.sendAlert({
                        type: 'HIGH_IMPERMANENT_LOSS',
                        severity: 'warning',
                        data: {
                            user: user.address,
                            loss,
                            currentValue,
                            initialValue
                        }
                    });
                }
            }
        }
    }

    async checkTVL() {
        const tvl = await this.calculateTVL();
        const lastTVL = await this.redis.get('lastTVL');
        
        if (lastTVL) {
            const change = ((tvl - parseFloat(lastTVL)) / parseFloat(lastTVL)) * 100;
            
            if (change < this.thresholds.liquidity.tvlDrop) {
                await this.sendAlert({
                    type: 'TVL_DROP',
                    severity: 'high',
                    data: { tvl, lastTVL, change }
                });
            }
        }
        
        await this.redis.set('lastTVL', tvl.toString());
        await this.recordMetric('tvl', tvl);
    }

    // ========== 安全监控 ==========
    
    startSecurityMonitoring() {
        // 监听可疑活动
        this.setupSecurityListeners();
        
        // 定期安全检查
        const interval = setInterval(async () => {
            await this.checkSecurityPatterns();
            await this.checkFlashLoanActivity();
        }, 60000); // 每分钟
        
        this.intervals.set('security', interval);
    }

    setupSecurityListeners() {
        // 监听多签钱包活动
        if (this.contracts.multiSig) {
            this.contracts.multiSig.on('TransactionSubmitted', async (txId, submitter) => {
                await this.sendAlert({
                    type: 'MULTISIG_TRANSACTION',
                    severity: 'info',
                    data: { txId, submitter }
                });
            });
        }
        
        // 监听权限变更
        this.contracts.token.on('OwnershipTransferred', async (previousOwner, newOwner) => {
            await this.sendAlert({
                type: 'OWNERSHIP_TRANSFERRED',
                severity: 'critical',
                data: { previousOwner, newOwner }
            });
        });
    }

    async checkSecurityPatterns() {
        // Rug Pull模式检测
        const ownerBalance = await this.contracts.token.balanceOf(
            await this.contracts.token.owner()
        );
        const totalSupply = await this.contracts.token.totalSupply();
        const ownerPercentage = (ownerBalance / totalSupply) * 100;
        
        if (ownerPercentage > 30) {
            await this.sendAlert({
                type: 'HIGH_OWNER_BALANCE',
                severity: 'warning',
                data: { ownerPercentage }
            });
        }
        
        // 检查异常授权
        await this.checkUnusualApprovals();
    }

    async checkUnusualApprovals() {
        const events = await this.contracts.token.queryFilter(
            this.contracts.token.filters.Approval(),
            -100 // 最近100个区块
        );
        
        for (const event of events) {
            const amount = event.args.value;
            
            if (amount.eq(ethers.constants.MaxUint256)) {
                // 无限授权
                await this.sendAlert({
                    type: 'UNLIMITED_APPROVAL',
                    severity: 'info',
                    data: {
                        owner: event.args.owner,
                        spender: event.args.spender
                    }
                });
            }
        }
    }

    async checkFlashLoanActivity() {
        // 检查闪电贷活动
        const recentBlocks = 10;
        const currentBlock = await this.contracts.provider.getBlockNumber();
        
        for (let i = 0; i < recentBlocks; i++) {
            const block = await this.contracts.provider.getBlock(currentBlock - i);
            
            // 检查同一区块内的大额借贷和归还
            const txs = await Promise.all(
                block.transactions.map(hash => 
                    this.contracts.provider.getTransaction(hash)
                )
            );
            
            // 分析交易模式
            const flashLoanPattern = this.detectFlashLoanPattern(txs);
            
            if (flashLoanPattern) {
                await this.sendAlert({
                    type: 'FLASH_LOAN_DETECTED',
                    severity: 'critical',
                    data: flashLoanPattern
                });
            }
        }
    }

    detectFlashLoanPattern(transactions) {
        // 简化的闪电贷检测逻辑
        // 实际应该更复杂
        const borrowAndRepay = transactions.filter(tx => {
            if (!tx.data) return false;
            // 检查是否包含借贷和归还的函数选择器
            const borrowSelector = '0xa415bcad'; // borrow()
            const repaySelector = '0x573ade81'; // repay()
            return tx.data.includes(borrowSelector) || tx.data.includes(repaySelector);
        });
        
        if (borrowAndRepay.length >= 2) {
            return {
                blockNumber: transactions[0].blockNumber,
                suspiciousTxs: borrowAndRepay.map(tx => tx.hash)
            };
        }
        
        return null;
    }

    // ========== 辅助方法 ==========
    
    calculateChange(oldPrice, newPrice) {
        if (!oldPrice || oldPrice === 0) return 0;
        return ((newPrice - oldPrice) / oldPrice) * 100;
    }

    async getHistoricalPrice(timeAgo) {
        const timestamp = Date.now() - timeAgo;
        const priceDoc = await this.db.collection('price_history')
            .findOne(
                { timestamp: { $gte: timestamp } },
                { sort: { timestamp: 1 } }
            );
        
        return priceDoc?.price || 0;
    }

    async calculateLPValue(lpTokens) {
        // 计算LP代币价值
        // 简化实现
        return lpTokens * 2; // 假设1 LP = 2 USD
    }

    async calculateTVL() {
        // 计算总锁仓价值
        const stakingTVL = await this.contracts.staking.totalStaked();
        const lpTVL = await this.contracts.exchange.totalLPSupply();
        
        return parseFloat(ethers.utils.formatEther(stakingTVL.add(lpTVL)));
    }

    async recordMetric(name, value) {
        // 记录指标
        await this.db.collection('metrics').insertOne({
            name,
            value,
            timestamp: Date.now()
        });
        
        // 更新Redis
        await this.redis.hset('metrics:current', name, value.toString());
    }

    async sendAlert(alert) {
        // 防止重复告警
        const alertKey = `alert:${alert.type}:${JSON.stringify(alert.data)}`;
        const exists = await this.redis.get(alertKey);
        
        if (exists) {
            return; // 已发送过
        }
        
        // 标记已发送
        await this.redis.setex(alertKey, 3600, '1'); // 1小时内不重复
        
        // 记录到数据库
        await this.db.collection('alerts').insertOne({
            ...alert,
            timestamp: Date.now(),
            resolved: false
        });
        
        // 发送到不同渠道
        await this.sendToTelegram(alert);
        await this.sendToWebhook(alert);
        
        // 触发事件
        this.emit('alert', alert);
        
        console.log(`Alert sent: ${alert.type} - ${alert.severity}`);
    }

    async sendToTelegram(alert) {
        if (!this.config.TELEGRAM_BOT_TOKEN || !this.config.TELEGRAM_CHAT_ID) {
            return;
        }
        
        const message = `
🚨 *${alert.severity.toUpperCase()} Alert*
Type: ${alert.type}
Data: \`${JSON.stringify(alert.data, null, 2)}\`
Time: ${new Date().toISOString()}
        `.trim();
        
        try {
            await axios.post(
                `https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/sendMessage`,
                {
                    chat_id: this.config.TELEGRAM_CHAT_ID,
                    text: message,
                    parse_mode: 'Markdown'
                }
            );
        } catch (error) {
            console.error('Telegram send error:', error);
        }
    }

    async sendToWebhook(alert) {
        if (!this.config.ALERT_WEBHOOK_URL) {
            return;
        }
        
        try {
            await axios.post(this.config.ALERT_WEBHOOK_URL, {
                ...alert,
                project: 'HCF',
                network: 'BSC',
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Webhook send error:', error);
        }
    }

    // 清理资源
    async close() {
        // 停止所有监控间隔
        for (const [name, interval] of this.intervals) {
            clearInterval(interval);
        }
        
        // 移除所有事件监听器
        if (this.contracts) {
            Object.values(this.contracts).forEach(contract => {
                contract.removeAllListeners();
            });
        }
        
        console.log('Monitoring service closed');
    }
}

module.exports = MonitoringService;