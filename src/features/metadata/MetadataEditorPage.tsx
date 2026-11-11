import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Space, Alert, Card, Form } from 'antd';
import { message } from '../../utils/message';
import { SearchOutlined, SaveOutlined } from '@ant-design/icons';
import { getMeta } from '../../baas/client';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import CodeEditor from '../../components/CodeEditor';

/** Keys the PATCH /meta validation accepts (everything else in the query output is read-only). */
const PATCHABLE_RELATION_KEYS = ['title', 'abstract', 'group', 'sort_id', 'tags', 'properties'] as const;
const PATCHABLE_FIELD_KEYS = ['alias', 'queryable', 'sort_id', 'properties'] as const;

function pick(obj: Record<string, any>, keys: readonly string[]): Record<string, any> {
  return Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => keys.includes(k)));
}

/** Reduce query output to the shape PATCH /meta accepts — per relation and per fields entry. */
function stripReadOnly(relations: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [rel, meta] of Object.entries(relations)) {
    const cleaned = pick(meta, PATCHABLE_RELATION_KEYS);
    if (meta?.fields && typeof meta.fields === 'object') {
      cleaned.fields = Object.fromEntries(
        Object.entries(meta.fields as Record<string, any>).map(([col, fmeta]) => [
          col,
          pick(fmeta, PATCHABLE_FIELD_KEYS),
        ]),
      );
    }
    out[rel] = cleaned;
  }
  return out;
}

export default function MetadataEditorPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [metadata, setMetadata] = useState<any>(null);
  const [editJson, setEditJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getMeta().query(query);
      setMetadata(res);
      setEditJson(JSON.stringify(res, null, 2));
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    try {
      const parsed = JSON.parse(editJson);
      // The editor holds the query result, which is already { relations: {...} }.
      const relations = parsed.relations ?? parsed;
      await getAdminClient().provisioning.metadata.patchMetaData({
        relations: stripReadOnly(relations),
      });
      message.success(t('metadata.updated'));
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    }
  };

  return (
    <div>
      <h2>
        {/* i18n-ignore */}
        Metadata Editor
      </h2>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder={t('metadata.queryPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={search}
          style={{ width: 400 }}
        />
        <Button icon={<SearchOutlined />} onClick={search} loading={loading}>{t('common.search')}</Button>
      </Space>
      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
      {metadata && (
        <Card
          title={t('metadata.title')}
          extra={<Button type="primary" icon={<SaveOutlined />} onClick={save}>{t('common.save')}</Button>}
        >
          <CodeEditor value={editJson} onChange={setEditJson} language="json" height="500px" />
        </Card>
      )}
    </div>
  );
}
