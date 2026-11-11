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
import type { FunctionInfo, FunctionTriggers } from '@mapcentia/gc2-sdk';
import FunctionInvokeDrawer from './FunctionInvokeDrawer';
import FunctionTypesDrawer from './FunctionTypesDrawer';

function triggerTags(t: FunctionTriggers | null | undefined) {
  if (!t) return null;
  const tags = [];
  if (t.schedule) tags.push(<Tag key="s" color="blue">⏱ {t.schedule}</Tag>);
  if (t.event?.table) tags.push(<Tag key="e" color="geekblue">⚡ {t.event.table}</Tag>);
  return <>{tags}</>;
}

export default function FunctionListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [invokeName, setInvokeName] = useState<string | null>(null);
  const [typesOpen, setTypesOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['functions'],
    queryFn: async () => await getAdminClient().provisioning.functions.getFunctions(),
    staleTime: 30_000,
  });

  const functions = Array.isArray(data) ? data : [];

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      try {
        await getAdminClient().provisioning.functions.deleteFunction(name);
        message.success(t('functions.deleted'));
        queryClient.invalidateQueries({ queryKey: ['functions'] });
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
        <h2>{/* i18n-ignore */}Functions</h2>
        <Space>
          <Button icon={<CodeOutlined />} onClick={() => setTypesOpen(true)}>{t('rpc.typeScriptTypes')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/functions/new')}>{t('functions.newFunction')}</Button>
        </Space>
      </Space>
      <Input.Search placeholder={t('functions.search')} allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={functions.filter((r) => !search || (r.name ?? '').toLowerCase().includes(search.toLowerCase()))}
        rowKey="name"
        size="small"
        pagination={false}
        columns={[
          { title: t('common.name'), dataIndex: 'name', key: 'name',
            sorter: (a: FunctionInfo, b: FunctionInfo) => (a.name ?? '').localeCompare(b.name ?? ''),
            render: (n: string) => <a onClick={() => navigate(`/functions/${n}`)}>{n}</a>,
          },
          { title: t('functions.colRuntime'), dataIndex: 'runtime', key: 'runtime',
            render: (v: string) => <Tag>{v}</Tag>,
          },
          { title: t('functions.colPackage'), dataIndex: 'package', key: 'package',
            render: (v: string) => <Tag color={v === 'zip' ? 'purple' : 'default'}>{v ?? (
              // i18n-ignore
              'inline'
            )}</Tag>,
          },
          { title: t('functions.triggers'), key: 'triggers',
            render: (_: unknown, r: FunctionInfo) => triggerTags(r.triggers),
          },
          { title: t('functions.colVersion'), dataIndex: 'version', key: 'version', width: 80 },
          { title: t('common.actions'), key: 'actions', width: 180,
            render: (_: unknown, record: FunctionInfo) => (
              <Space>
                <Button size="small" icon={<PlayCircleOutlined />} onClick={() => setInvokeName(record.name)}>{t('functions.invoke')}</Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
              </Space>
            ),
          },
        ]}
      />
      <FunctionInvokeDrawer name={invokeName} onClose={() => setInvokeName(null)} />
      <FunctionTypesDrawer open={typesOpen} onClose={() => setTypesOpen(false)} />
    </div>
  );
}
