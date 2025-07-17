import React, { useEffect, useState } from 'react';
import { OpenAPI } from '@/client';
import { createFileRoute } from '@tanstack/react-router';

const VerifyEmail: React.FC = () => {
    const [status, setStatus] = useState<string>('验证中...');
    // 正确获取 token 的方式
    const token = new URLSearchParams(window.location.search).get("token");
    console.log(token)


    useEffect(() => {
        if (token) {
            const verifyEmail = async () => {
                try {
                    // Call the backend verification interface
                    const response = await fetch(`${OpenAPI.BASE}/api/v1/verify-email/?token=${token}`, {
                        method: 'GET',
                    });

                    if (response.ok) {
                        setStatus('邮箱验证成功！');
                    } else {
                        const data = await response.json();
                        setStatus(data.message || '邮箱验证失败，请重试。');
                    }
                } catch (error) {
                    setStatus('请求出错，请检查网络连接。');
                }
            };

            verifyEmail();
        } else {
            setStatus('未提供验证令牌，请检查链接是否正确。');
        }
    }, [token]);

    return (
        <div>
            <h1>邮箱验证</h1>
            <p>{status}</p>
        </div>
    );
};

export const Route = createFileRoute('/verify-email')({
    component: VerifyEmail,
});

export default VerifyEmail;