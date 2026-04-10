// api/utils.js
// 微软 OAuth2 邮件 API 公共工具函数

/**
 * 生成 IMAP XOAUTH2 认证字符串
 * @param {string} user - 用户邮箱地址
 * @param {string} accessToken - OAuth2 访问令牌
 * @returns {string} Base64 编码的认证字符串
 */
const generateAuthString = (user, accessToken) => {
    const authString = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
    return Buffer.from(authString).toString('base64');
};

function estimate_rt_expires_at() {
    const rtExpiresAt = new Date();
    rtExpiresAt.setDate(rtExpiresAt.getDate() + 90);
    return rtExpiresAt.toISOString();
}

function is_refresh_token_invalid(error) {
    const message = String(error?.message || error || '');
    return message.includes('invalid_grant')
        || message.includes('AADSTS70008')
        || message.includes('AADSTS700082');
}

async function refresh_tokens(refresh_token, client_id, extraParams = {}) {
    const response = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id,
            grant_type: 'refresh_token',
            refresh_token,
            ...extraParams
        }).toString()
    });

    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}, response: ${responseText}`);
    }

    try {
        const data = JSON.parse(responseText);
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token || null,
            expires_in: data.expires_in || null,
            scope: data.scope || '',
            rt_expires_at: estimate_rt_expires_at()
        };
    } catch (parseError) {
        throw new Error(`Failed to parse JSON: ${parseError.message}, response: ${responseText}`);
    }
}

/**
 * 获取 OAuth2 访问令牌
 * @param {string} refresh_token - 刷新令牌
 * @param {string} client_id - 客户端 ID
 * @returns {Promise<string>} 访问令牌
 */
async function get_access_token(refresh_token, client_id) {
    const tokenResult = await refresh_tokens(refresh_token, client_id);
    return tokenResult.access_token;
}

/**
 * 检测 Graph API 支持情况
 * @param {string} refresh_token - 刷新令牌
 * @param {string} client_id - 客户端 ID
 * @returns {Promise<{access_token: string, status: boolean}>} Graph API 支持状态
 */
async function graph_api(refresh_token, client_id) {
    const tokenResult = await refresh_tokens(refresh_token, client_id, {
        scope: 'https://graph.microsoft.com/.default'
    });
    const scope = tokenResult.scope || '';

    return {
        access_token: tokenResult.access_token,
        refresh_token: tokenResult.refresh_token,
        expires_in: tokenResult.expires_in,
        rt_expires_at: tokenResult.rt_expires_at,
        status: scope.indexOf('https://graph.microsoft.com/Mail.ReadWrite') !== -1
    };
}

module.exports = {
    generateAuthString,
    get_access_token,
    graph_api,
    refresh_tokens,
    is_refresh_token_invalid
};
