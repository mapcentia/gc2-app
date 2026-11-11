import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, AutoComplete, Button, Card, Checkbox, Descriptions, InputNumber, Popover, Select, Space, Spin,
  Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  CameraOutlined, CopyOutlined, DownloadOutlined, LinkOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Snapshots, isCentiaApiError } from '@mapcentia/gc2-sdk';
import type { RelationSnapshot, SnapshotFormat, SnapshotFormatResult, SnapshotJob, SnapshotStatus } from '@mapcentia/gc2-sdk';
import { message } from '../../utils/message';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { getStatus } from '../../baas/client';
import { useAuth } from '../../auth/AuthProvider';
import { queryClient } from '../../data/queryClient';
import { formatNumber } from '../../i18n';
import { useSchemaNames, useTableSummary } from '../../hooks/useSchemaNames';

const { Text, Paragraph } = Typography;

/** Only plain identifiers can be snapshotted. */
const RELATION_NAME = /^[A-Za-z0-9_-]+$/;

function snapshotsClient() {
  return new Snapshots(getAdminClient().http);
}

const STATUS_COLOR: Record<SnapshotStatus, string> = {
  pending: 'default',
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  superseded: 'warning',
};

const KNOWN_FORMATS: SnapshotFormat[] = ['parquet', 'flatgeobuf'];
const FORMAT_EXT: Record<string, string> = { parquet: 'parquet', flatgeobuf: 'fgb' };

const producedFormats = (snap: { formats?: SnapshotFormatResult[] }): SnapshotFormatResult[] =>
  (snap.formats ?? []).filter((f) => f.status === 'produced');

