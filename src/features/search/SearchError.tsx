import { useTranslation } from 'react-i18next';
import { Alert, Button } from 'antd';
import { BuildOutlined } from '@ant-design/icons';
import { getApiErrorCode, getErrorMessage } from '../../baas/adminClient';

/** A failed search: the API's machine-readable code, when it sent one, and its message. */
export interface SearchFailure {
  code: string | null;
  message: string;
}

export function toSearchFailure(e: unknown): SearchFailure {
  return { code: getApiErrorCode(e), message: getErrorMessage(e) };
}

/** An access rule decides this one; asking again gives the same answer, so no retry is offered. */
export const isFinalFailure = (failure: SearchFailure | null) => failure?.code === 'GEOFENCE_RULES_APPLY';

interface Props {
  failure: SearchFailure;
  isOwner: boolean;
  /** Builds the index; only offered to the owner when there is none. */
  onBuild?: () => void;
  building?: boolean;
}

/** Explains a failed search in the user's terms; anything unrecognised shows the API's own message. */
export default function SearchError({ failure, isOwner, onBuild, building }: Props) {
  const { t } = useTranslation();
  switch (failure.code) {
    case 'INSUFFICIENT_PRIVILEGES':
      return <Alert type="warning" showIcon message={t('search.noAccess')} />;
    case 'GEOFENCE_RULES_APPLY':
      return <Alert type="warning" showIcon message={t('search.accessRules')} />;
    case 'INDEX_NOT_FOUND':
      if (!isOwner) return <Alert type="info" showIcon message={t('search.notAvailable')} />;
      return (
        <Alert
          type="info"
          showIcon
          message={t('search.noIndex')}
          action={onBuild && (
            <Button size="small" type="primary" icon={<BuildOutlined />} loading={building} onClick={onBuild}>
              {t('search.buildIndex')}
            </Button>
          )}
        />
      );
    default:
      return <Alert type="error" showIcon message={failure.message} />;
  }
}
