import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, Button, Space, Input, Spin, Alert, Tag } from 'antd';
import { message } from '../../utils/message';
import { PlusOutlined, DeleteOutlined, PlayCircleOutlined, CodeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import RpcCallDrawer from './RpcCallDrawer';
import RpcTypesDrawer from './RpcTypesDrawer';

export default function RpcListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [callMethod, setCallMethod] = useState<string | null>(null);
  const [typesOpen, setTypesOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['rpc-methods'],
    queryFn: async () => await getAdminClient().provisioning.rpcMethods.getRpc(),
    staleTime: 30_000,
  });

  const methods = Array.isArray(data) ? data : [];

  const handleDelete = (method: string) => {
    confirmDelete(method, async () => {
      try {
        await getAdminClient().provisioning.rpcMethods.deleteRpc(method);
        message.success(t('rpc.deleted'));
        queryClient.invalidateQueries({ queryKey: ['rpc-methods'] });
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2>
          {/* i18n-ignore */}
          JSON-RPC Methods
        </h2>
        <Space>
          <Button icon={<CodeOutlined />} onClick={() => setTypesOpen(true)}>{t('rpc.typeScriptTypes')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rpc/new')}>{t('rpc.newMethod')}</Button>
        </Space>
      </Space>
      <Input.Search placeholder={t('rpc.searchMethods')} allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={methods.filter((r: any) => !search || (r.method ?? '').toLowerCase().includes(search.toLowerCase()))}
        rowKey="method"
        size="small"
        pagination={false}
        columns={[
          { title: t('rpc.colMethod'), dataIndex: 'method', key: 'method',
            sorter: (a: any, b: any) => (a.method ?? '').localeCompare(b.method ?? ''),
            render: (m: string) => <a onClick={() => navigate(`/rpc/${m}`)}>{m}</a>,
          },
          { title: t('rpc.outputFormat'), dataIndex: 'output_format', key: 'format',
            sorter: (a: any, b: any) => (a.output_format ?? '').localeCompare(b.output_format ?? ''),
            render: (v: string) => <Tag>{v ?? (
              // i18n-ignore
              'json'
            )}</Tag>,
          },
          { title: t('common.actions'), key: 'actions', width: 200,
            render: (_: unknown, record: any) => (
              <Space>
                <Button size="small" icon={<PlayCircleOutlined />} onClick={() => setCallMethod(record.method)}>{t('rpc.call')}</Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.method)} />
              </Space>
            ),
          },
        ]}
      />
      <RpcCallDrawer method={callMethod} onClose={() => setCallMethod(null)} />
      <RpcTypesDrawer open={typesOpen} onClose={() => setTypesOpen(false)} />
    </div>
  );
}
