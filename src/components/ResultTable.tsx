import { useState } from 'react';
import { Table, Segmented, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

interface Props {
  data: Record<string, unknown>[] | null;
  schema?: Record<string, { type: string }>;
}

export default function ResultTable({ data, schema }: Props) {
  const { t } = useTranslation();
  const [view, setView] = useState<'table' | 'json'>('table');

  if (!data || data.length === 0) {
    return <Typography.Text type="secondary">{t('components.noResults')}</Typography.Text>;
  }

  const columns = Object.keys(data[0]).map((key) => ({
    title: key,
    dataIndex: key,
    key,
    ellipsis: true,
    // i18n-ignore
    render: (v: unknown) => (v === null ? <i>NULL</i> : typeof v === 'object' ? JSON.stringify(v) : String(v)),
  }));

  return (
    <div>
      <Segmented
        options={['table', 'json']}
        value={view}
        onChange={(v) => setView(v as 'table' | 'json')}
        style={{ marginBottom: 12 }}
      />
      {view === 'table' ? (
        <Table
          dataSource={data.map((row, i) => ({ ...row, _key: i }))}
          columns={columns}
          rowKey="_key"
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 50, showSizeChanger: true }}
        />
      ) : (
        <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 6, maxHeight: 500, overflow: 'auto' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
