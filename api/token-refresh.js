const { refresh_tokens, is_refresh_token_invalid } = require('./utils');

module.exports = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const params = req.method === 'GET' ? req.query : req.body;
    const { password, refresh_token, client_id, email } = params;

    const expectedPassword = process.env.PASSWORD;

    if (password !== expectedPassword && expectedPassword) {
        return res.status(401).json({
            error: 'Authentication failed. Please provide valid credentials or contact administrator for access. Refer to API documentation for deployment details.'
        });
    }

    if (!refresh_token || !client_id || !email) {
        return res.status(400).json({
            error: 'Missing required parameters: refresh_token, client_id, or email'
        });
    }

    try {
        const tokenResult = await refresh_tokens(refresh_token, client_id);
        const hasNewRefreshToken = Boolean(tokenResult.refresh_token);

        return res.status(200).json({
            success: true,
            email,
            token_info: {
                new_refresh_token: tokenResult.refresh_token,
                expires_in: tokenResult.expires_in,
                rt_expires_at: tokenResult.rt_expires_at,
                rt_was_refreshed: hasNewRefreshToken,
                rt_reauth_required: false
            }
        });
    } catch (error) {
        const requiresReauth = is_refresh_token_invalid(error);
        return res.status(requiresReauth ? 401 : 500).json({
            success: false,
            error: requiresReauth
                ? 'Refresh token has expired, re-authorization required'
                : error.message,
            rt_reauth_required: requiresReauth
        });
    }
};
