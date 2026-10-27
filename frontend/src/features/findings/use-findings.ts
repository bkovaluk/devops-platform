import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { FindingList } from '@/types/api'
import { fetchFinding, fetchFindings, findingKeys } from './findings-api'
import type { FindingsParams } from './findings-search'

/** One status's findings in one env, or every env the caller may read (`all`),
 *  a page at a time. The facets and the total come with the first page. */
export function useFindings(env: string, params: FindingsParams) {
  return useInfiniteQuery({
    queryKey: findingKeys.list(env, params),
    queryFn: ({ pageParam }) => fetchFindings(env, params, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: FindingList, pages: FindingList[]) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0)
      return loaded < last.total && last.items.length > 0 ? loaded : undefined
    },
    placeholderData: keepPreviousData,
  })
}

export function useFinding(env: string, id: string) {
  return useQuery({
    queryKey: findingKeys.detail(env, id),
    queryFn: () => fetchFinding(env, id),
  })
}
