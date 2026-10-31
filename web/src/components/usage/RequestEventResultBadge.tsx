import { useTranslation } from 'react-i18next'
import { IconScrollText } from '@/components/ui/icons'
import styles from './RequestEventResultBadge.module.scss'

type DataAttributes = { [key: `data-${string}`]: string }

interface RequestEventResultBadgeProps {
  failed: boolean
  /**
   * CPA 上报的 HTTP 状态码。缺失、非整数或超出 100–599 时只展示结果词，与后端
   * `status_code`（omitempty，历史数据为 NULL）的降级表现一致。
   * failed 与 status_code 在 CPA payload 中是两个独立字段，此处不做一致性纠正，
   * 如实呈现上游事实（例如"成功 500"确实可能来自上游）。
   */
  statusCode?: number | null
  loading?: boolean
  onOpen?: () => void
  dataAttributes?: DataAttributes
  size?: 'default' | 'compact'
}

// 只接受语义上合法的 HTTP 状态码；0、负数、null 都是"上游没有提供"的等价表达。
function formatStatusCodeLabel(statusCode: number | null | undefined): string | null {
  if (typeof statusCode !== 'number' || !Number.isInteger(statusCode)) {
    return null
  }
  return statusCode >= 100 && statusCode <= 599 ? String(statusCode) : null
}

export function RequestEventResultBadge({
  failed,
  statusCode,
  loading = false,
  onOpen,
  dataAttributes,
  size = 'default',
}: RequestEventResultBadgeProps) {
  const { t } = useTranslation()
  const resultLabel = failed ? t('usage_stats.failure') : t('usage_stats.success')
  const resultLocale = t('usage_stats.success') === 'Success' ? 'en' : 'zh'
  const resultClassName = failed ? styles.requestEventsResultFailed : styles.requestEventsResultSuccess
  const badgeClassName = `${resultClassName} ${size === 'compact' ? styles.requestEventsResultCompact : ''}`.trim()
  const statusCodeLabel = formatStatusCodeLabel(statusCode)
  // 状态码是公共信息（HTTP 语义），不新增 i18n 键，直接与结果词并排展示。
  const accessibleResult = statusCodeLabel ? `${resultLabel} ${statusCodeLabel}` : resultLabel

  const content = (
    <>
      <span>{resultLabel}</span>
      {/* 纯空白文本节点不生成 flex item，视觉间距由 gap 控制；它只保证 span 分支的
          textContent 是 "Success 200" 而不是 "Success200"（button 分支由 aria-label 覆盖）。 */}
      {statusCodeLabel ? (
        <>
          {' '}
          <span className={styles.requestEventsResultCode} data-request-result-status-code={statusCodeLabel}>
            {statusCodeLabel}
          </span>
        </>
      ) : null}
    </>
  )

  if (!onOpen) {
    return (
      <span className={badgeClassName} data-result-locale={resultLocale} {...dataAttributes}>
        {content}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={`${badgeClassName} ${styles.requestEventsResultLogButton}`.trim()}
      data-result-locale={resultLocale}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      title={t('usage_stats.request_events_log_hint')}
      aria-label={loading
        ? t('usage_stats.request_events_log_loading_aria', { result: accessibleResult })
        : t('usage_stats.request_events_log_open_aria', { result: accessibleResult })}
      aria-busy={loading}
      disabled={loading}
      {...dataAttributes}
    >
      {content}
      <span className={styles.requestEventsResultLogIcon} aria-hidden="true">
        <IconScrollText size={9} />
      </span>
    </button>
  )
}
