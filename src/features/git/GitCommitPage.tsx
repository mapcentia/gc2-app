import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Input, Select, Button, Card, Alert } from 'antd';
import { message } from '../../utils/message';
import { BranchesOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { useSchemaNames } from '../../hooks/useSchemaNames';

export default function GitCommitPage() {
  const { t } = useTranslation();
  const { data: schemasData } = useSchemaNames();
  const schemas: string[] = (schemasData?.map((s) => s.name) ?? []).sort();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  const handleCommit = async () => {
    const values = await form.validateFields();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await getAdminClient().provisioning.gitCommit.postCommit(values);
      setResult(data);
      message.success(t('git.success'));
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>
        {/* i18n-ignore */}
        Git Commit
      </h2>
      <Card style={{ maxWidth: 600 }}>
        <Form form={form} layout="vertical">
          <Form.Item name="schema" label={t('git.schema')} rules={[{ required: true }]}>
            <Select options={schemas.map((s) => ({ label: s, value: s }))} placeholder={t('git.selectSchema')} />
          </Form.Item>
          <Form.Item name="repo" label={t('git.repoUrl')} rules={[{ required: true }]}>
            <Input
              // i18n-ignore
              placeholder="https://github.com/user/repo.git"
            />
          </Form.Item>
          <Form.Item name="message" label={t('git.commitMessage')} rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder={t('git.messagePlaceholder')} />
          </Form.Item>
          <Form.Item name="meta_query" label={t('git.metaQuery')}>
            <Input placeholder={t('git.metaPlaceholder')} />
          </Form.Item>
          <Button type="primary" icon={<BranchesOutlined />} onClick={handleCommit} loading={loading}>
            {t('git.commitPush')}
          </Button>
        </Form>
      </Card>
      {error && <Alert type="error" message={error} style={{ marginTop: 16 }} />}
      {result && (
        <Card title={t('git.result')} style={{ marginTop: 16 }}>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
}
