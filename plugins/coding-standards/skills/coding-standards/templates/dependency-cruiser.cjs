// references/monorepo.md・references/backend.md・references/frontend.md の依存の方向を CI で検査する
const WEB = '^apps/web/src/';
const API = '^apps/api/src/';
const DOMAIN = `${API}domains/`;

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
      name: 'api-prisma-stays-in-db-access',
      comment:
        'Prisma の生成物を import してよいのは db/ と domains/*/queries.ts・mutations.ts だけ。型は queries.ts の select から作り、ドメインの index.ts から import する',
      severity: 'error',
      from: { path: API, pathNot: `${API}(db/|domains/[^/]+/(queries|mutations)\\.ts$)` },
      to: { path: `${API}generated/prisma/` },
    },
    {
      name: 'api-db-from-domains-and-entry',
      comment: 'db/ の値を import するのは domains・entry・deps.ts だけ。routes は domains の関数に c.env.deps を渡す',
      severity: 'error',
      from: { path: API, pathNot: `${API}(db/|domains/|entry/|deps\\.ts$)` },
      to: { path: `${API}db/`, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'api-adapters-from-entry-only',
      comment: 'adapters を組み立ててよいのは entry と deps.ts だけ。ほかの場所は interfaces/ の型を使う',
      severity: 'error',
      from: { path: API, pathNot: `${API}(entry/|adapters/|deps\\.ts$)` },
      to: { path: `${API}adapters/` },
    },
    {
      name: 'api-domains-have-no-http',
      comment: 'domains は Hono と HTTP 側のファイルを import しない。cron やキューからも同じ関数を呼べるようにするため',
      severity: 'error',
      from: { path: DOMAIN },
      to: {
        path: [
          `${API}(routes|presenters|middlewares|entry)/`,
          `${API}app(-env)?\\.ts$`,
          'node_modules/(hono|@hono/[^/]+)/',
        ],
      },
    },
    {
      name: 'api-routes-use-domain-index',
      comment: 'routes・middlewares・entry・presenters は domains/<name>/index.ts から import する',
      severity: 'error',
      from: { path: `${API}(routes|middlewares|entry|presenters)/` },
      to: { path: `${DOMAIN}[^/]+/(?!index\\.ts$)` },
    },
    {
      name: 'api-cross-domain-through-index-or-rules',
      comment:
        'ほかのドメインは index.ts（queries・usecases）か rules.ts だけを import する。書き込みはそのドメインの usecase を呼ぶ',
      severity: 'error',
      from: { path: `${DOMAIN}([^/]+)/` },
      to: { path: `${DOMAIN}[^/]+/(?!(index|rules)\\.ts$)`, pathNot: `${DOMAIN}$1/` },
    },
    {
      name: 'api-domain-index-exports-queries-and-usecases',
      comment: 'ドメインの index.ts は queries と usecases だけを re-export する。mutations は公開しない',
      severity: 'error',
      from: { path: `${DOMAIN}([^/]+)/index\\.ts$` },
      to: { pathNot: `${DOMAIN}$1/(queries\\.ts$|usecases/)` },
    },
    {
      name: 'api-usecases-do-not-call-sibling-usecases',
      comment: '同じドメインの usecase どうしは呼び合わない。共通の手順は rules・queries・mutations に切り出す',
      severity: 'error',
      from: { path: `${DOMAIN}([^/]+)/usecases/`, pathNot: '\\.test\\.ts$' },
      to: { path: `${DOMAIN}$1/usecases/` },
    },
    {
      name: 'api-rules-have-no-io',
      comment: 'rules.ts は I/O を持たない。import してよいのは auth・errors・lib とドメインの rules.ts だけ',
      severity: 'error',
      from: { path: `${DOMAIN}[^/]+/rules\\.ts$` },
      to: { path: API, pathNot: `${API}(auth|errors|lib)/|${DOMAIN}[^/]+/rules\\.ts$` },
    },
    {
      name: 'api-queries-and-mutations-touch-db-only',
      comment: 'queries・mutations は DB だけに触る。同じドメインの queries.ts と rules.ts は import してよい',
      severity: 'error',
      from: { path: `${DOMAIN}([^/]+)/(?:queries|mutations)\\.ts$` },
      to: {
        path: `${API}(domains|adapters|interfaces)/|${API}deps\\.ts$`,
        pathNot: `${DOMAIN}$1/(queries|rules)\\.ts$`,
      },
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
