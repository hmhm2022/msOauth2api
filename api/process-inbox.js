// 生成IMAP认证字符串的辅助函数
const generateAuthString = (user, accessToken) => {
    const authString = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
    return Buffer.from(authString).toString('base64');
}

module.exports = async (req, res) => {

    const { password, action, message_id } = req.method === 'GET' ? req.query : req.body;

    const expectedPassword = process.env.PASSWORD;

    if (password !== expectedPassword) {
        return res.status(401).json({
            error: 'Authentication failed. Please provide valid credentials or contact administrator for access. Refer to API documentation for deployment details.'
        });
    }

    // 根据请求方法从 query 或 body 中获取参数
    const params = req.method === 'GET' ? req.query : req.body;
    const { refresh_token, client_id, email } = params;

    // 检查是否缺少必要的参数
    if (!refresh_token || !client_id || !email) {
        return res.status(400).json({ error: 'Missing required parameters: refresh_token, client_id, or email' });
    }

    async function get_access_token() {
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
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
        }

        const responseText = await response.text();

        try {
            const data = JSON.parse(responseText);
            return data.access_token;
        } catch (parseError) {
            throw new Error(`Failed to parse JSON: ${parseError.message}, response: ${responseText}`);
        }
    }

    async function graph_api(refresh_token, client_id) {
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
                console.log(`Graph API token request failed: ${response.status}`);
                return {
                    access_token: null,
                    status: false
                }
            }

            const responseText = await response.text();
            const data = JSON.parse(responseText);
            console.log(`Graph API scope: ${data.scope}`);

            // 检查是否有删除邮件所需的权限
            const hasMailReadWrite = data.scope && data.scope.indexOf('https://graph.microsoft.com/Mail.ReadWrite') !== -1;

            if (hasMailReadWrite) {
                console.log('Graph API: 有Mail.ReadWrite权限，可以清空收件箱');
                return {
                    access_token: data.access_token,
                    status: true
                }
            } else {
                console.log('Graph API: 没有Mail.ReadWrite权限，无法清空收件箱，将使用IMAP模式');
                return {
                    access_token: data.access_token,
                    status: false
                }
            }
        } catch (error) {
            console.log(`Graph API检测失败: ${error.message}，将使用IMAP模式`);
            return {
                access_token: null,
                status: false
            }
        }
    }



    // 检查是否是删除单个邮件的请求
    if (action === 'delete_single' && message_id) {
        console.log(`删除单个邮件: ${message_id}`);
        return deleteSingleEmailIMAP(refresh_token, client_id, email, message_id, res);
    }

    try {
        console.log("判断是否支持Graph API");
        const graph_api_result = await graph_api(refresh_token, client_id);

        if (graph_api_result.status) {
            console.log("使用Graph API模式清空收件箱");
            return await processInboxGraphAPI(graph_api_result.access_token, res);
        } else {
            console.log("使用IMAP模式清空收件箱");
            return await processInboxIMAP(refresh_token, client_id, email, res);
        }

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error', details: error.message });
    }
};

