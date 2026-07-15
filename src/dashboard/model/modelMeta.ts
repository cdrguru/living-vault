import type {
  AssetDependencyRow,
  AssetRow,
  AssetTagRow,
  BundleMembershipRow,
  BundleRow,
  OriginRow,
  OwnerRow,
  TagRow,
  UtilizationRow,
  VaultDataset,
} from '@/data/types';

export const TABLE_IDS = [
  'Asset',
  'Owner',
  'Origin',
  'Tag',
  'Bundle',
  'Utilization',
  'AssetTag',
  'BundleMembership',
  'AssetDependency',
] as const;

export type TableId = (typeof TABLE_IDS)[number];
export type TableRole = 'entity' | 'join' | 'fact';
export type GroupLabel = 'Keys' | 'Descriptors' | 'Governance' | 'Metrics';
export type LayoutMode = 'collapsed' | 'expanded';

export interface FieldGroup {
  label: GroupLabel;
  fields: string[];
}

export interface TableMeta {
  id: TableId;
  role: TableRole;
  partitioned: boolean;
  description: string;
  groups: FieldGroup[];
  count: (dataset: VaultDataset) => number;
}

/**
 * Field lists are typed against the row interfaces in src/data/types.ts, so a
 * rename there fails tsc here until the canvas metadata catches up.
 */
function defineTable<Row>(
  meta: Omit<TableMeta, 'groups'> & {
    groups: { label: GroupLabel; fields: (keyof Row & string)[] }[];
  }
): TableMeta {
  return meta;
}

export const TABLES: Record<TableId, TableMeta> = {
  Asset: defineTable<AssetRow>({
    id: 'Asset',
    role: 'entity',
    partitioned: true,
    description:
      'The catalog row for one agentic asset: a skill, subagent, prompt, mcp-server, hook, command, or workflow. The hub of the model.',
    groups: [
      { label: 'Keys', fields: ['id', 'tenantId', 'ownerId', 'originId'] },
      {
        label: 'Descriptors',
        fields: ['type', 'name', 'slug', 'description', 'system', 'body', 'version'],
      },
      {
        label: 'Governance',
        fields: [
          'status',
          'riskLevel',
          'maturity',
          'tier',
          'stockVersion',
          'contentHash',
          'createdAt',
          'updatedAt',
        ],
      },
    ],
    count: (dataset) => dataset.assets.length,
  }),
  Owner: defineTable<OwnerRow>({
    id: 'Owner',
    role: 'entity',
    partitioned: true,
    description: 'Who is accountable for an asset. Optional lookup from Asset.ownerId.',
    groups: [
      { label: 'Keys', fields: ['id', 'tenantId'] },
      { label: 'Descriptors', fields: ['name', 'email'] },
      { label: 'Governance', fields: ['role'] },
    ],
    count: (dataset) => dataset.owners.length,
  }),
  Origin: defineTable<OriginRow>({
    id: 'Origin',
    role: 'entity',
    partitioned: true,
    description: 'Where an asset came from: repo, url, local, plugin, or giac.',
    groups: [
      { label: 'Keys', fields: ['id', 'tenantId'] },
      { label: 'Descriptors', fields: ['name', 'kind', 'url'] },
    ],
    count: (dataset) => dataset.origins.length,
  }),
  Tag: defineTable<TagRow>({
    id: 'Tag',
    role: 'entity',
    partitioned: true,
    description: 'Classification labels along three axes: domain, capability, pillar.',
    groups: [
      { label: 'Keys', fields: ['id', 'tenantId'] },
      { label: 'Descriptors', fields: ['kind', 'name'] },
    ],
    count: (dataset) => dataset.tags.length,
  }),
  Bundle: defineTable<BundleRow>({
    id: 'Bundle',
    role: 'entity',
    partitioned: true,
    description: 'A named collection of assets that ship together.',
    groups: [
      { label: 'Keys', fields: ['id', 'tenantId'] },
      { label: 'Descriptors', fields: ['name', 'description'] },
    ],
    count: (dataset) => dataset.bundles.length,
  }),
  Utilization: defineTable<UtilizationRow>({
    id: 'Utilization',
    role: 'fact',
    partitioned: true,
    description:
      'Daily usage telemetry per asset, one row per asset per date. Every numeric measure lives here.',
    groups: [
      { label: 'Keys', fields: ['id', 'tenantId', 'assetId', 'date'] },
      {
        label: 'Metrics',
        fields: ['invocations', 'successes', 'errors', 'refusals', 'latencyMs', 'tokens', 'cost'],
      },
    ],
    count: (dataset) => dataset.utilization.length,
  }),
  AssetTag: defineTable<AssetTagRow>({
    id: 'AssetTag',
    role: 'join',
    partitioned: false,
    description: 'Join table for the Asset to Tag many to many relationship.',
    groups: [{ label: 'Keys', fields: ['assetId', 'tagId'] }],
    count: (dataset) => dataset.assetTags.length,
  }),
  BundleMembership: defineTable<BundleMembershipRow>({
    id: 'BundleMembership',
    role: 'join',
    partitioned: false,
    description: 'Join table for the Bundle to Asset many to many relationship.',
    groups: [{ label: 'Keys', fields: ['bundleId', 'assetId'] }],
    count: (dataset) => dataset.bundleMemberships.length,
  }),
  AssetDependency: defineTable<AssetDependencyRow>({
    id: 'AssetDependency',
    role: 'join',
    partitioned: false,
    description:
      'Self relationship join table: the asset at assetId depends on the asset at dependsOnAssetId.',
    groups: [{ label: 'Keys', fields: ['assetId', 'dependsOnAssetId'] }],
    count: (dataset) => dataset.dependencies.length,
  }),
};

