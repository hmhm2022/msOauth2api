const { generateAuthString, get_access_token, graph_api } = require('./utils');

module.exports = async (req, res) => {
    const { password, message_id, mailbox } = req.method === 'GET' ? req.query : req.body;

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
    if (!refresh_token || !client_id || !email || !message_id) {
        return res.status(400).json({ error: 'Missing required parameters: refresh_token, client_id, email, or message_id' });
    }

    // 默认文件夹为 INBOX
    const folderName = mailbox || 'INBOX';

    try {
        console.log(`判断是否支持Graph API（文件夹: ${folderName}）`);
        const graph_api_result = await graph_api(refresh_token, client_id);

        if (graph_api_result.status) {
            console.log(`使用Graph API模式删除邮件（文件夹: ${folderName}）`);
            return await deleteSingleEmailGraphAPI(graph_api_result.access_token, message_id, res);
        } else {
            console.log(`使用IMAP模式删除邮件（文件夹: ${folderName}）`);
            return await deleteSingleEmailIMAP(refresh_token, client_id, email, message_id, folderName, res);
        }

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error', details: error.message });
    }
};

// Graph API模式删除单个邮件
async function deleteSingleEmailGraphAPI(access_token, message_id, res) {
    try {
        console.log(`使用Graph API删除邮件: ${message_id}`);
        
        const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${message_id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to delete message ${message_id}: ${response.status}, ${errorText}`);
        }

        console.log(`Graph API删除邮件成功: ${message_id}`);
        return res.json({
            success: true,
            message: 'Email deleted successfully via Graph API.',
            mode: 'graph',
            messageId: message_id,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Graph API删除邮件失败:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Graph API Error', 
            details: error.message,
            mode: 'graph',
            messageId: message_id
        });
    }
}

// IMAP模式删除单个邮件
async function deleteSingleEmailIMAP(refresh_token, client_id, email, message_id, folderName, res) {
    const Imap = require('imap');

    console.log(`🔧 开始单个邮件删除（IMAP模式，文件夹: ${folderName}）`);

    try {
        const access_token = await get_access_token(refresh_token, client_id);
        const authString = generateAuthString(email, access_token);

        const imap = new Imap({
            user: email,
            xoauth2: authString,
            host: 'outlook.office365.com',
            port: 993,
            tls: true
        });

        let responseHandled = false;
        const sendResponse = (statusCode, data) => {
            if (!responseHandled) {
                responseHandled = true;
                if (statusCode === 200) {
                    res.json(data);
                } else {
                    res.status(statusCode).json(data);
                }
            }
        };

        imap.once("ready", async () => {
            try {
                console.log('📡 IMAP连接已建立');

                // 打开指定文件夹
                await new Promise((resolve, reject) => {
                    imap.openBox(folderName, false, (err, box) => {
                        if (err) return reject(err);
                        console.log(`✅ ${folderName}已打开，总邮件数: ${box.messages.total}`);
                        resolve(box);
                    });
                });

                // 搜索指定的邮件
                console.log(`🔍 搜索Message-ID: ${message_id}`);
                const searchResults = await new Promise((resolve, reject) => {
                    imap.search([['HEADER', 'MESSAGE-ID', message_id]], (err, results) => {
                        if (err) return reject(err);
                        resolve(results || []);
                    });
                });

                if (searchResults.length === 0) {
                    sendResponse(404, {
                        success: false,
                        error: 'Email not found',
                        mode: 'imap',
                        messageId: message_id
                    });
                    imap.end();
                    return;
                }

                console.log(`✅ 找到邮件，序列号: ${searchResults[0]}`);

                // 标记删除并执行
                await new Promise((resolve, reject) => {
                    imap.setFlags(searchResults, ['\\Deleted'], (err) => {
                        if (err) {
                            console.error('标记删除失败:', err);
                            reject(err);
                        } else {
                            console.log('✅ 邮件已标记为删除');

                            // 执行删除
                            imap.expunge((err) => {
                                if (err) {
                                    console.error('执行删除失败:', err);
                                    reject(err);
                                } else {
                                    console.log('🎉 邮件删除成功');
                                    resolve();
                                }
                            });
                        }
                    });
                });

                sendResponse(200, {
                    success: true,
                    message: 'Email deleted successfully via IMAP.',
                    mode: 'imap',
                    messageId: message_id,
                    timestamp: new Date().toISOString()
                });
                imap.end();

            } catch (error) {
                console.error('❌ IMAP操作失败:', error);
                sendResponse(500, {
                    success: false,
                    error: 'IMAP processing error',
                    details: error.message,
                    mode: 'imap',
                    messageId: message_id
                });
                imap.end();
            }
        });

        imap.once('error', (err) => {
            console.error('❌ IMAP连接错误:', err);
            if (!responseHandled) {
                sendResponse(500, {
                    success: false,
                    error: 'IMAP connection error',
                    details: err.message,
                    mode: 'imap',
                    messageId: message_id
                });
            }
        });

        imap.once('end', () => {
            console.log('📡 IMAP连接已关闭');
        });

        // 设置连接超时
        setTimeout(() => {
            if (!responseHandled) {
                console.log('[IMAP] 连接超时');
                sendResponse(500, {
                    success: false,
                    error: 'IMAP operation timeout',
                    mode: 'imap',
                    messageId: message_id
                });
                imap.end();
            }
        }, 30000); // 30秒超时

        console.log('🔌 连接IMAP服务器...');
        imap.connect();

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete email',
            details: error.message,
            mode: 'imap',
            messageId: message_id
        });
    }
}
