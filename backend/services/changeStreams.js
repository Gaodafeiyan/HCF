// MongoDB Change Streams for Real-time Rankings
const { MongoClient } = require('mongodb');
const EventEmitter = require('events');
const Redis = require('redis');

class ChangeStreamsService extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.mongoClient = null;
        this.db = null;
        this.redis = null;
        this.changeStreams = new Map();
        this.io = null;
    }

    async initialize(io) {
        // 初始化MongoDB连接
        this.mongoClient = new MongoClient(
            this.config.MONGODB_URI || 'mongodb://localhost:27017',
            {
                useNewUrlParser: true,
                useUnifiedTopology: true
            }
        );
        
        await this.mongoClient.connect();
        this.db = this.mongoClient.db('hcf_database');

        // 初始化Redis
        this.redis = Redis.createClient({
            url: this.config.REDIS_URL || 'redis://localhost:6379'
        });
        await this.redis.connect();

        // Socket.io实例
        this.io = io;

        // 启动Change Streams监听
        await this.startChangeStreams();

        console.log('ChangeStreams service initialized');
    }

    async startChangeStreams() {
        // 监听排名集合变化
        this.watchRankings();
        
        // 监听用户统计变化
        this.watchUserStats();
        
        // 监听质押事件变化
        this.watchStakingEvents();
        
        // 监听节点状态变化
        this.watchNodeStatus();
        
        // 监听团队等级变化
        this.watchTeamLevels();
        
        // 监听价格历史变化
        this.watchPriceHistory();
    }

    // 监听排名变化
    watchRankings() {
        const collection = this.db.collection('rankings');
        const pipeline = [
            {
                $match: {
                    $or: [
                        { operationType: 'insert' },
                        { operationType: 'update' },
                        { operationType: 'replace' }
                    ]
                }
            }
        ];

        const changeStream = collection.watch(pipeline, {
            fullDocument: 'updateLookup'
        });

        changeStream.on('change', async (change) => {
            try {
                // 重新计算完整排名
                const rankings = await this.calculateFullRankings();
                
                // 更新Redis缓存
                await this.updateRankingsCache(rankings);
                
                // 推送实时更新
                this.io.emit('rankingsUpdate', {
                    type: 'full',
                    data: rankings,
                    timestamp: Date.now()
                });

                // 检查排名变化并发送个人通知
                await this.checkRankingChanges(change.fullDocument);

            } catch (error) {
                console.error('Error processing ranking change:', error);
            }
        });

        this.changeStreams.set('rankings', changeStream);
    }

    // 监听用户统计变化
    watchUserStats() {
        const collection = this.db.collection('users');
        const pipeline = [
            {
                $match: {
                    $or: [
                        { 'updateDescription.updatedFields.totalStaked': { $exists: true } },
                        { 'updateDescription.updatedFields.totalRewards': { $exists: true } },
                        { 'updateDescription.updatedFields.teamLevel': { $exists: true } }
                    ]
                }
            }
        ];

        const changeStream = collection.watch(pipeline, {
            fullDocument: 'updateLookup'
        });

        changeStream.on('change', async (change) => {
            try {
                const userAddress = change.fullDocument.address;
                
                // 计算用户新分数
                const score = await this.calculateUserScore(change.fullDocument);
                
                // 更新用户排名
                await this.updateUserRanking(userAddress, score);
                
                // 推送个人数据更新
                this.io.to(`user:${userAddress}`).emit('userStatsUpdate', {
                    address: userAddress,
                    stats: change.fullDocument,
                    score: score,
                    timestamp: Date.now()
                });

                // 触发排名重算
                if (this.shouldRecalculateRankings(change)) {
                    await this.triggerRankingRecalculation();
                }

            } catch (error) {
                console.error('Error processing user stats change:', error);
            }
        });

        this.changeStreams.set('userStats', changeStream);
    }

    // 监听质押事件
    watchStakingEvents() {
        const collection = this.db.collection('staking_events');
        const changeStream = collection.watch(
            [{ $match: { operationType: 'insert' } }],
            { fullDocument: 'updateLookup' }
        );

        changeStream.on('change', async (change) => {
            try {
                const event = change.fullDocument;
                
                // 更新质押排行榜
                await this.updateStakingLeaderboard(event);
                
                // 计算TVL
                const tvl = await this.calculateTVL();
                
                // 推送实时更新
                this.io.emit('stakingActivity', {
                    event: event,
                    tvl: tvl,
                    timestamp: Date.now()
                });

                // 更新仪表盘数据
                await this.updateDashboardMetrics();

            } catch (error) {
                console.error('Error processing staking event:', error);
            }
        });

        this.changeStreams.set('stakingEvents', changeStream);
    }

    // 监听节点状态
    watchNodeStatus() {
        const collection = this.db.collection('nodes');
        const changeStream = collection.watch(
            [],
            { fullDocument: 'updateLookup' }
        );

        changeStream.on('change', async (change) => {
            try {
                const node = change.fullDocument;
                
                // 推送节点状态更新
                this.io.emit('nodeStatusUpdate', {
                    tokenId: node.tokenId,
                    owner: node.owner,
                    tier: node.tier,
                    isActive: node.isActive,
                    onlineRate: node.onlineRate,
                    timestamp: Date.now()
                });

                // 如果节点状态影响排名，更新排名
                if (node.owner) {
                    await this.updateNodeOwnerRanking(node.owner);
                }

            } catch (error) {
                console.error('Error processing node status change:', error);
            }
        });

        this.changeStreams.set('nodeStatus', changeStream);
    }

    // 监听团队等级变化
    watchTeamLevels() {
        const collection = this.db.collection('team_stats');
        const changeStream = collection.watch(
            [
                {
                    $match: {
                        'updateDescription.updatedFields.teamLevel': { $exists: true }
                    }
                }
            ],
            { fullDocument: 'updateLookup' }
        );

        changeStream.on('change', async (change) => {
            try {
                const teamData = change.fullDocument;
                
                // 推送团队升级通知
                if (change.updateDescription?.updatedFields?.teamLevel) {
                    const oldLevel = change.updateDescription.removedFields?.teamLevel || 0;
                    const newLevel = teamData.teamLevel;
                    
                    if (newLevel > oldLevel) {
                        this.io.emit('teamLevelUp', {
                            address: teamData.address,
                            oldLevel: oldLevel,
                            newLevel: newLevel,
                            timestamp: Date.now()
                        });
                        
                        // 发送个人通知
                        this.io.to(`user:${teamData.address}`).emit('yourTeamLevelUp', {
                            newLevel: newLevel
                        });
                    }
                }

                // 更新团队排行榜
                await this.updateTeamLeaderboard();

            } catch (error) {
                console.error('Error processing team level change:', error);
            }
        });

        this.changeStreams.set('teamLevels', changeStream);
    }

    // 监听价格历史
    watchPriceHistory() {
        const collection = this.db.collection('price_history');
        const changeStream = collection.watch(
            [{ $match: { operationType: 'insert' } }],
            { fullDocument: 'updateLookup' }
        );

        changeStream.on('change', async (change) => {
            try {
                const priceData = change.fullDocument;
                
                // 计算价格变化
                const priceChange = await this.calculatePriceChange(priceData.price);
                
                // 推送价格更新
                this.io.emit('priceUpdate', {
                    price: priceData.price,
                    change24h: priceChange.change24h,
                    change1h: priceChange.change1h,
                    volume24h: priceChange.volume24h,
                    timestamp: priceData.timestamp
                });

                // 检查价格告警
                await this.checkPriceAlerts(priceData.price, priceChange);

            } catch (error) {
                console.error('Error processing price change:', error);
            }
        });

        this.changeStreams.set('priceHistory', changeStream);
    }

    // ========== 辅助方法 ==========

    async calculateFullRankings() {
        const pipeline = [
            // 计算总分
            {
                $addFields: {
                    totalScore: {
                        $add: [
                            { $ifNull: ['$stakingScore', 0] },
                            { $multiply: [{ $ifNull: ['$lpScore', 0] }, 2] },
                            { $multiply: [{ $ifNull: ['$referralCount', 0] }, 100] },
                            { $ifNull: ['$nodeScore', 0] }
                        ]
                    }
                }
            },
            // 过滤条件
            {
                $match: {
                    $and: [
                        { totalStaked: { $gte: 1000 * Math.pow(10, 18) } },
                        { activeLines: { $gte: 2 } }
                    ]
                }
            },
            // 排序
            { $sort: { totalScore: -1 } },
            // 限制前100
            { $limit: 100 },
            // 添加排名
            {
                $group: {
                    _id: null,
                    users: { $push: '$$ROOT' }
                }
            },
            {
                $unwind: {
                    path: '$users',
                    includeArrayIndex: 'rank'
                }
            },
            {
                $replaceRoot: {
                    newRoot: {
                        $mergeObjects: [
                            '$users',
                            { rank: { $add: ['$rank', 1] } }
                        ]
                    }
                }
            }
        ];

        const rankings = await this.db.collection('users')
            .aggregate(pipeline)
            .toArray();

        return rankings;
    }

    async updateRankingsCache(rankings) {
        // 清除旧的排名缓存
        await this.redis.del('rankings:current');
        
        // 存储新排名到Redis (使用有序集合)
        const multi = this.redis.multi();
        
        rankings.forEach(user => {
            multi.zadd('rankings:current', user.totalScore, JSON.stringify({
                address: user.address,
                rank: user.rank,
                score: user.totalScore,
                stakedAmount: user.totalStaked
            }));
        });
        
        await multi.exec();
        
        // 设置过期时间
        await this.redis.expire('rankings:current', 300); // 5分钟缓存
    }

    async calculateUserScore(userData) {
        let score = 0;
        
        // 质押分数
        score += userData.totalStaked || 0;
        
        // LP分数 (2倍权重)
        score += (userData.lpAmount || 0) * 2;
        
        // 推荐分数 (每个100分)
        score += (userData.referralCount || 0) * 100;
        
        // 节点分数
        if (userData.nodeTokens && userData.nodeTokens.length > 0) {
            for (const tokenId of userData.nodeTokens) {
                const nodeScore = await this.getNodeScore(tokenId);
                score += nodeScore;
            }
        }
        
        return score;
    }

    async getNodeScore(tokenId) {
        const scoreMap = {
            1: 50,  // 1级节点
            2: 40,  // 2级节点
            3: 30,  // 3级节点
            4: 20,  // 4级节点
            5: 10   // 5级节点
        };
        
        const node = await this.db.collection('nodes').findOne({ tokenId });
        return scoreMap[node?.tier] || 0;
    }

    async updateUserRanking(address, score) {
        await this.db.collection('rankings').updateOne(
            { address: address },
            {
                $set: {
                    score: score,
                    lastUpdate: Date.now()
                }
            },
            { upsert: true }
        );
    }

    shouldRecalculateRankings(change) {
        // 判断是否需要重新计算排名
        const significantFields = [
            'totalStaked',
            'lpAmount',
            'referralCount',
            'nodeTokens',
            'teamLevel'
        ];
        
        const updatedFields = Object.keys(change.updateDescription?.updatedFields || {});
        return significantFields.some(field => updatedFields.includes(field));
    }

    async triggerRankingRecalculation() {
        // 防止频繁重算，使用节流
        const lastRecalc = await this.redis.get('rankings:lastRecalc');
        const now = Date.now();
        
        if (lastRecalc && now - parseInt(lastRecalc) < 10000) {
            // 10秒内不重复计算
            return;
        }
        
        await this.redis.set('rankings:lastRecalc', now);
        
        // 触发重算
        const rankings = await this.calculateFullRankings();
        await this.updateRankingsCache(rankings);
        
        this.io.emit('rankingsUpdate', {
            type: 'recalculated',
            data: rankings,
            timestamp: now
        });
    }

    async checkRankingChanges(userData) {
        if (!userData) return;
        
        const previousRank = await this.redis.hget(`user:${userData.address}`, 'rank');
        const currentRank = userData.rank;
        
        if (previousRank && currentRank && previousRank !== currentRank) {
            // 排名变化通知
            this.io.to(`user:${userData.address}`).emit('rankChanged', {
                previous: parseInt(previousRank),
                current: currentRank,
                direction: currentRank < previousRank ? 'up' : 'down'
            });
            
            // 更新缓存
            await this.redis.hset(`user:${userData.address}`, 'rank', currentRank);
        }
    }

    async updateStakingLeaderboard(event) {
        // 更新质押排行榜
        await this.redis.zadd(
            'leaderboard:staking',
            parseFloat(event.amount),
            event.user
        );
        
        // 获取前10
        const top10 = await this.redis.zrevrange('leaderboard:staking', 0, 9, 'WITHSCORES');
        
        this.io.emit('stakingLeaderboard', {
            top10: this.parseLeaderboard(top10),
            timestamp: Date.now()
        });
    }

    parseLeaderboard(data) {
        const leaderboard = [];
        for (let i = 0; i < data.length; i += 2) {
            leaderboard.push({
                address: data[i],
                amount: data[i + 1],
                rank: (i / 2) + 1
            });
        }
        return leaderboard;
    }

    async calculateTVL() {
        const result = await this.db.collection('staking_events')
            .aggregate([
                {
                    $group: {
                        _id: null,
                        totalLocked: { $sum: '$amount' }
                    }
                }
            ])
            .toArray();
        
        return result[0]?.totalLocked || 0;
    }

    async updateDashboardMetrics() {
        const [
            tvl,
            totalUsers,
            totalNodes,
            totalBurned,
            dailyVolume
        ] = await Promise.all([
            this.calculateTVL(),
            this.db.collection('users').countDocuments(),
            this.db.collection('nodes').countDocuments({ isActive: true }),
            this.getTotalBurned(),
            this.get24hVolume()
        ]);
        
        const metrics = {
            tvl,
            totalUsers,
            totalNodes,
            totalBurned,
            dailyVolume,
            timestamp: Date.now()
        };
        
        // 缓存metrics
        await this.redis.set('dashboard:metrics', JSON.stringify(metrics));
        
        // 推送更新
        this.io.emit('dashboardUpdate', metrics);
    }

    async getTotalBurned() {
        const result = await this.db.collection('burn_events')
            .aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$amount' }
                    }
                }
            ])
            .toArray();
        
        return result[0]?.total || 0;
    }

    async get24hVolume() {
        const yesterday = Date.now() - 86400000;
        
        const result = await this.db.collection('swap_events')
            .aggregate([
                {
                    $match: {
                        timestamp: { $gte: yesterday }
                    }
                },
                {
                    $group: {
                        _id: null,
                        volume: { $sum: '$usdtIn' }
                    }
                }
            ])
            .toArray();
        
        return result[0]?.volume || 0;
    }

    async updateNodeOwnerRanking(owner) {
        // 重新计算节点持有者的分数
        const userData = await this.db.collection('users').findOne({ address: owner });
        if (userData) {
            const score = await this.calculateUserScore(userData);
            await this.updateUserRanking(owner, score);
        }
    }

    async updateTeamLeaderboard() {
        const teams = await this.db.collection('team_stats')
            .find({})
            .sort({ teamLevel: -1, totalTeamRewards: -1 })
            .limit(50)
            .toArray();
        
        this.io.emit('teamLeaderboard', {
            teams: teams,
            timestamp: Date.now()
        });
    }

    async calculatePriceChange(currentPrice) {
        const [price1h, price24h] = await Promise.all([
            this.getPriceAt(Date.now() - 3600000),
            this.getPriceAt(Date.now() - 86400000)
        ]);
        
        const volume24h = await this.get24hVolume();
        
        return {
            change1h: price1h ? ((currentPrice - price1h) / price1h) * 100 : 0,
            change24h: price24h ? ((currentPrice - price24h) / price24h) * 100 : 0,
            volume24h: volume24h
        };
    }

    async getPriceAt(timestamp) {
        const priceDoc = await this.db.collection('price_history')
            .findOne(
                { timestamp: { $gte: timestamp } },
                { sort: { timestamp: 1 } }
            );
        
        return priceDoc?.price;
    }

    async checkPriceAlerts(price, priceChange) {
        // 价格告警逻辑
        const alerts = [];
        
        if (priceChange.change1h <= -5) {
            alerts.push({
                type: 'PRICE_DROP_1H',
                severity: 'warning',
                message: `Price dropped ${priceChange.change1h.toFixed(2)}% in 1 hour`
            });
        }
        
        if (priceChange.change24h <= -10) {
            alerts.push({
                type: 'PRICE_DROP_24H',
                severity: 'critical',
                message: `Price dropped ${priceChange.change24h.toFixed(2)}% in 24 hours`
            });
        }
        
        if (alerts.length > 0) {
            this.io.emit('priceAlerts', alerts);
        }
    }

    async close() {
        // 关闭所有Change Streams
        for (const [name, stream] of this.changeStreams) {
            await stream.close();
        }
        
        // 关闭连接
        if (this.mongoClient) {
            await this.mongoClient.close();
        }
        
        if (this.redis) {
            await this.redis.quit();
        }
        
        console.log('ChangeStreams service closed');
    }
}

module.exports = ChangeStreamsService;