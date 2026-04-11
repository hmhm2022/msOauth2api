const Imap = require('node-imap');
const simpleParser = require("mailparser").simpleParser;
const { generateAuthString, get_access_token, graph_api } = require('./utils');

async function get_emails(access_token, mailbox) {

    if (!access_token) {
        console.log("Failed to obtain access token'");
        return;
    }

    try {
        // 添加$select参数以获取internetMessageId字段
        const response = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/${mailbox}/messages?$top=1&$orderby=receivedDateTime desc&$select=id,from,subject,bodyPreview,body,createdDateTime,internetMessageId`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                "Authorization": `Bearer ${access_token}`
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            return
        }

        const responseData = await response.json();

        const emails = responseData.value;

        const response_emails = emails.map(item => {
            return {
                id: item['id'],
                messageId: item['internetMessageId'] || item['id'], // 完整的Message-ID
                send: item['from']['emailAddress']['address'],
                subject: item['subject'],
                text: item['bodyPreview'],
                html: item['body']['content'],
                date: item['createdDateTime'],
                mode: 'graph' // 标识使用的模式
            }
        })

        return response_emails

    } catch (error) {
        console.error('Error fetching emails:', error);
        return;
    }

}

function buildResponseData(mail, seqno) {
    const generatedId = `imap_${seqno}_${Date.now()}`;
    const headerMessageId = mail?.headers?.get?.('message-id');

    return {
        id: generatedId,
        messageId: mail?.messageId || headerMessageId || generatedId,
        send: mail?.from?.text || '',
        subject: mail?.subject || '',
        text: mail?.text || '',
        html: mail?.html || '',
        date: mail?.date || null,
        mode: 'imap',
        _imapSeqno: seqno
    };
}

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
    let { refresh_token, client_id, email, mailbox, response_type = 'json' } = params;

    // 检查是否缺少必要的参数
    if (!refresh_token || !client_id || !email || !mailbox) {
        return res.status(400).json({ error: 'Missing required parameters: refresh_token, client_id, email, or mailbox' });
    }

    try {

        console.log("判断是否graph_api");

        const graph_api_result = await graph_api(refresh_token, client_id)

        if (graph_api_result.status) {

            console.log("是graph_api");

            if (mailbox != "INBOX" && mailbox != "Junk") {
                mailbox = "inbox";
            }

            if (mailbox == 'INBOX') {
                mailbox = 'inbox';
            }

            if (mailbox == 'Junk') {
                mailbox = 'junkemail';
            }

            const result = await get_emails(graph_api_result.access_token, mailbox);

            res.status(200).json(result);

            return
        }

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

        const sendJsonResponse = (statusCode, data) => {
            if (responseHandled) {
                return;
            }

            responseHandled = true;
            res.status(statusCode).json(data);
        };

        const sendHtmlResponse = (html) => {
            if (responseHandled) {
                return;
            }

            responseHandled = true;
            res.status(200).send(html);
        };

        imap.once("ready", async () => {
            try {
                // 动态打开指定的邮箱（如 INBOX 或 Junk）
                await new Promise((resolve, reject) => {
                    imap.openBox(mailbox, true, (err, box) => {
                        if (err) return reject(err);
                        resolve(box);
                    });
                });

                const results = await new Promise((resolve, reject) => {
                    imap.search(["ALL"], (err, results) => {
                        if (err) return reject(err);
                        const latestMail = results.slice(-1); // 只获取最新的一封邮件
                        resolve(latestMail);
                    });
                });

                const responseData = await new Promise((resolve, reject) => {
                    let hasParsedMail = false;
                    const f = imap.fetch(results, { bodies: "" });

                    f.on("message", (msg, seqno) => {
                        msg.on("body", (stream) => {
                            simpleParser(stream, (err, mail) => {
                                if (err) {
                                    return reject(new Error(`Failed to parse message ${seqno}: ${err.message}`));
                                }

                                try {
                                    const responseData = buildResponseData(mail, seqno);
                                    hasParsedMail = true;
                                    resolve(responseData);
                                } catch (parseError) {
                                    reject(new Error(`Failed to normalize message ${seqno}: ${parseError.message}`));
                                }
                            });
                        });
                    });

                    f.once("error", reject);
                    f.once("end", () => {
                        if (!hasParsedMail) {
                            reject(new Error('No email content was parsed'));
                        }
                    });
                });

                imap.end();

                if (response_type === 'json') {
                    return sendJsonResponse(200, responseData);
                }

                if (response_type === 'html') {
                    const htmlResponse = `
                        <html>
                            <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f9f9f9;">
                                <div style="margin: 0 auto; background: #fff; padding: 20px; border: 1px solid #ddd; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                                    <h1 style="color: #333;">邮件信息</h1>
                                    <p><strong>邮件ID:</strong> ${responseData.id}</p>
                                    <p><strong>Message-ID:</strong> ${responseData.messageId}</p>
                                    <p><strong>模式:</strong> ${responseData.mode}</p>
                                    <p><strong>发件人:</strong> ${responseData.send}</p>
                                    <p><strong>主题:</strong> ${responseData.subject}</p>
                                    <p><strong>日期:</strong> ${responseData.date}</p>
                                    <div style="background: #f4f4f4; padding: 10px; border: 1px solid #ddd;">
                                        <p><strong>内容:</strong></p>
                                        <p>${responseData.text.replace(/\n/g, '<br>')}</p>
                                    </div>
                                </div>
                            </body>
                        </html>
                    `;
                    return sendHtmlResponse(htmlResponse);
                }

                return sendJsonResponse(400, { error: 'Invalid response_type. Use "json" or "html".' });
            } catch (err) {
                imap.end();
                sendJsonResponse(500, { error: err.message });
            }
        });

        imap.once('error', (err) => {
            console.error('IMAP error:', err);
            sendJsonResponse(500, { error: err.message });
        });

        imap.connect();

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
};
