// Bybit API integration - handles REST API calls and WebSocket connections

import { CONFIG } from './config.js';

export class BybitAPI {
    constructor() {
        this.apiKey = CONFIG.BYBIT.API_KEY;
        this.apiSecret = CONFIG.BYBIT.API_SECRET;
        this.ws = null;
        this.priceCallbacks = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    // Set API credentials
    setCredentials(apiKey, apiSecret) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
    }

    // Generate signature for authenticated requests
    generateSignature(params, timestamp) {
        const crypto = window.crypto || window.msCrypto;
        const paramStr = timestamp + this.apiKey + '5000' + new URLSearchParams(params).toString();
        
        return this.hmacSHA256(paramStr, this.apiSecret);
    }

    // HMAC SHA256 implementation
    async hmacSHA256(message, secret) {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const messageData = encoder.encode(message);
        
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
        
        return Array.from(new Uint8Array(signature))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // Make authenticated REST API request
    async request(endpoint, method = 'GET', params = {}) {
        const timestamp = Date.now().toString();
        const url = new URL(CONFIG.BYBIT.BASE_URL + endpoint);

        let headers = {
            'Content-Type': 'application/json',
            'X-BAPI-API-KEY': this.apiKey,
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-RECV-WINDOW': '5000',
        };

        let body = null;

        if (method === 'GET') {
            Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
            const signature = await this.generateSignature(params, timestamp);
            headers['X-BAPI-SIGN'] = signature;
        } else {
            body = JSON.stringify(params);
            const signature = await this.generateSignature(params, timestamp);
            headers['X-BAPI-SIGN'] = signature;
        }

        try {
            const response = await fetch(url, {
                method,
                headers,
                body,
            });

            const data = await response.json();
            
            if (data.retCode !== 0) {
                throw new Error(`API Error: ${data.retMsg}`);
            }

            return data;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    }

    // Get account balance
    async getBalance() {
        try {
            const response = await this.request('/v5/account/wallet-balance', 'GET', {
                accountType: 'UNIFIED'
            });

            const coins = response.result.list[0]?.coin || [];
            const usdtBalance = coins.find(c => c.coin === 'USDT');
            
            return {
                total: parseFloat(usdtBalance?.walletBalance || 0),
                available: parseFloat(usdtBalance?.availableToWithdraw || 0),
            };
        } catch (error) {
            console.error('Error getting balance:', error);
            return { total: 0, available: 0 };
        }
    }

    // Get ticker data for all symbols
    async getTickers() {
        try {
            const response = await fetch(
                `${CONFIG.BYBIT.BASE_URL}/v5/market/tickers?category=linear`
            );
            const data = await response.json();
            
            if (data.retCode !== 0) {
                throw new Error(`API Error: ${data.retMsg}`);
            }

            return data.result.list;
        } catch (error) {
            console.error('Error getting tickers:', error);
            return [];
        }
    }

    // Get kline data for calculating percentage change
    async getKlines(symbol, interval = '30', limit = 2) {
        try {
            const response = await fetch(
                `${CONFIG.BYBIT.BASE_URL}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`
            );
            const data = await response.json();
            
            if (data.retCode !== 0) {
                throw new Error(`API Error: ${data.retMsg}`);
            }

            return data.result.list;
        } catch (error) {
            console.error('Error getting klines:', error);
            return [];
        }
    }

    // Calculate 30min percentage change for a symbol
    async get30MinChange(symbol) {
        try {
            const klines = await this.getKlines(symbol, '30', 2);
            
            if (klines.length < 2) return 0;

            const currentPrice = parseFloat(klines[0][4]); // Close price of current candle
            const previousPrice = parseFloat(klines[1][4]); // Close price of previous candle
            
            return ((currentPrice - previousPrice) / previousPrice) * 100;
        } catch (error) {
            console.error(`Error calculating change for ${symbol}:`, error);
            return 0;
        }
    }

    // Place market order
    async placeOrder(symbol, side, quantity) {
        try {
            const params = {
                category: 'linear',
                symbol: symbol,
                side: side, // 'Buy' or 'Sell'
                orderType: 'Market',
                qty: quantity.toString(),
            };

            const response = await this.request('/v5/order/create', 'POST', params);
            
            return {
                success: true,
                orderId: response.result.orderId,
                data: response.result,
            };
        } catch (error) {
            console.error('Error placing order:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    // Initialize WebSocket connection for real-time price updates
    initWebSocket(symbols, onPriceUpdate) {
        if (this.ws) {
            this.ws.close();
        }

        this.ws = new WebSocket(CONFIG.BYBIT.WS_URL);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            
            // Subscribe to ticker streams for all symbols
            const subscribeMsg = {
                op: 'subscribe',
                args: symbols.map(symbol => `tickers.${symbol}`)
            };
            
            this.ws.send(JSON.stringify(subscribeMsg));
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.topic && data.topic.startsWith('tickers.')) {
                    const symbol = data.topic.replace('tickers.', '');
                    const tickerData = data.data;
                    
                    if (tickerData && tickerData.lastPrice) {
                        onPriceUpdate(symbol, parseFloat(tickerData.lastPrice));
                    }
                }
            } catch (error) {
                console.error('WebSocket message error:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.ws.onclose = () => {
            console.log('WebSocket closed');
            
            // Attempt to reconnect
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
                setTimeout(() => {
                    this.initWebSocket(symbols, onPriceUpdate);
                }, 5000);
            }
        };
    }

    // Close WebSocket connection
    closeWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    // Get current positions
    async getPositions() {
        try {
            const response = await this.request('/v5/position/list', 'GET', {
                category: 'linear',
                settleCoin: 'USDT'
            });

            return response.result.list || [];
        } catch (error) {
            console.error('Error getting positions:', error);
            return [];
        }
    }
}


