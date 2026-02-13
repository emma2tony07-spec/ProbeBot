// Configuration file for the trading bot

export const CONFIG = {
    // Bybit Testnet API
    BYBIT: {
        BASE_URL: 'https://api-testnet.bybit.com',
        WS_URL: 'wss://stream-testnet.bybit.com/v5/public/linear',
        API_KEY: '', // User will input this
        API_SECRET: '', // User will input this
    },

    // Default trading parameters (user can modify)
    TRADING: {
        INITIAL_BALANCE: 10000,
        BUY_THRESHOLD: 2, // % increase to trigger buy
        SELL_THRESHOLD: 3, // % drop from peak to trigger sell
        TRADE_AMOUNT_PERCENT: 25, // % of balance per trade
        MIN_TRADE_AMOUNT: 1, // Minimum $1 trade
        MAX_POSITIONS: 4, // Maximum concurrent positions
    },

    // Static tokens (always monitored)
    STATIC_TOKENS: ['BTC', 'ETH', 'SOL', 'XRP', 'ADA'],

    // Top gainers settings
    TOP_GAINERS: {
        COUNT: 10, // Number of top gainers to monitor
        REFRESH_INTERVAL: 30 * 60 * 1000, // 30 minutes in milliseconds
        TIMEFRAME: '30m', // 30 minutes percentage change
    },

    // Update intervals
    INTERVALS: {
        PRICE_UPDATE: 1000, // 1 second for WebSocket updates
        UI_REFRESH: 1000, // 1 second UI refresh
        TOP_GAINERS_REFRESH: 30 * 60 * 1000, // 30 minutes
    },

    // Trading pair base (all tokens trade against USDT)
    QUOTE_CURRENCY: 'USDT',

    // Order settings
    ORDER: {
        TYPE: 'Market', // Market orders for guaranteed execution
        CATEGORY: 'linear', // Linear perpetual contracts
    },
};

// Helper function to get full symbol (e.g., BTC -> BTCUSDT)
export function getFullSymbol(token) {
    return `${token}${CONFIG.QUOTE_CURRENCY}`;
}

// Helper function to extract base token from symbol (e.g., BTCUSDT -> BTC)
export function getBaseToken(symbol) {
    return symbol.replace(CONFIG.QUOTE_CURRENCY, '');
}