/** produced = green, skipped = orange with the reason, requested = blue. */
function FormatBadges({ formats }: { formats?: SnapshotFormatResult[] }) {
  if (!formats || formats.length === 0) return null;
  return (
    <Space size={4} wrap>
      {formats.map((f) => (
        <Tooltip key={f.format} title={f.status === 'skipped' ? f.reason : f.media_type}>
          <Tag
            style={{ margin: 0 }}
            color={f.status === 'produced' ? 'green' : f.status === 'skipped' ? 'orange' : 'blue'}
          >
            {f.format}
          </Tag>
        </Tooltip>
      ))}
    </Space>
  );
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function apiErrorCode(e: unknown): string | null {
  return isCentiaApiError(e) ? ((e as { errorCode?: string }).errorCode ?? null) : null;
}

/** Save a fetched snapshot file to disk via a blob URL (Authorization cannot ride on <a href>). */
async function saveResponse(res: Response, filename: string) {
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DuckDbPopover({ dataUrl }: { dataUrl: string }) {
  const { t } = useTranslation();
  const token = getStatus().getTokens().accessToken;
  const snippet = [
    `CREATE SECRET gc2 (TYPE http, BEARER_TOKEN '${token}');`,
    `SELECT * FROM read_parquet('${dataUrl}');`,
  ].join('\n');
  return (
    <Popover
      trigger="click"
      title={t('snapshots.useInDuckDb')}
      content={
        <Space direction="vertical" style={{ maxWidth: 560 }}>
          <Paragraph style={{ marginBottom: 0 }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>{snippet}</pre>
          </Paragraph>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('snapshots.tokenWarning')}
          </Text>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={async () => {
              await navigator.clipboard.writeText(snippet);
              message.success(t('snapshots.snippetCopied'));
            }}
          >
            {t('snapshots.copySnippet')}
          </Button>
        </Space>
      }
    >
      <Button size="small">
        {/* i18n-ignore */}DuckDB
      </Button>
    </Popover>
  );
}

export default function SnapshotsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperUser = user?.superUser === true;

  const [schema, setSchema] = useState<string | null>(null);
  const [relation, setRelation] = useState<string>('');
  const [srs, setSrs] = useState<number | null>(null);
  const [wantedFormats, setWantedFormats] = useState<string[]>(['parquet']);
  const [creating, setCreating] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);

  const schemas = useSchemaNames().data?.map((s) => s.name) ?? [];
  const relationNames = useTableSummary(schema).data?.map((t) => t.name) ?? [];

  const relationValid = RELATION_NAME.test(relation);
  const relationChosen = !!schema && relationValid;

  // ──── Job list (super-user) ────

  const jobsQuery = useQuery({
    queryKey: ['snapshot-jobs', schema, relationChosen ? relation : null],
    queryFn: async () =>
      await snapshotsClient().getSnapshots({
        schema: schema ?? undefined,
        relation: relationChosen ? relation : undefined,
      }),
    enabled: isSuperUser,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((j: SnapshotJob) => j.status === 'pending' || j.status === 'running') ? 3000 : false,
  });
  const jobs = jobsQuery.data ?? [];

  // When the last active job finishes, the published list may have grown —
  // refresh it (and once on the pending→terminal transition of a fresh queue).
  const hasActive = jobs.some((j) => j.status === 'pending' || j.status === 'running');
  const hadActive = useRef(false);
  useEffect(() => {
    if (hadActive.current && !hasActive) {
      queryClient.invalidateQueries({ queryKey: ['relation-snapshots'] });
    }
    hadActive.current = hasActive;
  }, [hasActive]);

  // ──── Published snapshots for the chosen relation ────

  const snapsQuery = useQuery({
    queryKey: ['relation-snapshots', schema, relation],
    queryFn: async () => {
      try {
        return await snapshotsClient().getRelationSnapshots(schema!, relation);
      } catch (e) {
        if (apiErrorCode(e) === 'NO_SNAPSHOT_ERROR') return [];
        throw e;
      }
    },
    enabled: relationChosen,
    staleTime: 15_000,
  });
  const snaps = snapsQuery.data ?? [];

  const handleCreate = async () => {
    if (!relationChosen) return;
    setCreating(true);
    try {
      await snapshotsClient().postSnapshot({
        schema: schema!,
        relation,
        srs: srs ?? undefined,
        formats: wantedFormats.length ? wantedFormats : undefined,
      });
      message.success(t('snapshots.snapshotQueued'));
      queryClient.invalidateQueries({ queryKey: ['snapshot-jobs'] });
    } catch (e) {
      const code = apiErrorCode(e);
      if (code === 'SNAPSHOT_IN_PROGRESS') {
        message.warning(t('snapshots.alreadyInProgress'));
      } else if (code === 'SNAPSHOT_NOT_CONFIGURED') {
        setNotConfigured(true);
      } else {
        message.error(getErrorMessage(e));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadFormat = async (snap: RelationSnapshot, format: SnapshotFormat) => {
    try {
      const res = await snapshotsClient().getRelationSnapshotDataFormat(schema!, relation, snap.snapshot_date, format);
      const ext = FORMAT_EXT[format] ?? format;
      await saveResponse(res, `${schema}.${relation}-${snap.snapshot_date}.${ext}`);
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  const handleDownloadFile = async (snap: RelationSnapshot, name: string) => {
    try {
      const res = await snapshotsClient().getRelationSnapshotFile(schema!, relation, snap.snapshot_date, name);
      await saveResponse(res, name);
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  // Formats of the newest published snapshot — the ones the stable /latest URL can serve.
  const latestFormats = useMemo<SnapshotFormat[]>(() => {
    if (snaps.length === 0) return [];
    const produced = producedFormats(snaps[0]);
    return produced.length ? produced.map((f) => f.format) : ['parquet'];
  }, [snaps]);

  /** "schema changed" when the fingerprint differs from the next-older snapshot. */
  const schemaChanged = useMemo(() => {
    const changed = new Set<string>();
    for (let i = 0; i < snaps.length - 1; i++) {
      if (snaps[i].schema_version !== snaps[i + 1].schema_version) changed.add(snaps[i].snapshot_date);
    }
    return changed;
  }, [snaps]);

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        {/* i18n-ignore */}
        <h2>Snapshots</h2>
      </Space>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message={t('snapshots.intro')}
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder={t('snapshots.selectSchema')}
          style={{ width: 240 }}
          showSearch
          value={schema}
          onChange={(v) => {
            setSchema(v);
            setRelation('');
          }}
          options={schemas.map((name) => ({ label: name, value: name }))}
        />
        <AutoComplete
          placeholder={t('snapshots.relationPlaceholder')}
          style={{ width: 280 }}
          value={relation}
          onChange={setRelation}
          disabled={!schema}
          options={relationNames
            .filter((n) => RELATION_NAME.test(n))
            .map((n) => ({ value: n }))}
          filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
        />
        {relation && !relationValid && (
          <Text type="danger">{t('snapshots.invalidRelation')}</Text>
        )}
      </Space>

      {isSuperUser && (
        <Card
          title={t('snapshots.createSnapshot')}
          size="small"
          style={{ marginBottom: 16 }}
          extra={<Text type="secondary">{t('snapshots.superUserOnly')}</Text>}
        >
          {notConfigured ? (
            <Alert
              type="warning"
              showIcon
              message={t('snapshots.notConfigured')}
            />
          ) : (
            <Space wrap>
              <Checkbox.Group
                options={KNOWN_FORMATS.map((f) => ({ label: f, value: f }))}
                value={wantedFormats}
                onChange={(v) => setWantedFormats(v as string[])}
              />
              <InputNumber
                placeholder={t('snapshots.targetSrs')}
                style={{ width: 220 }}
                min={1}
                value={srs}
                onChange={(v) => setSrs(v)}
              />
              <Button
                type="primary"
                icon={<CameraOutlined />}
                disabled={!relationChosen}
                loading={creating}
                onClick={handleCreate}
              >
                {t('snapshots.createSnapshot')}
              </Button>
              <Text type="secondary">{t('snapshots.leaveSrsEmpty')}</Text>
            </Space>
          )}
        </Card>
      )}

      {isSuperUser && (
        <Card
          title={t('snapshots.jobs')}
          size="small"
          style={{ marginBottom: 16 }}
          extra={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => jobsQuery.refetch()}>
              {t('common.refresh')}
            </Button>
          }
        >
          <Table
            dataSource={jobs}
            rowKey="id"
            size="small"
            pagination={false}
            loading={jobsQuery.isLoading}
            columns={[
              { title: t('snapshots.colRelation'), key: 'relation',
                render: (_: unknown, j: SnapshotJob) => (
                  <Text code>
                    {/* i18n-ignore */}
                    {`${j.schema}.${j.relation}`}
                  </Text>
                ),
              },
              { title: t('common.status'), dataIndex: 'status', key: 'status',
                render: (s: SnapshotStatus, j: SnapshotJob) =>
                  j.error ? (
                    <Tooltip title={j.error}>
                      <Tag color={STATUS_COLOR[s]}>{s}</Tag>
                    </Tooltip>
                  ) : (
                    <Tag color={STATUS_COLOR[s]}>{s}</Tag>
                  ),
              },
              { title: t('snapshots.colRows'), dataIndex: 'row_count', key: 'rows',
                render: (v: number | null) => (v === null || v === undefined ? '—' : formatNumber(v)),
              },
              {
                // i18n-ignore
                title: 'SRS',
                dataIndex: 'srs',
                key: 'srs',
                render: (v: number | null) => v ?? t('snapshots.native'),
              },
              { title: t('snapshots.colFormats'), key: 'formats',
                render: (_: unknown, j: SnapshotJob) => <FormatBadges formats={j.formats} />,
              },
              { title: t('snapshots.colCreated'), dataIndex: 'created', key: 'created' },
              { title: t('snapshots.colFinished'), dataIndex: 'finished', key: 'finished', render: (v: string | null) => v ?? '—' },
              { title: t('snapshots.colBy'), dataIndex: 'username', key: 'username' },
            ]}
          />
        </Card>
      )}

      <Card
        title={t('snapshots.published')}
        size="small"
        extra={
          relationChosen && latestFormats.length > 0 ? (
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('snapshots.latestUrl')}
              </Text>
              {latestFormats.map((f) => (
                <Tooltip
                  key={f}
                  title={t('snapshots.latestUrlTip', { format: f })}
                >
                  <Button
                    size="small"
                    icon={<LinkOutlined />}
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        snapshotsClient().getRelationSnapshotDataFormatUrl(schema!, relation, 'latest', f),
                      );
                      message.success(t('snapshots.latestUrlCopied'));
                    }}
                  >
                    {f}
                  </Button>
                </Tooltip>
              ))}
            </Space>
          ) : undefined
        }
      >
        {!relationChosen ? (
          <Text type="secondary">{t('snapshots.selectRelation')}</Text>
        ) : snapsQuery.isLoading ? (
          <Spin />
        ) : snapsQuery.error ? (
          <Alert type="error" showIcon message={getErrorMessage(snapsQuery.error)} />
        ) : (
          <Table
            dataSource={snaps}
            rowKey="snapshot_date"
            size="small"
            pagination={false}
            locale={{ emptyText: t('snapshots.noSnapshots') }}
            expandable={{
              expandedRowRender: (snap: RelationSnapshot) => (
                <SnapshotDetails
                  schema={schema!}
                  relation={relation}
                  snap={snap}
                  onDownloadFile={(name) => handleDownloadFile(snap, name)}
                />
              ),
            }}
            columns={[
              { title: t('snapshots.colDate'), dataIndex: 'snapshot_date', key: 'date' },
              { title: t('snapshots.colRows'), dataIndex: 'row_count', key: 'rows', render: (v: number) => formatNumber(v) },
              { title: t('snapshots.colSize'), dataIndex: 'size_bytes', key: 'size', render: (v: number) => humanBytes(v) },
              { title: t('snapshots.colSchema'), dataIndex: 'schema_version', key: 'sv',
                render: (v: string, snap: RelationSnapshot) => (
                  <Space size={6}>
                    <Text code style={{ fontSize: 12 }}>{v.slice(0, 8)}</Text>
                    {schemaChanged.has(snap.snapshot_date) && (
                      <Tooltip title={t('snapshots.schemaChangedTip')}>
                        <Tag color="orange" style={{ margin: 0 }}>{t('snapshots.schemaChanged')}</Tag>
                      </Tooltip>
                    )}
                  </Space>
                ),
              },
              { title: t('snapshots.colFormats'), key: 'formats',
                render: (_: unknown, snap: RelationSnapshot) => <FormatBadges formats={snap.formats} />,
              },
              { title: t('snapshots.colPublished'), dataIndex: 'published', key: 'published' },
              { title: t('common.actions'), key: 'actions', width: 280,
                render: (_: unknown, snap: RelationSnapshot) => {
                  // Older snapshots carry no formats array — treat them as Parquet-only.
                  const produced = producedFormats(snap);
                  const effective = produced.length
                    ? produced
                    : [{ format: 'parquet', status: 'produced' } as SnapshotFormatResult];
                  const urlOf = (f: SnapshotFormat) =>
                    snapshotsClient().getRelationSnapshotDataFormatUrl(schema!, relation, snap.snapshot_date, f);
                  const parquet = effective.find((f) => f.format === 'parquet');
                  const linkFormat = (parquet ?? effective[0]).format;
                  return (
                    <Space>
                      {effective.map((f) => (
                        <Tooltip key={f.format} title={t('snapshots.downloadFormat', { format: f.format })}>
                          <Button
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => handleDownloadFormat(snap, f.format)}
                          >
                            {FORMAT_EXT[f.format] ?? f.format}
                          </Button>
                        </Tooltip>
                      ))}
                      <Tooltip title={t('snapshots.copyFormatUrl', { format: linkFormat })}>
                        <Button
                          size="small"
                          icon={<LinkOutlined />}
                          onClick={async () => {
                            await navigator.clipboard.writeText(urlOf(linkFormat));
                            message.success(t('snapshots.urlCopied'));
                          }}
                        />
                      </Tooltip>
                      {parquet && <DuckDbPopover dataUrl={urlOf('parquet')} />}
                    </Space>
                  );
                },
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

/** Expanded row: full metadata for one snapshot date. */
function SnapshotDetails({
  schema,
  relation,
  snap,
  onDownloadFile,
}: {
  schema: string;
  relation: string;
  snap: RelationSnapshot;
  onDownloadFile: (name: string) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ['relation-snapshot', schema, relation, snap.snapshot_date],
    queryFn: async () => await snapshotsClient().getRelationSnapshot(schema, relation, snap.snapshot_date),
    staleTime: 60_000,
  });

  if (isLoading) return <Spin size="small" />;
  if (error) return <Alert type="error" showIcon message={getErrorMessage(error)} />;
  if (!data) return null;

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Descriptions size="small" column={3}>
        <Descriptions.Item
          // i18n-ignore
          label="SRS"
        >{data.srs ?? t('snapshots.native')}</Descriptions.Item>
        <Descriptions.Item
          // i18n-ignore
          label="CRS"
        >{data.crs ?? '—'}</Descriptions.Item>
        <Descriptions.Item label={t('snapshots.snapshotId')}>
          <Text code style={{ fontSize: 12 }}>{data.snapshot_id}</Text>
        </Descriptions.Item>
      </Descriptions>
      {data.relation_schema && (
        <Table
          dataSource={data.relation_schema}
          rowKey="column_name"
          size="small"
          pagination={false}
          columns={[
            { title: t('snapshots.colColumn'), dataIndex: 'column_name', key: 'c' },
            { title: t('common.type'), dataIndex: 'data_type', key: 't' },
          ]}
        />
      )}
      <Space wrap>
        {data.files.map((f) => (
          <Button key={f.name} size="small" icon={<DownloadOutlined />} onClick={() => onDownloadFile(f.name)}>
            {f.name} ({humanBytes(f.size_bytes)})
          </Button>
        ))}
      </Space>
    </Space>
  );
}
