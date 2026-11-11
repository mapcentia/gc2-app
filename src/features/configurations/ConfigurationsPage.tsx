import { useState } from 'react';
import { Table, Button, Space, Drawer, Form, Input, Spin, Alert, Switch, Tag, Tooltip, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, CopyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Configurations } from '@mapcentia/gc2-sdk';
import type { Configuration, PatchConfigurationRequest } from '@mapcentia/gc2-sdk';
import { message } from '../../utils/message';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { useAuth } from '../../auth/AuthProvider';
import { confirmDelete } from '../../components/ConfirmDelete';
import { queryClient } from '../../data/queryClient';
import CodeEditor from '../../components/CodeEditor';
import UrlField from '../ogc/UrlField';
import { STARTER_BODY, bodyProblem, formatBody } from './configBody';
import type { BodyProblem } from './configBody';

const { Text } = Typography;

const QUERY_KEY = ['configurations'];

function client() {
  return new Configurations(getAdminClient().http);
}

export default function ConfigurationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperUser = user?.superUser === true;
  const database = (user?.database as string) ?? '';

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Configuration | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [published, setPublished] = useState(true);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => await client().getConfiguration(),
    staleTime: 30_000,
    // Sub-users get 403 SUPER_USER_ONLY; don't ask.
    enabled: isSuperUser,
  });

  if (!isSuperUser) return <Alert type="info" showIcon message={t('configurations.superUserOnly')} />;

  const configurations = data ?? [];
  const problem = bodyProblem(body);

  const problemText = (p: BodyProblem): string => {
    switch (p.kind) {
      case 'required': return t('configurations.bodyRequired');
      case 'syntax': return t('configurations.bodyInvalid', { detail: p.detail });
      case 'notObject': return t('configurations.bodyNotObject');
      case 'empty': return t('configurations.bodyEmpty');
    }
  };

  const publicUrl = (key: string) => client().publicConfigurationUrl(database, key);

  const copyUrl = async (key: string) => {
    await navigator.clipboard.writeText(publicUrl(key));
    message.success(t('configurations.urlCopied'));
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setPublished(true);
    setBody(STARTER_BODY);
    setDrawerOpen(true);
  };

  const openEdit = (c: Configuration) => {
    setEditing(c);
    setName(c.name);
    setDescription(c.description);
    setPublished(c.published);
    // Shown exactly as stored; it is only rewritten if the user edits or formats it.
    setBody(c.body);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (problem || !name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        // Send only what changed, so an untouched body stays byte for byte as it was.
        const patch: PatchConfigurationRequest = {};
        if (name !== editing.name) patch.name = name;
        if (description !== editing.description) patch.description = description;
        if (published !== editing.published) patch.published = published;
        if (body !== editing.body) patch.body = body;
        if (Object.keys(patch).length > 0) {
          await client().patchConfiguration(editing.key, patch);
        }
        message.success(t('configurations.updated'));
      } else {
        await client().postConfiguration({ name, description, published, body });
        message.success(t('configurations.created'));
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setDrawerOpen(false);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (c: Configuration) => {
    confirmDelete(c.name, async () => {
      try {
        await client().deleteConfiguration(c.key);
        message.success(t('configurations.deleted'));
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={getErrorMessage(error)} />;

  const needle = search.toLowerCase();

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        {/* i18n-ignore */}
        <h2>Configurations</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('configurations.newConfiguration')}
        </Button>
      </Space>
      <Input.Search
        placeholder={t('configurations.search')}
        allowClear
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 12, maxWidth: 300 }}
      />
      <Table
        dataSource={configurations.filter(
          (c) => !needle || [c.name, c.description, c.key].some((v) => v.toLowerCase().includes(needle)),
        )}
        rowKey="key"
        size="small"
        pagination={false}
        columns={[
          { title: t('common.name'), dataIndex: 'name', key: 'name',
            sorter: (a: Configuration, b: Configuration) => a.name.localeCompare(b.name),
            defaultSortOrder: 'ascend',
          },
          { title: t('configurations.description'), dataIndex: 'description', key: 'description', ellipsis: true },
          { title: t('configurations.published'), dataIndex: 'published', key: 'published', width: 120,
            render: (v: boolean) => (v ? <Tag color="green">{t('common.yes')}</Tag> : <Text type="secondary">{t('common.no')}</Text>),
          },
          { title: t('common.actions'), key: 'actions', width: 150,
            render: (_: unknown, c: Configuration) => (
              <Space>
                <Tooltip title={c.published ? t('configurations.copyUrl') : t('configurations.notPublishedHelp')}>
                  <Button size="small" icon={<CopyOutlined />} disabled={!c.published} onClick={() => copyUrl(c.key)} />
                </Tooltip>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(c)} />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(c)} />
              </Space>
            ),
          },
        ]}
      />
      <Drawer
        title={editing ? t('configurations.editTitle', { name: editing.name }) : t('configurations.createTitle')}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={720}
        extra={
          <Button type="primary" onClick={handleSave} loading={saving} disabled={!!problem || !name.trim()}>
            {t('common.save')}
          </Button>
        }
      >
        <Form layout="vertical">
          <Form.Item label={t('common.name')} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Form.Item>
          <Form.Item label={t('configurations.description')}>
            <Input.TextArea value={description} onChange={(e) => setDescription(e.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} />
          </Form.Item>
          <Form.Item label={t('configurations.published')} tooltip={t('configurations.publishedTooltip')}>
            <Switch checked={published} onChange={setPublished} />
          </Form.Item>
          <Form.Item
            label={t('configurations.body')}
            validateStatus={problem ? 'error' : 'success'}
            help={problem ? problemText(problem) : t('configurations.bodyValid')}
            extra={
              <Button size="small" style={{ marginTop: 8 }} disabled={!!problem && problem.kind !== 'empty'} onClick={() => setBody(formatBody(body))}>
                {t('configurations.formatJson')}
              </Button>
            }
          >
            <CodeEditor value={body} onChange={setBody} language="json" height="420px" />
          </Form.Item>
          {editing && (
            editing.published ? (
              <>
                <UrlField
                  label={t('configurations.publicUrl')}
                  url={publicUrl(editing.key)}
                  openUrl={publicUrl(editing.key)}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>{t('configurations.publicUrlHelp')}</Text>
              </>
            ) : (
              <Text type="secondary">{t('configurations.notPublishedHelp')}</Text>
            )
          )}
        </Form>
      </Drawer>
    </div>
  );
}
