import { ApolloClient, ApolloLink, InMemoryCache, Observable, gql } from '@apollo/client/core'
import { seedGraph } from './graphqlData'

export const SCHEME_QUERY = gql`
  query SchemeOverview {
    scheme { id project area version }
    reviewStats { pending accepted returned }
    agencies { id name role }
  }
`

export const COMMENTS_MUTATION = gql`
  mutation ResolveComment($id: ID!, $status: String!) {
    resolveComment(id: $id, status: $status) { id status }
  }
`

export const PUSH_EXTERNAL_MUTATION = gql`
  mutation PushExternal($records: [ExternalRecordInput!]!) {
    pushExternal(records: $records) { id status cursor }
  }
`

export const RUN_BATCH_MUTATION = gql`
  mutation RunBatch($id: ID!) {
    runBatch(id: $id) { id status cursor error }
  }
`

const mockLink = new ApolloLink((operation) => new Observable((observer) => {
  setTimeout(() => {
    if (operation.operationName === 'SchemeOverview') observer.next({ data: seedGraph })
    else if (operation.operationName === 'ResolveComment') observer.next({ data: { resolveComment: { id: operation.variables['id'], status: operation.variables['status'], __typename: 'Comment' } } })
    else if (operation.operationName === 'PushExternal') observer.next({ data: { pushExternal: { id: 'BATCH-NEW', status: 'pending', cursor: 0, __typename: 'Batch' } } })
    else if (operation.operationName === 'RunBatch') observer.next({ data: { runBatch: { id: operation.variables['id'], status: 'done', cursor: 4, error: null, __typename: 'Batch' } } })
    else observer.next({ data: {} })
    observer.complete()
  }, 180)
}))

export const apolloClient = new ApolloClient({ cache: new InMemoryCache(), link: mockLink })
