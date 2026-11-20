import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Button, Card, Drawer, Form, Input, InputNumber, Popconfirm, Segmented, Select, Space, Spin, Typography,
} from 'antd';
import { BuildOutlined, DeleteOutlined, ProfileOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { Search } from '@mapcentia/gc2-sdk';
import type { SearchResult } from '@mapcentia/gc2-sdk';
import { message } from '../../utils/message';
import { getAdminClient, getApiErrorCode, getErrorMessage } from '../../baas/adminClient';
import { useAuth } from '../../auth/AuthProvider';
import { confirmDelete } from '../../components/ConfirmDelete';
import { formatNumber } from '../../i18n';
import CodeEditor from '../../components/CodeEditor';
import ResultTable from '../../components/ResultTable';
import SchemaTableSelect from '../../components/SchemaTableSelect';
import MappingDrawer from './MappingDrawer';

const { Text, Paragraph } = Typography;

type Mode = 'simple' | 'dsl';
type Operator = 'OR' | 'AND';

const DEFAULT_DSL = JSON.stringify({ query: { match_all: {} }, size: 10 }, null, 2);

function searchClient() {
  return new Search(getAdminClient().http);
}

/** Parses `text` as a JSON object; returns the parse error message when it is not one. */
function parseObject(text: string): { value?: Record<string, unknown>; error?: string } {
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return { error: 'object' };
    return { value };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** One table row per hit: _id and _score, then the document's attribute columns. */
function toRows(result: SearchResult): Record<string, unknown>[] {
  return result.hits.hits.map((hit) => ({
    _id: hit._id,
    _score: hit._score,
    ...(hit._source?.properties ?? {}),
  }));
}

export default function SearchPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isOwner = user?.superUser === true;

  const [schema, setSchema] = useState<string | null>(null);
  const [table, setTable] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('simple');
  const [q, setQ] = useState('');
  const [size, setSize] = useState<number>(10);
  const [operator, setOperator] = useState<Operator>('OR');
  const [dsl, setDsl] = useState(DEFAULT_DSL);

  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState<{ code?: string; message: string } | null>(null);

  const [building, setBuilding] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsText, setSettingsText] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const hasRelation = !!schema && !!table;
  const dslParsed = parseObject(dsl);
  const dslError = dslParsed.error === 'object' ? t('search.mustBeObject') : dslParsed.error;
  const settingsParsed = parseObject(settingsText);
  const settingsError = settingsParsed.error === 'object' ? t('search.mustBeObject') : settingsParsed.error;

  const reset = () => {
    setResult(null);
    setSearchError(null);
  };

  const runSearch = async () => {
    if (!schema || !table) return;
    if (mode === 'dsl' && !dslParsed.value) return;
    setSearching(true);
    setSearchError(null);
    try {
      // OpenSearch rejects default_operator (400) unless there is a q for it to apply to.
      const query = q.trim();
      const res = mode === 'simple'
        ? await searchClient().search(schema, table, query ? { q: query, size, default_operator: operator } : { size })
        : await searchClient().searchPost(schema, table, dslParsed.value!);
      setResult(res);
    } catch (e: unknown) {
      setResult(null);
      setSearchError({ code: getApiErrorCode(e) ?? undefined, message: getErrorMessage(e) });
    } finally {
      setSearching(false);
    }
  };
  // The editor binds its Ctrl-Enter handler once, so it has to reach the current closure through a ref.
  const runRef = useRef(runSearch);
  runRef.current = runSearch;

  const handleBuild = async () => {
    if (!schema || !table) return;
    setBuilding(true);
    try {
      const built = await searchClient().buildSearchIndex(schema, table);
      if (built.errors) {
        message.warning(t('search.builtWithErrors', { n: formatNumber(built.errors_in?.length ?? 0) }));
      } else {
        message.success(built.message || t('search.built'));
      }
      reset();
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setBuilding(false);
    }
  };

  const handleDrop = () => {
    if (!schema || !table) return;
    confirmDelete(t('search.indexFor', { relation: `${schema}.${table}` }), async () => {
      try {
        await searchClient().dropSearchIndex(schema, table);
        message.success(t('search.dropped'));
        reset();
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  const openSettings = async () => {
    setSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const settings = await searchClient().getSearchSettings();
      setSettingsText(JSON.stringify(settings.analysis ?? {}, null, 2));
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
      setSettingsOpen(false);
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settingsParsed.value) return;
    setSettingsSaving(true);
    try {
      await searchClient().putSearchSettings({ analysis: settingsParsed.value });
      message.success(t('search.settingsSaved'));
      setSettingsOpen(false);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSettingsSaving(false);
    }
  };

  const total = result?.hits.total?.value ?? 0;

  return (
    <div>
      <Space style={{ marginBottom: 8, justifyContent: 'space-between', width: '100%' }}>
        <h2>{t('search.title')}</h2>
        {isOwner && (
          <Button icon={<SettingOutlined />} onClick={openSettings}>
            {t('search.analysisSettings')}
          </Button>
        )}
      </Space>
      <Paragraph type="secondary">{t('search.intro')}</Paragraph>

      <Space wrap style={{ marginBottom: 16 }}>
        <SchemaTableSelect
          schema={schema}
          table={table}
          onSchemaChange={(s) => { setSchema(s ?? null); reset(); }}
          onTableChange={(tbl) => { setTable(tbl || null); reset(); }}
        />
        {isOwner && (
          <>
            <Popconfirm
              title={t('search.buildConfirm')}
              okText={t('search.buildIndex')}
              placement="bottomLeft"
              styles={{ root: { maxWidth: 360 } }}
              onConfirm={handleBuild}
              disabled={!hasRelation}
            >
              <Button icon={<BuildOutlined />} loading={building} disabled={!hasRelation}>
                {t('search.buildIndex')}
              </Button>
            </Popconfirm>
            <Button icon={<ProfileOutlined />} onClick={() => setMappingOpen(true)} disabled={!hasRelation}>
              {t('search.mapping')}
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={handleDrop} disabled={!hasRelation || building}>
              {t('search.dropIndex')}
            </Button>
          </>
        )}
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            options={[
              { label: t('search.modeSimple'), value: 'simple' },
              { label: t('search.modeDsl'), value: 'dsl' },
            ]}
          />
          {mode === 'simple' ? (
            <Space wrap>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onPressEnter={runSearch}
                placeholder={t('search.queryPlaceholder')}
                allowClear
                style={{ width: 420 }}
              />
              <Select
                value={operator}
                onChange={setOperator}
                options={(['OR', 'AND'] as const).map((v) => ({ label: v, value: v }))}
                style={{ width: 90 }}
              />
              <InputNumber
                value={size}
                onChange={(v) => setSize(v ?? 10)}
                min={1}
                max={10000}
                addonBefore={t('search.size')}
                style={{ width: 150 }}
              />
            </Space>
          ) : (
            <Form.Item
              validateStatus={dslError ? 'error' : undefined}
              help={dslError ?? t('search.dslHelp')}
              style={{ marginBottom: 0 }}
            >
              <CodeEditor value={dsl} onChange={setDsl} language="json" height="220px" onRun={() => runRef.current()} />
            </Form.Item>
          )}
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={runSearch}
            loading={searching}
            disabled={!hasRelation || (mode === 'dsl' && !!dslError)}
          >
            {t('common.search')}
          </Button>
        </Space>
      </Card>

      {!hasRelation && <Alert type="info" showIcon message={t('search.chooseRelation')} />}

      {searchError && (
        searchError.code === 'INDEX_NOT_FOUND' ? (
          <Alert
            type="info"
            showIcon
            message={t('search.noIndex')}
            description={isOwner ? t('search.noIndexOwnerHint') : t('search.noIndexHint')}
          />
        ) : (
          <Alert type="error" showIcon message={searchError.message} />
        )
      )}

      {result && (
        <>
          <Paragraph>
            <Text strong>{t('search.hits', { shown: formatNumber(result.hits.hits.length), total: formatNumber(total) })}</Text>
            {result.hits.total?.relation === 'gte' && <Text type="secondary"> {t('search.orMore')}</Text>}
            <Text type="secondary"> · {t('search.took', { ms: formatNumber(result.took ?? 0) })}</Text>
          </Paragraph>
          <ResultTable data={toRows(result)} />
          {result.aggregations && (
            <>
              <h4>{t('search.aggregations')}</h4>
              <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 6, maxHeight: 400, overflow: 'auto' }}>
                {JSON.stringify(result.aggregations, null, 2)}
              </pre>
            </>
          )}
        </>
      )}

      {isOwner && schema && table && (
        <MappingDrawer
          schema={schema}
          table={table}
          open={mappingOpen}
          onClose={() => setMappingOpen(false)}
          onRebuilt={reset}
        />
      )}

      <Drawer
        title={t('search.analysisSettings')}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        width={600}
        extra={
          <Button type="primary" onClick={saveSettings} loading={settingsSaving} disabled={settingsLoading || !!settingsError}>
            {t('common.save')}
          </Button>
        }
      >
        {settingsLoading ? <Spin /> : (
          <Form layout="vertical">
            <Alert type="info" showIcon message={t('search.settingsNote')} style={{ marginBottom: 16 }} />
            <Form.Item
              label={t('search.analysisJson')}
              validateStatus={settingsError ? 'error' : undefined}
              help={settingsError}
            >
              <CodeEditor value={settingsText} onChange={setSettingsText} language="json" height="460px" />
            </Form.Item>
          </Form>
        )}
      </Drawer>
    </div>
  );
}
