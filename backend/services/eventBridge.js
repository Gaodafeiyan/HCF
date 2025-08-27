// API Bridge Service - Ethers.js Event Listening
const { ethers } = require('ethers');
const Redis = require('redis');
const { MongoClient } = require('mongodb');
const { Server } = require('socket.io');
const EventEmitter = require('events');

class EventBridge extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.provider = null;
        this.contracts = {};
        this.redis = null;
        this.mongodb = null;
        this.io = null;
    }

    async initialize() {
        // 初始化WebSocket Provider
        this.provider = new ethers.providers.WebSocketProvider(
            this.config.BSC_WSS_URL || 'wss://bsc-ws-node.nariox.org:443'
        );

        // 初始化Redis
        this.redis = Redis.createClient({
            url: this.config.REDIS_URL || 'redis://localhost:6379'
        });
        await this.redis.connect();

        // 初始化MongoDB
        const mongoClient = new MongoClient(this.config.MONGODB_URI || 'mongodb://localhost:27017');
        await mongoClient.connect();
        this.mongodb = mongoClient.db('hcf_database');

        // 初始化Socket.io
        this.io = new Server(this.config.WEBSOCKET_PORT || 3001, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // 初始化合约实例
        await this.initializeContracts();

        // 开始监听事件
        await this.startEventListeners();

        console.log('EventBridge initialized successfully');
    }

    async initializeContracts() {
        // HCFToken合约
        this.contracts.token = new ethers.Contract(
            this.config.HCF_TOKEN_ADDRESS,
            require('../abis/HCFToken.json'),
            this.provider
        );

        // HCFStaking合约
        this.contracts.staking = new ethers.Contract(
            this.config.STAKING_ADDRESS,
            require('../abis/HCFStaking.json'),
            this.provider
        );

        // HCFReferral合约
        this.contracts.referral = new ethers.Contract(
            this.config.REFERRAL_ADDRESS,
            require('../abis/HCFReferral.json'),
            this.provider
        );

        // HCFRanking合约
        this.contracts.ranking = new ethers.Contract(
            this.config.RANKING_ADDRESS,
            require('../abis/HCFRanking.json'),
            this.provider
        );

        // HCFBSDTExchange合约
        this.contracts.exchange = new ethers.Contract(
            this.config.EXCHANGE_ADDRESS,
            require('../abis/HCFBSDTExchange.json'),
            this.provider
        );

        // HCFNodeNFT合约
        this.contracts.nodeNFT = new ethers.Contract(
            this.config.NODE_NFT_ADDRESS,
            require('../abis/HCFNodeNFT.json'),
            this.provider
        );
    }

    async startEventListeners() {
        // 监听质押事件
        this.contracts.staking.on('Staked', async (user, amount, levelId, isLP, event) => {
            const data = {
                event: 'Staked',
                user: user,
                amount: ethers.utils.formatEther(amount),
                levelId: levelId.toNumber(),
                isLP: isLP,
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                timestamp: Date.now()
            };

            await this.processStakingEvent(data);
        });

        // 监听提现事件
        this.contracts.staking.on('Withdrawn', async (user, amount, event) => {
            const data = {
                event: 'Withdrawn',
                user: user,
                amount: ethers.utils.formatEther(amount),
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                timestamp: Date.now()
            };

            await this.processWithdrawalEvent(data);
        });

        // 监听奖励分发事件
        this.contracts.staking.on('RewardsClaimed', async (user, amount, event) => {
            const data = {
                event: 'RewardsClaimed',
                user: user,
                amount: ethers.utils.formatEther(amount),
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                timestamp: Date.now()
            };

            await this.processRewardEvent(data);
        });

        // 监听推荐奖励事件
        this.contracts.referral.on('ReferralRewardDistributed', async (user, referrer, level, amount, event) => {
            const data = {
                event: 'ReferralRewardDistributed',
                user: user,
                referrer: referrer,
                level: level.toNumber(),
                amount: ethers.utils.formatEther(amount),
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                timestamp: Date.now()
            };

            await this.processReferralEvent(data);
        });

        // 监听团队奖励事件
        this.contracts.referral.on('TeamRewardDistributed', async (user, level, amount, event) => {
            const data = {
                event: 'TeamRewardDistributed',
                user: user,
                teamLevel: level.toNumber(),
                amount: ethers.utils.formatEther(amount),
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                timestamp: Date.now()
            };

            await this.processTeamRewardEvent(data);
        });

        // 监听排名更新事件
        this.contracts.ranking.on('RankingUpdated', async (user, rank, score, event) => {
            const data = {
                event: 'RankingUpdated',
                user: user,
                rank: rank.toNumber(),
                score: score.toString(),
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                timestamp: Date.now()
            };

            await this.processRankingEvent(data);
        });

        // 监听交易事件
        this.contracts.exchange.on('SwapUSDTToHCF', async (user, usdtIn, hcfOut, event) => {
            const data = {
                event: 'SwapUSDTToHCF',
                user: user,
                usdtIn: ethers.utils.formatUnits(usdtIn, 18),
                hcfOut: ethers.utils.formatEther(hcfOut),
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                timestamp: Date.now()
            };

            await this.processSwapEvent(data);
        });

        // 监听节点激活事件
        this.contracts.nodeNFT.on('NodeActivated', async (tokenId, owner, tier, event) => {
            const data = {
                event: 'NodeActivated',
                tokenId: tokenId.toNumber(),
                owner: owner,
                tier: tier.toNumber(),
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                timestamp: Date.now()
            };

            await this.processNodeEvent(data);
        });

        // 监听价格更新（从交易对）
        this.contracts.exchange.on('*', async (event) => {
            // 计算价格
            const price = await this.calculateHCFPrice();
            if (price) {
                await this.processPriceUpdate(price);
            }
        });

        console.log('Event listeners started');
    }

    async processStakingEvent(data) {
        try {
            // 存储到MongoDB
            await this.mongodb.collection('staking_events').insertOne(data);

            // 更新用户统计
            await this.updateUserStats(data.user, {
                totalStaked: data.amount,
                lastAction: 'stake',
                lastActionTime: data.timestamp
            });

            // 更新Redis缓存
            const cacheKey = `user:${data.user}:staking`;
            await this.redis.setex(cacheKey, 300, JSON.stringify(data));

            // 推送WebSocket更新
            this.io.emit('stakingUpdate', data);

            // 触发自定义事件
            this.emit('staking:update', data);

        } catch (error) {
            console.error('Error processing staking event:', error);
        }
    }

    async processWithdrawalEvent(data) {
        try {
            // 存储到MongoDB
            await this.mongodb.collection('withdrawal_events').insertOne(data);

            // 更新用户统计
            await this.updateUserStats(data.user, {
                totalWithdrawn: data.amount,
                lastAction: 'withdraw',
                lastActionTime: data.timestamp
            });

            // 清除相关缓存
            await this.redis.del(`user:${data.user}:staking`);

            // 推送WebSocket更新
            this.io.emit('withdrawalUpdate', data);

        } catch (error) {
            console.error('Error processing withdrawal event:', error);
        }
    }

    async processRewardEvent(data) {
        try {
            // 存储到MongoDB
            await this.mongodb.collection('reward_events').insertOne(data);

            // 更新累计奖励
            await this.mongodb.collection('users').updateOne(
                { address: data.user },
                { 
                    $inc: { totalRewardsClaimed: parseFloat(data.amount) },
                    $set: { lastClaimTime: data.timestamp }
                },
                { upsert: true }
            );

            // 推送WebSocket更新
            this.io.emit('rewardClaimed', data);

        } catch (error) {
            console.error('Error processing reward event:', error);
        }
    }

    async processReferralEvent(data) {
        try {
            // 存储到MongoDB
            await this.mongodb.collection('referral_events').insertOne(data);

            // 更新推荐统计
            await this.mongodb.collection('referral_stats').updateOne(
                { address: data.referrer },
                { 
                    $inc: { 
                        totalReferralRewards: parseFloat(data.amount),
                        [`level${data.level}Rewards`]: parseFloat(data.amount)
                    }
                },
                { upsert: true }
            );

            // 推送WebSocket更新
            this.io.emit('referralReward', data);

        } catch (error) {
            console.error('Error processing referral event:', error);
        }
    }

    async processTeamRewardEvent(data) {
        try {
            // 存储到MongoDB
            await this.mongodb.collection('team_reward_events').insertOne(data);

            // 更新团队统计
            await this.mongodb.collection('team_stats').updateOne(
                { address: data.user },
                { 
                    $inc: { totalTeamRewards: parseFloat(data.amount) },
                    $set: { teamLevel: data.teamLevel }
                },
                { upsert: true }
            );

            // 推送WebSocket更新
            this.io.emit('teamReward', data);

        } catch (error) {
            console.error('Error processing team reward event:', error);
        }
    }

    async processRankingEvent(data) {
        try {
            // 存储到MongoDB
            await this.mongodb.collection('ranking_history').insertOne(data);

            // 更新当前排名
            await this.mongodb.collection('current_rankings').replaceOne(
                { address: data.user },
                {
                    address: data.user,
                    rank: data.rank,
                    score: data.score,
                    lastUpdate: data.timestamp
                },
                { upsert: true }
            );

            // 更新Redis排行榜
            await this.redis.zadd('rankings', data.score, data.user);

            // 推送WebSocket更新
            this.io.emit('rankingUpdate', data);

            // 获取完整排行榜
            const topRankings = await this.getTopRankings(100);
            this.io.emit('rankingsList', topRankings);

        } catch (error) {
            console.error('Error processing ranking event:', error);
        }
    }

    async processSwapEvent(data) {
        try {
            // 存储到MongoDB
            await this.mongodb.collection('swap_events').insertOne(data);

            // 更新交易量统计
            await this.mongodb.collection('trading_stats').updateOne(
                { date: new Date().toISOString().split('T')[0] },
                { 
                    $inc: { 
                        totalVolume: parseFloat(data.usdtIn),
                        swapCount: 1
                    }
                },
                { upsert: true }
            );

            // 推送WebSocket更新
            this.io.emit('swapExecuted', data);

        } catch (error) {
            console.error('Error processing swap event:', error);
        }
    }

    async processNodeEvent(data) {
        try {
            // 存储到MongoDB
            await this.mongodb.collection('node_events').insertOne(data);

            // 更新节点统计
            await this.mongodb.collection('nodes').replaceOne(
                { tokenId: data.tokenId },
                {
                    tokenId: data.tokenId,
                    owner: data.owner,
                    tier: data.tier,
                    activationTime: data.timestamp,
                    isActive: true
                },
                { upsert: true }
            );

            // 推送WebSocket更新
            this.io.emit('nodeActivated', data);

        } catch (error) {
            console.error('Error processing node event:', error);
        }
    }

    async processPriceUpdate(price) {
        try {
            // 存储价格历史
            await this.mongodb.collection('price_history').insertOne({
                price: price,
                timestamp: Date.now()
            });

            // 更新Redis当前价格
            await this.redis.set('hcf:price:current', price.toString());

            // 计算24小时变化
            const price24h = await this.get24hPriceChange();

            // 推送WebSocket更新
            this.io.emit('priceUpdate', {
                current: price,
                change24h: price24h,
                timestamp: Date.now()
            });

            // 检查价格告警
            await this.checkPriceAlerts(price, price24h);

        } catch (error) {
            console.error('Error processing price update:', error);
        }
    }

    async updateUserStats(address, updates) {
        try {
            await this.mongodb.collection('users').updateOne(
                { address: address },
                { $set: updates },
                { upsert: true }
            );
        } catch (error) {
            console.error('Error updating user stats:', error);
        }
    }

    async calculateHCFPrice() {
        try {
            // 从交易对获取价格
            const pairAddress = this.config.HCF_BSDT_PAIR;
            const pairContract = new ethers.Contract(
                pairAddress,
                ['function getReserves() view returns (uint112, uint112, uint32)'],
                this.provider
            );
            
            const reserves = await pairContract.getReserves();
            // 假设 token0 是 HCF, token1 是 BSDT
            const price = ethers.utils.formatEther(reserves[1]) / ethers.utils.formatEther(reserves[0]);
            
            return price;
        } catch (error) {
            console.error('Error calculating price:', error);
            return null;
        }
    }

    async get24hPriceChange() {
        try {
            const yesterday = Date.now() - 86400000;
            const oldPrice = await this.mongodb.collection('price_history')
                .findOne(
                    { timestamp: { $gte: yesterday } },
                    { sort: { timestamp: 1 } }
                );
            
            const currentPrice = parseFloat(await this.redis.get('hcf:price:current'));
            
            if (oldPrice && currentPrice) {
                return ((currentPrice - oldPrice.price) / oldPrice.price) * 100;
            }
            
            return 0;
        } catch (error) {
            console.error('Error calculating 24h change:', error);
            return 0;
        }
    }

    async checkPriceAlerts(currentPrice, priceChange) {
        try {
            // 防砸盘检测
            if (priceChange <= -10) {
                await this.sendAlert('PRICE_DROP_10', {
                    price: currentPrice,
                    change: priceChange
                });
            }
            if (priceChange <= -30) {
                await this.sendAlert('PRICE_DROP_30', {
                    price: currentPrice,
                    change: priceChange
                });
            }
            if (priceChange <= -50) {
                await this.sendAlert('PRICE_DROP_50', {
                    price: currentPrice,
                    change: priceChange
                });
            }
        } catch (error) {
            console.error('Error checking price alerts:', error);
        }
    }

    async sendAlert(type, data) {
        // 发送告警到监控系统
        console.log(`ALERT [${type}]:`, data);
        
        // 推送WebSocket告警
        this.io.emit('alert', { type, data, timestamp: Date.now() });
        
        // TODO: 集成Telegram Bot或其他告警渠道
    }

    async getTopRankings(limit = 100) {
        try {
            const rankings = await this.mongodb.collection('current_rankings')
                .find({})
                .sort({ rank: 1 })
                .limit(limit)
                .toArray();
            
            return rankings;
        } catch (error) {
            console.error('Error getting rankings:', error);
            return [];
        }
    }

    async close() {
        // 清理资源
        if (this.provider) {
            await this.provider.destroy();
        }
        if (this.redis) {
            await this.redis.quit();
        }
        if (this.mongodb) {
            await this.mongodb.client.close();
        }
        if (this.io) {
            this.io.close();
        }
    }
}

module.exports = EventBridge;