// Graph API模式处理函数
async function processInboxGraphAPI(access_token, res) {
    try {

        // 使用 Microsoft Graph API 获取收件箱中的所有邮件
        async function getAllMessages() {
            let allMessages = [];
            let nextLink = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$select=id&$top=1000`;

            while (nextLink) {
                console.log(`Fetching messages from: ${nextLink}`);
                const response = await fetch(nextLink, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${access_token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Failed to get messages: ${response.status}, ${errorText}`);
                }

                const data = await response.json();
                if (data.value && data.value.length > 0) {
                    allMessages = allMessages.concat(data.value);
                }

                // 检查是否有下一页
                nextLink = data['@odata.nextLink'] || null;
            }

            return allMessages;
        }

        // 删除单个邮件
        async function deleteMessage(messageId) {
            console.log(`Deleting message: ${messageId}`);
            const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to delete message ${messageId}: ${response.status}, ${errorText}`);
            }

            return true;
        }

        // 获取并删除所有邮件
        const messages = await getAllMessages();

        if (messages.length === 0) {
            console.log('No Inbox emails found.');
            return res.json({ message: 'No Inbox emails found.' });
        }

        console.log(`Found ${messages.length} messages to delete`);

        // 删除所有邮件
        let deletedCount = 0;
        let failedCount = 0;

        for (const message of messages) {
            try {
                await deleteMessage(message.id);
                deletedCount++;
            } catch (error) {
                console.error(`Error deleting message ${message.id}:`, error);
                failedCount++;
            }
        }

        console.log(`[Graph API] Deleted ${deletedCount} messages, failed to delete ${failedCount} messages`);
        return res.json({
            message: 'Inbox emails processed successfully via Graph API.',
            mode: 'graph',
            stats: {
                total: messages.length,
                deleted: deletedCount,
                failed: failedCount
            }
        });

    } catch (error) {
        console.error('Graph API Error:', error);
        return res.status(500).json({ error: 'Graph API Error', details: error.message });
    }
}

// IMAP模式处理函数
async function processInboxIMAP(refresh_token, client_id, email, res) {
    const Imap = require('imap');

    try {
        const access_token = await get_access_token_for_imap(refresh_token, client_id);
        const authString = generateAuthString(email, access_token);

        const imap = new Imap({
            user: email,
            xoauth2: authString,
            host: 'outlook.office365.com',
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false
            }
        });

        let deletedCount = 0;
        let failedCount = 0;
        let totalMessages = 0;
        let responseHandled = false;

        // 安全的响应发送函数
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
                // 打开收件箱
                const box = await new Promise((resolve, reject) => {
                    imap.openBox('INBOX', false, (err, box) => {
                        if (err) return reject(err);
                        totalMessages = box.messages.total;
                        console.log(`Found ${totalMessages} messages in INBOX`);
                        resolve(box);
                    });
                });

                if (totalMessages === 0) {
                    sendResponse(200, {
                        message: 'No Inbox emails found.',
                        mode: 'imap',
                        stats: { total: 0, deleted: 0, failed: 0 }
                    });
                    imap.end();
                    return;
                }

                // 搜索所有邮件
                const results = await new Promise((resolve, reject) => {
                    imap.search(["ALL"], (err, results) => {
                        if (err) return reject(err);
                        resolve(results);
                    });
                });

                console.log(`Found ${results.length} messages to delete`);

                // 批量标记删除
                if (results.length > 0) {
                    try {
                        await new Promise((resolve, reject) => {
                            imap.setFlags(results, ['\\Deleted'], (err) => {
                                if (err) {
                                    console.error('Error marking messages for deletion:', err);
                                    failedCount = results.length;
                                    reject(err);
                                } else {
                                    deletedCount = results.length;
                                    console.log(`Marked ${deletedCount} messages for deletion`);

                                    // 执行删除
                                    imap.expunge((err) => {
                                        if (err) {
                                            console.error('Error expunging messages:', err);
                                            reject(err);
                                        } else {
                                            console.log('Messages expunged successfully');
                                            resolve();
                                        }
                                    });
                                }
                            });
                        });

                        // 删除成功
                        sendResponse(200, {
                            message: 'Inbox emails processed successfully via IMAP.',
                            mode: 'imap',
                            stats: {
                                total: totalMessages,
                                deleted: deletedCount,
                                failed: failedCount
                            }
                        });

                    } catch (error) {
                        console.error('Error in batch delete:', error);
                        failedCount = results.length;
                        deletedCount = 0;

                        sendResponse(500, {
                            error: 'IMAP batch delete failed',
                            details: error.message,
                            mode: 'imap',
                            stats: {
                                total: totalMessages,
                                deleted: deletedCount,
                                failed: failedCount
                            }
                        });
                    }
                } else {
                    sendResponse(200, {
                        message: 'No emails to delete in INBOX.',
                        mode: 'imap',
                        stats: { total: totalMessages, deleted: 0, failed: 0 }
                    });
                }

                imap.end();

            } catch (err) {
                console.error('IMAP processing error:', err);
                sendResponse(500, {
                    error: 'IMAP processing error',
                    details: err.message,
                    mode: 'imap'
                });
                imap.end();
            }
        });

        imap.once('error', (err) => {
            console.error('IMAP connection error:', err);
            sendResponse(500, {
                error: 'IMAP connection error',
                details: err.message,
                mode: 'imap'
            });
        });

        imap.once('end', () => {
            console.log(`[IMAP] 连接结束 - Deleted ${deletedCount} messages, failed to delete ${failedCount} messages`);
            // 响应已在ready事件中处理，这里不需要再次发送
        });

        // 设置连接超时
        setTimeout(() => {
            if (!responseHandled) {
                console.log('[IMAP] 连接超时');
                sendResponse(500, {
                    error: 'IMAP operation timeout',
                    mode: 'imap'
                });
                imap.end();
            }
        }, 60000); // 60秒超时（批量操作需要更长时间）

        imap.connect();

    } catch (error) {
        console.error('IMAP Error:', error);
        res.status(500).json({ error: 'IMAP Error', details: error.message });
    }
}

// IMAP专用的token获取函数
async function get_access_token_for_imap(refresh_token, client_id) {
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
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
    }

    const responseText = await response.text();

    try {
        const data = JSON.parse(responseText);
        return data.access_token;
    } catch (parseError) {
        throw new Error(`Failed to parse JSON: ${parseError.message}, response: ${responseText}`);
    }
}

// 删除单个邮件的函数（复用process-inbox的成功逻辑）
async function deleteSingleEmailIMAP(refresh_token, client_id, email, message_id, res) {
    const Imap = require('imap');

    console.log('🔧 开始单个邮件删除（复用process-inbox逻辑）');

    try {
        const access_token = await get_access_token_for_imap(refresh_token, client_id);
        const authString = generateAuthString(email, access_token);

        const imap = new Imap({
            user: email,
            xoauth2: authString,
            host: 'outlook.office365.com',
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false
            }
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

                // 使用与process-inbox相同的方式打开邮箱（只读模式）
                const box = await new Promise((resolve, reject) => {
                    imap.openBox('INBOX', false, (err, box) => { // 与process-inbox保持一致
                        if (err) return reject(err);
                        console.log(`✅ INBOX已打开，总邮件数: ${box.messages.total}`);
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

                // 使用与process-inbox完全相同的删除逻辑
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
                    message: 'Email deleted successfully via IMAP (using process-inbox logic).',
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
