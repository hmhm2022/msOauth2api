module.exports = async (req, res) => {
    
    const { password } = req.method === 'GET' ? req.query : req.body;

    const expectedPassword = process.env.PASSWORD;

    if (password !== expectedPassword && expectedPassword) {
        return res.status(401).json({
            error: 'Authentication failed. Please provide valid credentials or contact administrator for access. Refer to API documentation for deployment details.'
        });
    }

    // 根据请求方法从 query 或 body 中获取参数
    const params = req.method === 'GET' ? req.query : req.body;
    const { refresh_token, client_id, email } = params;

    // 检查是否缺少必要的参数
    if (!refresh_token || !client_id) {
        return res.status(400).json({ error: 'Missing required parameters: refresh_token, client_id' });
    }

    // Graph API检测函数
    async function check_graph_api_support(refresh_token, client_id) {
        try {
            const response = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    'client_id': client_id,
                    'grant_type': 'refresh_token',
                    'refresh_token': refresh_token,
                    'scope': 'https://graph.microsoft.com/.default'
                }).toString()
            });

            if (!response.ok) {
                return {
                    supported: false,
                    error: `HTTP error! status: ${response.status}`,
                    access_token: null,
                    scope: null
                };
            }

            const data = await response.json();
            const scope = data.scope || '';
            
            // 检查是否有Mail.ReadWrite权限
            const hasMailReadWrite = scope.indexOf('https://graph.microsoft.com/Mail.ReadWrite') !== -1;
            
            return {
                supported: hasMailReadWrite,
                access_token: data.access_token,
                scope: scope,
                permissions: {
                    mailReadWrite: hasMailReadWrite,
                    mailRead: scope.indexOf('https://graph.microsoft.com/Mail.Read') !== -1,
                    userRead: scope.indexOf('https://graph.microsoft.com/User.Read') !== -1
                }
            };
        } catch (error) {
            return {
                supported: false,
                error: error.message,
                access_token: null,
                scope: null
            };
        }
    }

    // IMAP支持检测函数
    async function check_imap_support(refresh_token, client_id) {
        try {
            const response = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    'client_id': client_id,
                    'grant_type': 'refresh_token',
                    'refresh_token': refresh_token
                }).toString()
            });

            if (!response.ok) {
                return {
                    supported: false,
                    error: `HTTP error! status: ${response.status}`,
                    access_token: null,
                    scope: null
                };
            }

            const data = await response.json();
            const scope = data.scope || '';
            
            // 检查是否有IMAP相关权限
            const hasImapAccess = scope.indexOf('https://outlook.office.com/IMAP.AccessAsUser.All') !== -1 ||
                                 scope.indexOf('https://outlook.office.com/POP.AccessAsUser.All') !== -1;
            
            return {
                supported: hasImapAccess,
                access_token: data.access_token,
                scope: scope,
                permissions: {
                    imapAccess: scope.indexOf('https://outlook.office.com/IMAP.AccessAsUser.All') !== -1,
                    popAccess: scope.indexOf('https://outlook.office.com/POP.AccessAsUser.All') !== -1
                }
            };
        } catch (error) {
            return {
                supported: false,
                error: error.message,
                access_token: null,
                scope: null
            };
        }
    }

    try {
        console.log("开始检测token信息...");
        
        // 并行检测Graph API和IMAP支持
        const [graphResult, imapResult] = await Promise.all([
            check_graph_api_support(refresh_token, client_id),
            check_imap_support(refresh_token, client_id)
        ]);

        // 确定主要模式
        let primaryMode = 'unknown';
        let supportedModes = [];
        
        if (graphResult.supported) {
            primaryMode = 'graph';
            supportedModes.push('graph');
        }
        
        if (imapResult.supported) {
            if (primaryMode === 'unknown') {
                primaryMode = 'imap';
            }
            supportedModes.push('imap');
        }

        // 构建响应
        const tokenInfo = {
            primaryMode: primaryMode,
            supportedModes: supportedModes,
            email: email || 'not_provided',
            capabilities: {
                graphApi: {
                    supported: graphResult.supported,
                    permissions: graphResult.permissions || {},
                    scope: graphResult.scope,
                    error: graphResult.error || null
                },
                imap: {
                    supported: imapResult.supported,
                    permissions: imapResult.permissions || {},
                    scope: imapResult.scope,
                    error: imapResult.error || null
                }
            },
            features: {
                readEmails: graphResult.supported || imapResult.supported,
                deleteEmails: graphResult.supported || imapResult.supported,
                sendEmails: graphResult.supported,
                clearInbox: graphResult.supported || imapResult.supported,
                clearJunk: graphResult.supported || imapResult.supported
            },
            recommendations: []
        };

        // 添加建议
        if (graphResult.supported && imapResult.supported) {
            tokenInfo.recommendations.push("您的token同时支持Graph API和IMAP模式，建议优先使用Graph API以获得更好的性能");
        } else if (graphResult.supported) {
            tokenInfo.recommendations.push("您的token支持Graph API模式，可以使用所有高级功能");
        } else if (imapResult.supported) {
            tokenInfo.recommendations.push("您的token仅支持IMAP模式，功能相对有限但兼容性更好");
        } else {
            tokenInfo.recommendations.push("您的token似乎不支持邮件操作，请检查应用权限配置");
        }

        console.log(`Token检测完成 - 主要模式: ${primaryMode}, 支持的模式: ${supportedModes.join(', ')}`);
        
        res.status(200).json({
            success: true,
            tokenInfo: tokenInfo,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Token信息检测失败:', error);
        res.status(500).json({ 
            success: false,
            error: 'Token information detection failed', 
            details: error.message 
        });
    }
};
