// @vitest-environment happy-dom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import type { UsageEvent } from '@/lib/types';
import { RequestEventResultBadge } from '../RequestEventResultBadge';
import { RequestEventsTestCard } from './requestEventsFixtures';

const render = (props: React.ComponentProps<typeof RequestEventResultBadge>): string => (
  renderToStaticMarkup(<RequestEventResultBadge {...props} />)
);

const buildEvent = (overrides: Partial<UsageEvent>): UsageEvent => ({
  id: '101',
  timestamp: '2026-04-23T02:00:00.000Z',
  api_key: 'Production Key',
  model: 'claude-sonnet',
  endpoint: 'POST /v1/messages',
  source: 'Provider A',
  auth_index: '1',
  request_id: 'req-log-101',
  failed: false,
  tokens: {
    input_tokens: 100,
    output_tokens: 60,
    reasoning_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    total_tokens: 160,
  },
  latency_ms: 900,
  cost_usd: 0.12,
  cost_available: true,
  ...overrides,
});

beforeEach(async () => {
  // 断言基于英文文案，显式固定语言，避免受 localStorage 或默认语言变更影响。
  await i18n.changeLanguage('en');
});

describe('RequestEventResultBadge status code', () => {
  it('renders the CPA status code right after the success label', () => {
    const html = render({ failed: false, statusCode: 200 });
    expect(html).toContain('Success');
    expect(html).toMatch(/data-request-result-status-code="200">200<\/span>/);
    expect(html.indexOf('Success')).toBeLessThan(html.indexOf('data-request-result-status-code'));
  });

  it('renders the CPA status code right after the failure label', () => {
    const html = render({ failed: true, statusCode: 429 });
    expect(html).toContain('Failure');
    expect(html).toMatch(/data-request-result-status-code="429">429<\/span>/);
    expect(html.indexOf('Failure')).toBeLessThan(html.indexOf('data-request-result-status-code'));
  });

  it.each<[string, number | null | undefined]>([
    ['undefined', undefined],
    ['null', null],
    ['zero', 0],
    ['below http range', 99],
    ['above http range', 600],
    ['fractional', 200.5],
    ['NaN', Number.NaN],
  ])('falls back to the label alone when status code is %s', (_case, statusCode) => {
    const html = render({ failed: false, statusCode });
    expect(html).toContain('Success');
    expect(html).not.toContain('data-request-result-status-code');
  });

  it.each([100, 599])('accepts the boundary status code %s', (statusCode) => {
    const html = render({ failed: false, statusCode });
    expect(html).toContain(`data-request-result-status-code="${statusCode}"`);
  });

  it('keeps the status code visible when the badge is not clickable', () => {
    const html = render({ failed: true, statusCode: 500 });
    expect(html).not.toContain('<button');
    expect(html).toContain('data-request-result-status-code="500"');
    // span 分支没有 aria-label，textContent 必须带分隔空格，否则读作 "Failure500"。
    expect(html.replace(/<[^>]+>/g, '')).toContain('Failure 500');
  });

  it('announces the status code in the request log button accessible name', () => {
    const html = render({ failed: false, statusCode: 200, onOpen: () => undefined });
    expect(html).toContain('aria-label="Success 200. View request log"');
    expect(html).toContain('title="Click to view request log"');
  });

  it('omits the status code from the accessible name when it is missing', () => {
    const html = render({ failed: false, onOpen: () => undefined });
    expect(html).toContain('aria-label="Success. View request log"');
  });

  it('renders the status code in the compact variant used by the credential drawer', () => {
    const html = render({ failed: true, statusCode: 502, size: 'compact' });
    expect(html).toContain('data-request-result-status-code="502"');
  });

  it('uses the CJK sentence separator in the Chinese accessible name', async () => {
    await i18n.changeLanguage('zh');
    const html = render({ failed: true, statusCode: 429, onOpen: () => undefined });
    expect(html).toContain('aria-label="失败 429。查看请求日志"');
  });
});

describe('request events table status code', () => {
  it('passes the event status code through to the result badge', () => {
    const html = renderToStaticMarkup(
      <RequestEventsTestCard
        events={[buildEvent({ failed: true, status_code: 429 })]}
        requestLogAccessEnabled
        onRequestLogOpen={() => undefined}
      />,
    );
    expect(html).toContain('data-request-result-status-code="429"');
    expect(html).toContain('aria-label="Failure 429. View request log"');
  });

  it('renders a plain label for events whose status code is missing', () => {
    const html = renderToStaticMarkup(
      <RequestEventsTestCard events={[buildEvent({ failed: false })]} />,
    );
    expect(html).not.toContain('data-request-result-status-code');
    expect(html).toContain('Success');
  });
});
