export type ConnectorType = 'url' | 'sharepoint' | 'confluence';

export interface ConnectorSyncRequest {
  type: ConnectorType;
  department: string;
  owner?: string;
  sensitivityLabel?: string;
  version?: string;
  url?: string;
  siteUrl?: string;
  pageId?: string;
}

export interface ConnectorSyncResult {
  documentId: string;
  name: string;
  sourceSystem: string;
  chunkCount: number;
}

export { syncFromUrl } from './urlConnector';
export { syncFromSharePoint } from './sharepointConnector';
export { syncFromConfluence } from './confluenceConnector';