export const TABLE_LIST: TableMeta[] = TABLE_IDS.map((id) => TABLES[id]);

export const RELATIONSHIP_IDS = [
  'asset-owner',
  'asset-origin',
  'asset-tag',
  'bundle-asset',
  'asset-dependency',
  'asset-utilization',
] as const;

export type RelationshipId = (typeof RELATIONSHIP_IDS)[number];

export interface RelationshipMeta {
  id: RelationshipId;
  title: string;
  endpoints: [TableId, TableId];
  via?: TableId;
  optional: boolean;
  explanation: string;
  count: (dataset: VaultDataset) => number;
}

export const RELATIONSHIPS: Record<RelationshipId, RelationshipMeta> = {
  'asset-owner': {
    id: 'asset-owner',
    title: 'Asset to Owner',
    endpoints: ['Asset', 'Owner'],
    optional: true,
    explanation:
      'Asset.ownerId points to Owner.id, optional 0..1. Unowned assets are valid and surface as a governance gap.',
    count: (dataset) => dataset.assets.filter((asset) => asset.ownerId).length,
  },
  'asset-origin': {
    id: 'asset-origin',
    title: 'Asset to Origin',
    endpoints: ['Asset', 'Origin'],
    optional: true,
    explanation:
      'Asset.originId points to Origin.id, optional 0..1. Origin records where the asset came from.',
    count: (dataset) => dataset.assets.filter((asset) => asset.originId).length,
  },
  'asset-tag': {
    id: 'asset-tag',
    title: 'Asset to Tag',
    endpoints: ['Asset', 'Tag'],
    via: 'AssetTag',
    optional: false,
    explanation:
      'Asset and Tag are many to many through the AssetTag join table (assetId, tagId).',
    count: (dataset) => dataset.assetTags.length,
  },
  'bundle-asset': {
    id: 'bundle-asset',
    title: 'Bundle to Asset',
    endpoints: ['Bundle', 'Asset'],
    via: 'BundleMembership',
    optional: false,
    explanation:
      'Bundle and Asset are many to many through the BundleMembership join table (bundleId, assetId).',
    count: (dataset) => dataset.bundleMemberships.length,
  },
  'asset-dependency': {
    id: 'asset-dependency',
    title: 'Asset depends on Asset',
    endpoints: ['Asset', 'Asset'],
    via: 'AssetDependency',
    optional: false,
    explanation:
      'AssetDependency is a self relationship: assetId depends on dependsOnAssetId, both pointing at Asset.id.',
    count: (dataset) => dataset.dependencies.length,
  },
  'asset-utilization': {
    id: 'asset-utilization',
    title: 'Utilization to Asset',
    endpoints: ['Utilization', 'Asset'],
    optional: false,
    explanation:
      'Utilization.assetId points to Asset.id with one row per asset per day carrying the usage metrics.',
    count: (dataset) => dataset.utilization.length,
  },
};

export const RELATIONSHIP_LIST: RelationshipMeta[] = RELATIONSHIP_IDS.map(
  (id) => RELATIONSHIPS[id]
);

