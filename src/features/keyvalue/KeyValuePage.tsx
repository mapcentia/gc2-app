import { useState } from 'react';
import { Table, Button, Space, Drawer, Form, Input, Spin, Alert, Switch, Tag, Tooltip, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Keyvalue } from '@mapcentia/gc2-sdk';
import type { KeyvalueEntry } from '@mapcentia/gc2-sdk';
import i18n from '../../i18n';
import { message } from '../../utils/message';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { useAuth } from '../../auth/AuthProvider';
import { confirmDelete } from '../../components/ConfirmDelete';
import { queryClient } from '../../data/queryClient';
import CodeEditor from '../../components/CodeEditor';

const { Text } = Typography;

function kvClient() {
  return new Keyvalue(getAdminClient().http);
}

/** Live JSON validation: returns the parse error message, or null when valid. */
function jsonError(text: string): string | null {
  if (!text.trim()) return i18n.t('keyvalue.valueRequired');
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export default function KeyValuePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currentUser = (user?.uid as string) ?? '';
  const isSuperUser = user?.superUser === true;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<KeyvalueEntry | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [valueJson, setValueJson] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['keyvalue'],
    queryFn: async () => await kvClient().getKeyvalue(),
    staleTime: 30_000,
  });

  const entries = data ?? [];
  const valueError = jsonError(valueJson);

  /** Sub-users may only modify their own keys; owner null is treated as super-owned. */
  const canModify = (entry: KeyvalueEntry) =>
    isSuperUser || (entry.owner !== null && entry.owner === currentUser);

  const openCreate = () => {
    setEditEntry(null);
    setReadOnly(false);
    setKeyName('');
    setValueJson('');
    setIsPublic(false);
    setDrawerOpen(true);
  };

  const openEntry = (entry: KeyvalueEntry, view: boolean) => {
    setEditEntry(entry);
    setReadOnly(view);
    setKeyName(entry.key);
    setValueJson(JSON.stringify(entry.value, null, 2));
    setIsPublic(entry.public);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (valueError) return;
    const value = JSON.parse(valueJson);
    setSaving(true);
    try {
      if (editEntry) {
        await kvClient().patchKeyvalue(editEntry.key, { value, public: isPublic });
        message.success(t('keyvalue.updated'));
      } else {
        await kvClient().postKeyvalue(keyName.trim(), { value, public: isPublic });
        message.success(t('keyvalue.created'));
      }
      queryClient.invalidateQueries({ queryKey: ['keyvalue'] });
      setDrawerOpen(false);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (entry: KeyvalueEntry) => {
    confirmDelete(entry.key, async () => {
      try {
        await kvClient().deleteKeyvalue(entry.key);
        message.success(t('keyvalue.deleted'));
        queryClient.invalidateQueries({ queryKey: ['keyvalue'] });
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={getErrorMessage(error)} />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        {/* i18n-ignore */}
        <h2>Key/Value</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('keyvalue.newKey')}
        </Button>
      </Space>
      <Input.Search
        placeholder={t('keyvalue.search')}
        allowClear
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 12, maxWidth: 300 }}
      />
      <Table
        dataSource={entries.filter(
          (r) => !search || [r.key, r.owner ?? ''].some((v) => v.toLowerCase().includes(search.toLowerCase())),
        )}
        rowKey="key"
        size="small"
        pagination={false}
        columns={[
          { title: t('keyvalue.key'), dataIndex: 'key', key: 'key',
            sorter: (a: KeyvalueEntry, b: KeyvalueEntry) => a.key.localeCompare(b.key),
          },
          { title: t('keyvalue.owner'), dataIndex: 'owner', key: 'owner',
            render: (v: string | null) => v ?? <Text type="secondary">{/* i18n-ignore */}—</Text>,
          },
          { title: t('keyvalue.public'), dataIndex: 'public', key: 'public',
            render: (v: boolean) => (v ? <Tag color="green">{t('keyvalue.publicTag')}</Tag> : null),
          },
          { title: t('common.actions'), key: 'actions', width: 120,
            render: (_: unknown, entry: KeyvalueEntry) =>
              canModify(entry) ? (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEntry(entry, false)} />
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(entry)} />
                </Space>
              ) : (
                <Tooltip title={t('keyvalue.readOnlyTooltip')}>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openEntry(entry, true)} />
                </Tooltip>
              ),
          },
        ]}
      />
      <Drawer
        title={readOnly ? t('keyvalue.viewTitle', { key: keyName }) : editEntry ? t('keyvalue.editTitle', { key: keyName }) : t('keyvalue.createTitle')}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
        extra={
          !readOnly && (
            <Button type="primary" onClick={handleSave} loading={saving} disabled={!!valueError || (!editEntry && !keyName.trim())}>
              {t('common.save')}
            </Button>
          )
        }
      >
        <Form layout="vertical">
          {!editEntry && (
            <Form.Item label={t('keyvalue.key')} required>
              <Input
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                // i18n-ignore
                placeholder="my_key"
              />
            </Form.Item>
          )}
          <Form.Item
            label={t('keyvalue.valueJson')}
            validateStatus={!readOnly && valueError ? 'error' : undefined}
            help={!readOnly && valueError ? valueError : undefined}
          >
            <CodeEditor
              value={valueJson}
              onChange={readOnly ? () => undefined : setValueJson}
              language="json"
              height="360px"
            />
          </Form.Item>
          <Form.Item label={t('keyvalue.public')} tooltip={t('keyvalue.publicTooltip')}>
            <Switch checked={isPublic} onChange={setIsPublic} disabled={readOnly} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
