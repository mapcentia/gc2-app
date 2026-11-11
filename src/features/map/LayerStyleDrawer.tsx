import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Collapse, Drawer, Space, Spin } from 'antd';
import type { Layer } from '@mapcentia/gc2-sdk';
import { message } from '../../utils/message';
import { modal } from '../../utils/modal';
import { getErrorMessage } from '../../baas/adminClient';
import { bumpWmsRefresh, closeStyleEditor, useMapStore } from './mapStore';
import { layerKeyOf, useLayer, useSaveLayer } from './layerQueries';
import { FieldGrid, LAYER_PROP_GROUPS } from './fieldDefs';
import ClassesEditor from './ClassesEditor';

export default function LayerStyleDrawer() {
  const { t } = useTranslation();
  const { styleEditorLayer } = useMapStore();
  const key = styleEditorLayer ? layerKeyOf(styleEditorLayer) : null;
  const { data, isLoading, error } = useLayer(key);
  const saveLayer = useSaveLayer();
  const [draft, setDraft] = useState<Layer | null>(null);
  const [dirty, setDirty] = useState(false);
  // Mirrors `dirty` synchronously so the resync effect below never clobbers edits.
  const dirtyRef = useRef(false);
  const markDirty = (v: boolean) => {
    dirtyRef.current = v;
    setDirty(v);
  };

  // Reset when the drawer targets a different layer (or closes).
  useEffect(() => {
    setDraft(null);
    markDirty(false);
  }, [key]);

  // Sync the draft from (re)fetched data whenever there are no unsaved edits, so
  // server-assigned ids reach the draft after the post-save refetch.
  useEffect(() => {
    if (data && !dirtyRef.current) setDraft(structuredClone(data));
  }, [data]);

  const update = (patch: Partial<Layer>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    markDirty(true);
  };

  const close = () => {
    if (dirty) {
      modal.confirm({
        title: t('map.discardTitle'),
        content: t('map.discardContent'),
        okText: t('map.discard'),
        onOk: closeStyleEditor,
      });
    } else {
      closeStyleEditor();
    }
  };

  const save = async () => {
    if (!draft) return;
    try {
      await saveLayer.mutateAsync(draft);
      markDirty(false);
      message.success(t('map.stylingSaved'));
      bumpWmsRefresh();
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  return (
    <Drawer
      title={
        styleEditorLayer
          ? t('map.styleTitle', { layer: `${styleEditorLayer.schema}.${styleEditorLayer.table}` })
          : t('map.style')
      }
      open={!!styleEditorLayer}
      onClose={close}
      mask={false}
      width={440}
      extra={
        <Space>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button type="primary" loading={saveLayer.isPending} disabled={!dirty} onClick={save}>
            {t('common.save')}
          </Button>
        </Space>
      }
    >
      {isLoading && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      )}
      {error != null && <Alert type="error" message={getErrorMessage(error)} />}
      {draft && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Collapse
            size="small"
            items={LAYER_PROP_GROUPS.map((g) => ({
              key: g.title,
              label: g.title,
              children: (
                <FieldGrid
                  fields={g.fields}
                  entity={(draft.properties ?? {}) as Record<string, unknown>}
                  onChange={(p) => update({ properties: { ...draft.properties, ...p } })}
                />
              ),
            }))}
          />
          <ClassesEditor classes={draft.classes ?? []} onChange={(classes) => update({ classes })} />
        </Space>
      )}
    </Drawer>
  );
}
