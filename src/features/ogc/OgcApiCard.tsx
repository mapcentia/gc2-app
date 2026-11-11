import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Alert, Card, Select, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Ogc } from '@mapcentia/gc2-sdk';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import UrlField from './UrlField';

const { Text } = Typography;

const CRS84 = 'http://www.opengis.net/def/crs/OGC/1.3/CRS84';
const EPSG_4326 = 'http://www.opengis.net/def/crs/EPSG/0/4326';

/** OGC API Features (Part 1 + 2) and Maps (Part 1) under /api/v4/ogc. */
export default function OgcApiCard({
  host,
  database,
  schema,
}: {
  host: string;
  database: string;
  schema: string | null;
}) {
  const { t } = useTranslation();
  const [collectionId, setCollectionId] = useState<string | null>(null);

  const db = database ? encodeURIComponent(database) : '{database}';
  const base = `${host}/api/v4/ogc/database/${db}`;

  const { data, error } = useQuery({
    queryKey: ['ogc-collections', database],
    queryFn: async () =>
      await new Ogc(getAdminClient().http).getCollections(database, { limit: 1000 }),
    enabled: !!database,
    staleTime: 30_000,
  });

  const collections = data?.collections ?? [];
  const visible = schema
    ? collections.filter((c) => c.id.startsWith(`${schema}.`))
    : collections;
  const selected = collections.find((c) => c.id === collectionId) ?? null;
  const isVector = selected?.itemType === 'feature';

  return (
    <Card title={t('ogc.apiCardTitle')} extra={<Text type="secondary">{t('ogc.readOnly')}</Text>} size="small">
      <Space direction="vertical" style={{ width: '100%' }}>
        <UrlField label={t('ogc.landingPage')} url={base} openUrl={base} />
        <UrlField label={t('ogc.conformance')} url={`${base}/conformance`} openUrl={`${base}/conformance`} />
        <UrlField label={t('ogc.collections')} url={`${base}/collections`} openUrl={`${base}/collections`} />

        {error ? (
          <Alert
            type="warning"
            showIcon
            message={t('ogc.listCollectionsFailed', { message: getErrorMessage(error) })}
          />
        ) : (
          <Select
            placeholder={t('ogc.selectCollection')}
            style={{ width: 360 }}
            allowClear
            showSearch
            value={collectionId}
            onChange={(v) => setCollectionId(v ?? null)}
            options={visible.map((c) => ({
              // i18n-ignore
              label: c.title && c.title !== c.id ? `${c.id} — ${c.title}` : c.id,
              value: c.id,
            }))}
          />
        )}

        {selected && (
          <>
            <UrlField
              label={t('ogc.collection')}
              url={`${base}/collections/${encodeURIComponent(selected.id)}`}
              openUrl={`${base}/collections/${encodeURIComponent(selected.id)}`}
            />
            {isVector ? (
              <UrlField
                label={t('ogc.itemsLabel')}
                url={`${base}/collections/${encodeURIComponent(selected.id)}/items`}
                openUrl={`${base}/collections/${encodeURIComponent(selected.id)}/items`}
              />
            ) : (
              <Text type="secondary">{t('ogc.rasterNoItems')}</Text>
            )}
            <UrlField
              label={t('ogc.mapLabel')}
              url={`${base}/collections/${encodeURIComponent(selected.id)}/map`}
              openUrl={`${base}/collections/${encodeURIComponent(selected.id)}/map`}
            />
            {selected.crs && selected.crs.length > 0 && (
              <div>
                <Text type="secondary">{t('ogc.crsPrefix')}</Text>
                <Space size={4} wrap>
                  {selected.crs.map((uri) => (
                    <Tag key={uri}>
                      {uri === CRS84
                        ? t('ogc.crs84')
                        : uri === EPSG_4326
                          ? t('ogc.epsg4326')
                          : uri.replace('http://www.opengis.net/def/crs/EPSG/0/', 'EPSG:')}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}
          </>
        )}

        <Alert
          type="info"
          showIcon
          message={
            <Trans
              i18nKey="ogc.apiHelp"
              values={{ isoInstant: t('ogc.isoInstant') }}
              components={{
                code: <Text code />,
                a: <a href={`${host}/swagger/api.php?v=4`} target="_blank" rel="noreferrer" />,
              }}
            />
          }
        />
      </Space>
    </Card>
  );
}