export interface EdgeDef {
  id: string;
  relationship: RelationshipId;
  from: TableId;
  to: TableId;
  fromEnd: '1' | '*' | '0..1';
  toEnd: '1' | '*' | '0..1';
  dashed: boolean;
  pill?: string;
  pillIsCardinality?: boolean;
  offset?: number;
  selfLoop?: boolean;
}

const SHARED_EDGES: EdgeDef[] = [
  {
    id: 'asset-owner',
    relationship: 'asset-owner',
    from: 'Asset',
    to: 'Owner',
    fromEnd: '*',
    toEnd: '0..1',
    dashed: true,
    pill: '0..1 owner',
    pillIsCardinality: true,
  },
  {
    id: 'asset-origin',
    relationship: 'asset-origin',
    from: 'Asset',
    to: 'Origin',
    fromEnd: '*',
    toEnd: '0..1',
    dashed: true,
    pill: '0..1 origin',
    pillIsCardinality: true,
  },
  {
    id: 'asset-utilization',
    relationship: 'asset-utilization',
    from: 'Utilization',
    to: 'Asset',
    fromEnd: '*',
    toEnd: '1',
    dashed: false,
    pill: '1:* daily',
    pillIsCardinality: true,
  },
];

const COLLAPSED_EDGES: EdgeDef[] = [
  ...SHARED_EDGES,
  {
    id: 'asset-tag',
    relationship: 'asset-tag',
    from: 'Asset',
    to: 'Tag',
    fromEnd: '*',
    toEnd: '*',
    dashed: false,
    pill: '*:* via AssetTag',
    pillIsCardinality: true,
  },
  {
    id: 'bundle-asset',
    relationship: 'bundle-asset',
    from: 'Asset',
    to: 'Bundle',
    fromEnd: '*',
    toEnd: '*',
    dashed: false,
    pill: '*:* via BundleMembership',
    pillIsCardinality: true,
  },
  {
    id: 'asset-dependency',
    relationship: 'asset-dependency',
    from: 'Asset',
    to: 'Asset',
    fromEnd: '*',
    toEnd: '*',
    dashed: false,
    pill: 'depends on',
    selfLoop: true,
  },
];

const EXPANDED_EDGES: EdgeDef[] = [
  ...SHARED_EDGES,
  {
    id: 'assettag-asset',
    relationship: 'asset-tag',
    from: 'AssetTag',
    to: 'Asset',
    fromEnd: '*',
    toEnd: '1',
    dashed: false,
  },
  {
    id: 'assettag-tag',
    relationship: 'asset-tag',
    from: 'AssetTag',
    to: 'Tag',
    fromEnd: '*',
    toEnd: '1',
    dashed: false,
  },
  {
    id: 'membership-bundle',
    relationship: 'bundle-asset',
    from: 'BundleMembership',
    to: 'Bundle',
    fromEnd: '*',
    toEnd: '1',
    dashed: false,
  },
  {
    id: 'membership-asset',
    relationship: 'bundle-asset',
    from: 'BundleMembership',
    to: 'Asset',
    fromEnd: '*',
    toEnd: '1',
    dashed: false,
  },
  {
    id: 'dependency-source',
    relationship: 'asset-dependency',
    from: 'AssetDependency',
    to: 'Asset',
    fromEnd: '*',
    toEnd: '1',
    dashed: false,
    pill: 'assetId',
    offset: -20,
  },
  {
    id: 'dependency-target',
    relationship: 'asset-dependency',
    from: 'AssetDependency',
    to: 'Asset',
    fromEnd: '*',
    toEnd: '1',
    dashed: false,
    pill: 'dependsOnAssetId',
    offset: 20,
  },
];

const ENTITY_TABLES: TableId[] = ['Asset', 'Owner', 'Origin', 'Tag', 'Bundle', 'Utilization'];
const JOIN_TABLES: TableId[] = ['AssetTag', 'BundleMembership', 'AssetDependency'];

export function visibleTables(mode: LayoutMode): TableId[] {
  return mode === 'collapsed' ? ENTITY_TABLES : [...ENTITY_TABLES, ...JOIN_TABLES];
}

export function edgesForMode(mode: LayoutMode): EdgeDef[] {
  return mode === 'collapsed' ? COLLAPSED_EDGES : EXPANDED_EDGES;
}
