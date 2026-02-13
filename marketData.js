// Market Data - Handles top gainers tracking and price monitoring

import { CONFIG, getFullSymbol, getBaseToken } from './config.js';

export class MarketData {
    constructor(bybitAPI) {
        this.bybitAPI = bybitAPI;
        this.topGainers = [];
        this.staticTokens = CONFIG.STATIC_TOKENS;
        this.monitoredTokens = new Map(); // All tokens being monitored (top gainers + static)
        this.prices = new Map(); // Current prices for all monitored tokens
        this.lastTopGainersUpdate = null;
    }

    // Get top gainers from Bybit (30min percentage change)
    async fetchTopGainers() {
        try {
            console.log('Fetching top gainers...');
            const tickers = await this.bybitAPI.getTickers();
            
            // Filter for USDT pairs only
            const usdtPairs = tickers.filter(ticker => 
                ticker.symbol.endsWith('USDT') && 
                !ticker.symbol.startsWith('USDT')
            );

            // Calculate 30min change for each pair
            const gainersWithChange = await Promise.all(
                usdtPairs.map(async (ticker) => {
                    const change = await this.bybitAPI.get30MinChange(ticker.symbol);
                    return {
                        symbol: ticker.symbol,
                        baseToken: getBaseToken(ticker.symbol),
                        currentPrice: parseFloat(ticker.lastPrice),
                        change30m: change,
                        volume24h: parseFloat(ticker.volume24h),
                    };
                })
            );

            // Sort by 30min change and get top 10
            gainersWithChange.sort((a, b) => b.change30m - a.change30m);
            this.topGainers = gainersWithChange.slice(0, CONFIG.TOP_GAINERS.COUNT);

            this.lastTopGainersUpdate = new Date();
            
            console.log('Top 10 Gainers:', this.topGainers.map(g => 
                `${g.baseToken} (${g.change30m.toFixed(2)}%)`
            ).join(', '));

            return this.topGainers;
        } catch (error) {
            console.error('Error fetching top gainers:', error);
            return [];
        }
    }

    // Get all tokens to monitor (top gainers + static tokens)
    getMonitoredTokens() {
        const tokens = new Set();

        // Add static tokens
        this.staticTokens.forEach(token => tokens.add(token));

        // Add top gainers
        this.topGainers.forEach(gainer => tokens.add(gainer.baseToken));

        return Array.from(tokens);
    }

    // Get full symbols for all monitored tokens
    getMonitoredSymbols() {
        const tokens = this.getMonitoredTokens();
        return tokens.map(token => getFullSymbol(token));
    }

    // Initialize monitoring (fetch top gainers and start price tracking)
    async initialize() {
        // Fetch initial top gainers
        await this.fetchTopGainers();

        // Get all monitored tokens
        const monitoredTokens = this.getMonitoredTokens();
        
        // Initialize monitored tokens map with current prices
        const tickers = await this.bybitAPI.getTickers();
        
        monitoredTokens.forEach(token => {
            const symbol = getFullSymbol(token);
            const ticker = tickers.find(t => t.symbol === symbol);
            
            if (ticker) {
                this.monitoredTokens.set(token, {
                    symbol: token,
                    fullSymbol: symbol,
                    currentPrice: parseFloat(ticker.lastPrice),
                    highestPrice: parseFloat(ticker.lastPrice),
                    lowestPrice: parseFloat(ticker.lastPrice),
                    change30m: 0,
                    lastUpdate: new Date(),
                });

                this.prices.set(symbol, parseFloat(ticker.lastPrice));
            }
        });

        console.log(`Initialized monitoring for ${monitoredTokens.length} tokens`);
    }

    // Update price from WebSocket
    updatePrice(symbol, price) {
        const baseToken = getBaseToken(symbol);
        
        // Update price map
        this.prices.set(symbol, price);

        // Update monitored token data
        if (this.monitoredTokens.has(baseToken)) {
            const tokenData = this.monitoredTokens.get(baseToken);
            
            tokenData.currentPrice = price;
            tokenData.lastUpdate = new Date();

            // Update highest and lowest prices
            if (price > tokenData.highestPrice) {
                tokenData.highestPrice = price;
            }
            if (price < tokenData.lowestPrice) {
                tokenData.lowestPrice = price;
            }
        }
    }

    // Get current price for a symbol
    getPrice(symbol) {
        return this.prices.get(symbol) || 0;
    }

    // Get monitored token data
    getTokenData(token) {
        return this.monitoredTokens.get(token);
    }

    // Get all monitored tokens data as array
    getAllTokensData() {
        return Array.from(this.monitoredTokens.values());
    }

    // Check if top gainers need refresh
    shouldRefreshTopGainers() {
        if (!this.lastTopGainersUpdate) return true;
        
        const timeSinceUpdate = Date.now() - this.lastTopGainersUpdate.getTime();
        return timeSinceUpdate >= CONFIG.TOP_GAINERS.REFRESH_INTERVAL;
    }

    // Refresh top gainers and update monitored tokens
    async refreshTopGainers() {
        const oldGainers = new Set(this.topGainers.map(g => g.baseToken));
        
        await this.fetchTopGainers();
        
        const newGainers = new Set(this.topGainers.map(g => g.baseToken));
        
        // Add new gainers to monitoring
        newGainers.forEach(token => {
            if (!this.monitoredTokens.has(token)) {
                const symbol = getFullSymbol(token);
                const price = this.prices.get(symbol) || 0;
                
                this.monitoredTokens.set(token, {
                    symbol: token,
                    fullSymbol: symbol,
                    currentPrice: price,
                    highestPrice: price,
                    lowestPrice: price,
                    change30m: 0,
                    lastUpdate: new Date(),
                });
            }
        });

        // Note: We don't remove old gainers from monitoring
        // because we might have open positions on them
        
        console.log('Top gainers refreshed');
    }

    // Reset monitoring data for a specific token (after trade)
    resetTokenMonitoring(token) {
        const tokenData = this.monitoredTokens.get(token);
        if (tokenData) {
            tokenData.highestPrice = tokenData.currentPrice;
            tokenData.lowestPrice = tokenData.currentPrice;
        }
    }

    // Get formatted token list for display
    getFormattedTokenList() {
        const tokens = this.getAllTokensData();
        
        return tokens.map(token => ({
            symbol: token.symbol,
            price: token.currentPrice,
            change: ((token.currentPrice - token.lowestPrice) / token.lowestPrice * 100).toFixed(2),
            isStatic: this.staticTokens.includes(token.symbol),
            isTopGainer: this.topGainers.some(g => g.baseToken === token.symbol),
        }));
    }
}
