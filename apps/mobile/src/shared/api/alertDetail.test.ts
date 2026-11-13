import {
  fetchPublicAlertDetail,
  signAlertMediaUrls,
} from '@/shared/api/alertDetail';

/**
 * The public alert detail.
 *
 * `006-alerts / 009-alert-detail-screen`.
 *
 * The rule this file protects: the public surface has **no author field at
 * all**. Not a nulled one, not a renamed one — the type does not carry it, so
 * there is nothing for a render to pick up. The projection omits `author_id`
 * entirely (FR-DATA-3 / FR-NG-5), and the client's type mirrors that.
 */

const mockRpc = jest.fn();
const mockSignMediaUrl = jest.fn();

jest.mock('@/shared/api/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

jest.mock('@/shared/api/reportDetail', () => ({
  signMediaUrl: (...args: unknown[]) => mockSignMediaUrl(...args),
}));

const REPORT_ID = '55555555-5555-5555-5555-5555555555a1';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    category: 'theft',
    description: 'a report',
    area_hierarchy: { division: 'Dhaka', city: 'Dhaka', thana: 'Dhanmondi' },
    captured_at: '2026-11-05T10:00:00.000Z',
    public_visibility: 'anonymous',
    author_display_name: null,
    lat: 23.8103,
    lng: 90.4125,
    media: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockRpc.mockReset();
  mockSignMediaUrl.mockReset();
});

describe('reading the public alert detail', () => {
  it('asks for the report by id', async () => {
    mockRpc.mockResolvedValue({ data: row(), error: null });

    await fetchPublicAlertDetail(REPORT_ID);

    expect(mockRpc).toHaveBeenCalledWith('alert_detail', { p_report_id: REPORT_ID });
  });

  it('resolves null when the report does not resolve', async () => {
    // A removed report, a deleted report, and a report that never existed are
    // all the same from outside — the client renders one "no longer
    // available" state for all three.
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(fetchPublicAlertDetail(REPORT_ID)).resolves.toBeNull();
  });

  it('carries no author id, under any name', async () => {
    mockRpc.mockResolvedValue({ data: row(), error: null });

    const detail = await fetchPublicAlertDetail(REPORT_ID);

    expect(detail).not.toBeNull();
    const keys = Object.keys(detail as unknown as Record<string, unknown>);

    expect(keys).not.toContain('authorId');
    expect(keys).not.toContain('author_id');
    expect(keys).not.toContain('author');
    expect(keys).not.toContain('reporter');
    expect(keys).not.toContain('reporterId');
  });

  it('carries no author uuid anywhere in the body', async () => {
    const authorId = '44444444-4444-4444-4444-4444444444a1';
    mockRpc.mockResolvedValue({
      data: row({ media: [{ id: 'm1', report_id: REPORT_ID, storage_path: 'reports/tok/req/photo.jpg' }] }),
      error: null,
    });

    const detail = await fetchPublicAlertDetail(REPORT_ID);

    expect(JSON.stringify(detail)).not.toContain(authorId);
  });

  it('carries the display alias only for an identified report', async () => {
    mockRpc.mockResolvedValue({
      data: row({ public_visibility: 'identified', author_display_name: 'Ay' }),
      error: null,
    });

    const detail = await fetchPublicAlertDetail(REPORT_ID);

    expect(detail?.authorDisplayName).toBe('Ay');
  });

  it('carries no display alias for an anonymous report', async () => {
    mockRpc.mockResolvedValue({ data: row({ author_display_name: null }), error: null });

    const detail = await fetchPublicAlertDetail(REPORT_ID);

    expect(detail?.authorDisplayName).toBeNull();
  });

  it('carries the coordinates, so the map needs no second query', async () => {
    mockRpc.mockResolvedValue({ data: row(), error: null });

    const detail = await fetchPublicAlertDetail(REPORT_ID);

    expect(detail?.lat).toBe(23.8103);
    expect(detail?.lng).toBe(90.4125);
  });

  it('keeps a null category null — the placeholder belongs to the client', async () => {
    mockRpc.mockResolvedValue({ data: row({ category: null }), error: null });

    const detail = await fetchPublicAlertDetail(REPORT_ID);

    expect(detail?.category).toBeNull();
  });

  it('returns an empty media list, never null', async () => {
    mockRpc.mockResolvedValue({ data: row({ media: [] }), error: null });

    const detail = await fetchPublicAlertDetail(REPORT_ID);

    expect(detail?.media).toEqual([]);
  });

  it('throws the mapped error when the read fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom', code: 'XX' } });

    await expect(fetchPublicAlertDetail(REPORT_ID)).rejects.toThrow();
  });
});

describe('signing the alert media', () => {
  function media(storagePath: string) {
    return {
      id: 'm1',
      reportId: REPORT_ID,
      storagePath,
      mediaType: 'photo' as const,
      byteSize: 1024,
      durationSeconds: null,
      width: 640,
      height: 480,
    };
  }

  it('signs each media path', async () => {
    mockSignMediaUrl.mockResolvedValue('https://example.test/signed');

    const urls = await signAlertMediaUrls([media('reports/a/b/photo.jpg')]);

    expect(mockSignMediaUrl).toHaveBeenCalledWith('reports/a/b/photo.jpg');
    expect(urls).toEqual({ 'reports/a/b/photo.jpg': 'https://example.test/signed' });
  });

  it('drops a media whose URL cannot be signed, so an expired URL degrades to a placeholder', async () => {
    mockSignMediaUrl
      .mockResolvedValueOnce('https://example.test/ok')
      .mockResolvedValueOnce(null);

    const urls = await signAlertMediaUrls([
      media('reports/a/b/one.jpg'),
      media('reports/a/b/two.jpg'),
    ]);

    expect(Object.keys(urls)).toEqual(['reports/a/b/one.jpg']);
  });

  it('returns nothing for no media', async () => {
    await expect(signAlertMediaUrls([])).resolves.toEqual({});
    expect(mockSignMediaUrl).not.toHaveBeenCalled();
  });
});
