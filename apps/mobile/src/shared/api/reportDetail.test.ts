import { categoryChangeQueryKeys } from './reportDetail'

jest.mock('@/shared/api/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn(), storage: { from: jest.fn() } },
}))

describe('categoryChangeQueryKeys', () => {
  it('covers the detail, History, the feed and the public detail and thumbnail', () => {
    const keys = categoryChangeQueryKeys('r1')

    expect(keys).toEqual(
      expect.arrayContaining([
        ['report-detail', 'r1'],
        ['history'],
        ['alerts'],
        ['alert-detail', 'r1'],
        ['alert-thumbnail', 'r1'],
      ]),
    )
  })
})
