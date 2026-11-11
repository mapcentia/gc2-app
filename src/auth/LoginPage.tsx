import { useEffect, useRef } from 'react';
import { Button, Card, Flex, Spin, Typography, theme } from 'antd';
import { LoginOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthProvider';

const AUTO_LOGIN_KEY = 'centia_auto_login_attempted';

export default function LoginPage() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { token } = theme.useToken();
  const attempted = useRef(sessionStorage.getItem(AUTO_LOGIN_KEY) === '1');

  useEffect(() => {
    if (!attempted.current) {
      sessionStorage.setItem(AUTO_LOGIN_KEY, '1');
      signIn();
    }
  }, [signIn]);

  if (!attempted.current) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '100vh', background: token.colorBgLayout }}>
        <Spin size="large" />
      </Flex>
    );
  }

  return (
    <Flex justify="center" align="center" style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Card style={{ width: 360, textAlign: 'center' }}>
        <img src="https://gc2.io/img/gc2-logo-dark.svg" // i18n-ignore
        alt="GC2" style={{ height: 40, marginBottom: 16 }} />
        {/* i18n-ignore */}
        <Typography.Title level={3}>GC2 Admin</Typography.Title>
        <Typography.Paragraph type="secondary">
          {t('auth.loginIntro')}
        </Typography.Paragraph>
        <Button type="primary" size="large" icon={<LoginOutlined />} onClick={signIn}>
          {t('auth.loginButton')}
        </Button>
      </Card>
    </Flex>
  );
}
