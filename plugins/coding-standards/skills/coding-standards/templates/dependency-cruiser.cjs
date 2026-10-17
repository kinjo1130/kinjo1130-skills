// references/monorepo.md と references/frontend.md の依存の方向を CI で検査する
const WEB = '^apps/web/src/';

const layer = (name) => `${WEB}${name}/`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'contracts-is-leaf',
      comment: 'packages/contracts は zod 以外に依存しない',
      severity: 'error',
      from: { path: '^packages/contracts/' },
      to: { path: '^(apps|packages/(?!contracts/))' },
    },
    {
      name: 'api-does-not-import-web',
      severity: 'error',
      from: { path: '^apps/api/' },
      to: { path: '^apps/web/' },
    },
    {
      name: 'web-imports-api-types-only',
      comment: 'web から api への import は hc 用の import type だけ',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^apps/api/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'prisma-stays-in-repositories',
      comment: 'Prisma の生成物は repositories と adapters/db の外で使わない',
      severity: 'error',
      from: { path: '^apps/api/src/', pathNot: '^apps/api/src/(repositories|adapters/db)/' },
      to: { path: '^apps/api/src/generated/prisma/' },
    },
    {
      name: 'runtime-specific-in-entry-only',
      comment: 'adapters を組み立ててよいのは entry と container だけ',
      severity: 'error',
      from: { path: '^apps/api/src/', pathNot: '^apps/api/src/(entry|adapters|container\\.ts)' },
      to: { path: '^apps/api/src/adapters/' },
    },
    {
      name: 'ui-is-leaf',
      severity: 'error',
      from: { path: layer('components/ui') },
      to: { path: `${WEB}(?!(components/ui|types|constants|utils)/)` },
    },
    {
      name: 'domain-has-no-data-access',
      severity: 'error',
      from: { path: layer('components/domain') },
      to: { path: `${WEB}(hooks|api|components/container|providers|routes)/` },
    },
    {
      name: 'hooks-do-not-import-components',
      severity: 'error',
      from: { path: layer('hooks') },
      to: { path: `${WEB}(components|routes)/` },
    },
    {
      name: 'api-layer-is-bottom',
      severity: 'error',
      from: { path: layer('api') },
      to: { path: `${WEB}(hooks|components|routes|providers)/` },
    },
    {
      name: 'routes-use-containers',
      comment: 'routes は Container を置くだけ。domain / ui / api を直接使わない',
      severity: 'error',
      from: { path: layer('routes') },
      to: { path: `${WEB}(components/(domain|ui)|api)/` },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules', 'generated/'] },
    exclude: { path: 'routeTree\\.gen\\.ts' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
