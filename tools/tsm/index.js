module.parent.require('esm');

Object.assign(process.env, {
    TS_NODE_TRANSPILE_ONLY: 'true',
    TS_NODE_SKIP_PROJECT: 'true',
    TS_NODE_COMPILER_OPTIONS: JSON.stringify({
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        jsx: 'react',
        moduleResolution: 'node',
        target: 'esnext',
    }),
    TS_NODE_IGNORE: '/node_modules/(?!@teux)',
    TS_NODE_PRETTY: 'true',
});
require('ts-node').register();
