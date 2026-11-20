import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Drawer, Form, Input, Popconfirm, Select, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import { UndoOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Search } from '@mapcentia/gc2-sdk';
import { message } from '../../utils/message';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { queryClient } from '../../data/queryClient';
import {
  BUILTIN_ANALYZERS, MAPPING_TYPES, buildOverrides, inferType, isLegacyIndex, isLegacyType, readOverrides,
  type Overrides,
} from './mapping';

const { Text } = Typography;

interface Props {
  schema: string;
  table: string;
  open: boolean;
  onClose: () => void;
  /** Called after the index was rebuilt, so the page can drop results from the old index. */
  onRebuilt: () => void;
}

interface Row {
  column: string;
  pgType: string | null;
  inferred: string | null;
  /** An override for a column the relation no longer has. */
  orphan: boolean;
}

interface Outcome {
  type: 'success' | 'warning' | 'error';
  message: string;
  errorsIn?: unknown[];
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
/** A boolean override as a Select value; a legacy string is shown as it is stored. */
const boolValue = (v: unknown): string | undefined =>
  typeof v === 'boolean' ? String(v) : typeof v === 'string' && v !== '' ? v : undefined;

export default function MappingDrawer({ schema, table, open, onClose, onRebuilt }: Props) {
  const { t } = useTranslation();
  const rel = `${schema}.${table}`;

  const [overrides, setOverrides] = useState<Overrides>({});
  const [fieldsText, setFieldsText] = useState<Record<string, string>>({});
  const [fieldsErrors, setFieldsErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'rebuild' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const meta = useQuery({
    queryKey: ['search-mapping', rel],
    queryFn: async () => (await getAdminClient().provisioning.metadata.getMetaData(rel)).relations[rel] ?? null,
    enabled: open,
    staleTime: 0,
  });
  const settings = useQuery({
    queryKey: ['search-settings'],
    queryFn: async () => await new Search(getAdminClient().http).getSearchSettings(),
    enabled: open,
    staleTime: 0,
  });

  // Start from what is stored every time the drawer opens or the stored block changes.
  useEffect(() => {
    if (!open) return;
    const stored = readOverrides(meta.data?.elasticsearch);
    setOverrides(stored);
    setFieldsText(Object.fromEntries(
      Object.entries(stored).filter(([, o]) => o.fields !== undefined).map(([c, o]) => [c, JSON.stringify(o.fields, null, 2)]),
    ));
    setFieldsErrors({});
  }, [open, meta.data]);

  useEffect(() => {
    if (open) setOutcome(null);
  }, [open, rel]);

  const rows: Row[] = useMemo(() => {
    const fields = meta.data?.fields ?? {};
    const known: Row[] = Object.entries(fields).map(([column, f]) => ({
      column,
      pgType: f._type ?? null,
      inferred: inferType(f._type, column === meta.data?._geometry_column ? meta.data?._geom_type : null),
      orphan: false,
    }));
    const orphans: Row[] = Object.keys(overrides)
      .filter((c) => !(c in fields))
      .map((column) => ({ column, pgType: null, inferred: null, orphan: true }));
    return [...known, ...orphans];
  }, [meta.data, overrides]);

  const analysis = (settings.data?.analysis ?? {}) as Record<string, unknown>;
  const keysOf = (block: unknown) => (block && typeof block === 'object' ? Object.keys(block as object).sort() : []);
  const ownAnalyzers = keysOf(analysis.analyzer);
  const normalizers = keysOf(analysis.normalizer);
  const analyzerOptions = [
    { label: t('search.mapOwnAnalyzers'), options: ownAnalyzers.map((v) => ({ label: v, value: v })) },
    { label: t('search.mapBuiltinAnalyzers'), options: BUILTIN_ANALYZERS.filter((v) => !ownAnalyzers.includes(v)).map((v) => ({ label: v, value: v })) },
  ];
  const boolOptions = [
    { label: t('common.yes'), value: 'true' },
    { label: t('common.no'), value: 'false' },
  ];

  const setKey = (column: string, key: string, value: unknown) => {
    setOverrides((prev) => {
      const next = { ...(prev[column] ?? {}) };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { ...prev, [column]: next };
    });
  };
  const setBool = (column: string, key: string, v: string | undefined) =>
    setKey(column, key, v === undefined ? undefined : v === 'true');

  const resetColumn = (column: string) => {
    setOverrides(({ [column]: _dropped, ...rest }) => rest);
    setFieldsText(({ [column]: _dropped, ...rest }) => rest);
    setFieldsErrors(({ [column]: _dropped, ...rest }) => rest);
  };

  const clearAll = () => {
    setOverrides({});
    setFieldsText({});
    setFieldsErrors({});
  };

  const hasOverride = (column: string) =>
    Object.values(overrides[column] ?? {}).some((v) => v !== undefined && v !== null && v !== '') || !!fieldsText[column]?.trim();

  const save = async (rebuild: boolean) => {
    const built = buildOverrides(overrides, fieldsText, Object.fromEntries(rows.map((r) => [r.column, r.inferred])));
    setFieldsErrors(built.errors);
    if (!built.overrides) {
      message.error(t('search.mapFieldsInvalid', { columns: Object.keys(built.errors).join(', ') }));
      return;
    }
    setBusy(rebuild ? 'rebuild' : 'save');
    setOutcome(null);
    try {
      // PATCH replaces the relation's whole block, so this is every column that has overrides.
      await getAdminClient().provisioning.metadata.patchMetaData({ relations: { [rel]: { elasticsearch: built.overrides } } });
      queryClient.invalidateQueries({ queryKey: ['search-mapping', rel] });
      queryClient.invalidateQueries({ queryKey: ['metadata', rel] });
      if (!rebuild) {
        message.success(t('search.mapSaved'));
        return;
      }
      const res = await new Search(getAdminClient().http).buildSearchIndex(schema, table);
      setOutcome(res.errors
        ? { type: 'warning', message: res.message || t('search.mapBuiltWithErrors'), errorsIn: res.errors_in ?? [] }
        : { type: 'success', message: res.message || t('search.built') });
      onRebuilt();
    } catch (e: unknown) {
      setOutcome({ type: 'error', message: getErrorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const loading = meta.isLoading || settings.isLoading;
  const loadError = meta.error ?? settings.error;

  const columns = [
    {
      title: t('search.mapColumn'), key: 'column', width: 220,
      render: (_: unknown, row: Row) => {
        const o = overrides[row.column] ?? {};
        const legacy = isLegacyType(o.elasticsearchtype) || isLegacyIndex(o.index);
        return (
          <Space direction="vertical" size={0}>
            <Text strong style={{ wordBreak: 'break-word' }}>{row.column}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.orphan ? t('search.mapOrphan') : (row.pgType ?? '')}
            </Text>
            {legacy && (
              <Tooltip title={t('search.mapLegacyHint')}>
                <Tag color="warning">{t('search.mapLegacy')}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: t('common.type'), key: 'type', width: 150,
      render: (_: unknown, row: Row) => {
        const value = str(overrides[row.column]?.elasticsearchtype);
        return (
          <Select
            value={value}
            onChange={(v) => setKey(row.column, 'elasticsearchtype', v)}
            options={MAPPING_TYPES.map((v) => ({ label: v, value: v }))}
            placeholder={row.inferred ?? t('search.mapAuto')}
            status={isLegacyType(value) ? 'warning' : undefined}
            allowClear
            style={{ width: '100%' }}
          />
        );
      },
    },
    ...(['analyzer', 'search_analyzer'] as const).map((key) => ({
      title: key === 'analyzer' ? t('search.mapAnalyzer') : t('search.mapSearchAnalyzer'), key, width: 230,
      render: (_: unknown, row: Row) => {
        const o = overrides[row.column] ?? {};
        const isText = (str(o.elasticsearchtype) ?? row.inferred) === 'text';
        return (
          <Select
            value={str(o[key])}
            onChange={(v) => setKey(row.column, key, v)}
            options={analyzerOptions}
            disabled={!isText && !str(o[key])}
            popupMatchSelectWidth={false}
            showSearch
            allowClear
            style={{ width: '100%' }}
          />
        );
      },
    })),
    {
      title: t('search.mapIndex'), key: 'index', width: 100,
      render: (_: unknown, row: Row) => {
        const raw = overrides[row.column]?.index;
        return (
          <Select
            value={boolValue(raw)}
            onChange={(v) => setBool(row.column, 'index', v)}
            options={boolOptions}
            placeholder={t('common.yes')}
            status={isLegacyIndex(raw) ? 'warning' : undefined}
            allowClear
            style={{ width: '100%' }}
          />
        );
      },
    },
    {
      key: 'reset', width: 48,
      render: (_: unknown, row: Row) => (
        <Tooltip title={t('search.mapReset')}>
          <Button size="small" icon={<UndoOutlined />} disabled={!hasOverride(row.column)} onClick={() => resetColumn(row.column)} />
        </Tooltip>
      ),
    },
  ];

  const advanced = (row: Row) => {
    const o = overrides[row.column] ?? {};
    const type = str(o.elasticsearchtype) ?? row.inferred;
    const nullValue = o.null_value;
    return (
      <Form layout="vertical" style={{ maxWidth: 760 }}>
        <Space wrap align="start" size="large">
          <Form.Item label={t('search.mapFormat')} tooltip={t('search.mapFormatTip')} style={{ width: 220 }}>
            <Input
              value={str(o.format) ?? ''}
              onChange={(e) => setKey(row.column, 'format', e.target.value || undefined)}
              disabled={type !== 'date' && !str(o.format)}
              // i18n-ignore
              placeholder="strict_date_optional_time||epoch_millis"
            />
          </Form.Item>
          <Form.Item label={t('search.mapNullValue')} tooltip={t('search.mapNullValueTip')} style={{ width: 160 }}>
            <Input
              value={nullValue === undefined || nullValue === null ? '' : String(nullValue)}
              onChange={(e) => setKey(row.column, 'null_value', e.target.value || undefined)}
            />
          </Form.Item>
          <Form.Item label={t('search.mapFielddata')} tooltip={t('search.mapFielddataTip')} style={{ width: 120 }}>
            <Select
              value={boolValue(o.fielddata)}
              onChange={(v) => setBool(row.column, 'fielddata', v)}
              options={boolOptions}
              placeholder={t('common.no')}
              disabled={type !== 'text' && o.fielddata === undefined}
              allowClear
            />
          </Form.Item>
          <Form.Item label={t('search.mapNormalizer')} tooltip={t('search.mapNormalizerTip')} style={{ width: 200 }}>
            <Select
              value={str(o.normalizer)}
              onChange={(v) => setKey(row.column, 'normalizer', v)}
              options={normalizers.map((v) => ({ label: v, value: v }))}
              disabled={type !== 'keyword' && !str(o.normalizer)}
              allowClear
            />
          </Form.Item>
        </Space>
        <Form.Item
          label={t('search.mapFields')}
          tooltip={t('search.mapFieldsTip')}
          validateStatus={fieldsErrors[row.column] ? 'error' : undefined}
          help={fieldsErrors[row.column] === 'object' ? t('search.mustBeObject') : fieldsErrors[row.column]}
          style={{ marginBottom: 0 }}
        >
          <Input.TextArea
            value={fieldsText[row.column] ?? ''}
            onChange={(e) => setFieldsText((prev) => ({ ...prev, [row.column]: e.target.value }))}
            autoSize={{ minRows: 2, maxRows: 10 }}
            style={{ fontFamily: 'monospace' }}
            // i18n-ignore
            placeholder='{"keyword": {"type": "keyword", "ignore_above": 256}}'
          />
        </Form.Item>
      </Form>
    );
  };

  return (
    <Drawer
      title={t('search.mapTitle', { relation: rel })}
      open={open}
      onClose={onClose}
      width={1000}
      extra={
        <Space>
          <Popconfirm title={t('search.mapClearConfirm')} okText={t('search.mapClearAll')} onConfirm={clearAll} placement="bottomRight">
            <Button disabled={!!busy || Object.keys(overrides).length === 0}>{t('search.mapClearAll')}</Button>
          </Popconfirm>
          <Button onClick={() => save(false)} loading={busy === 'save'} disabled={loading || !!busy}>
            {t('common.save')}
          </Button>
          <Button type="primary" onClick={() => save(true)} loading={busy === 'rebuild'} disabled={loading || !!busy}>
            {t('search.mapSaveAndRebuild')}
          </Button>
        </Space>
      }
    >
      {loading ? <Spin /> : loadError ? (
        <Alert type="error" showIcon message={getErrorMessage(loadError)} />
      ) : (
        <>
          <Alert type="info" showIcon message={t('search.mapIntro')} style={{ marginBottom: 12 }} />
          {outcome && (
            <Alert
              type={outcome.type}
              showIcon
              closable
              onClose={() => setOutcome(null)}
              message={outcome.message}
              description={outcome.errorsIn && (
                <pre style={{ maxHeight: 240, overflow: 'auto', margin: 0 }}>{JSON.stringify(outcome.errorsIn, null, 2)}</pre>
              )}
              style={{ marginBottom: 12 }}
            />
          )}
          <Table
            dataSource={rows}
            rowKey="column"
            columns={columns}
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={false}
            expandable={{ expandedRowRender: advanced }}
          />
        </>
      )}
    </Drawer>
  );
}
