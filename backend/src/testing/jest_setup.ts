// Runs before every test file. Tests read the real environment, so `DATABASE_URL` must point at a
// disposable database. Everything else gets a test default here.
process.env['NODE_ENV'] ??= 'test';
process.env['LOG_LEVEL'] ??= 'silent';
process.env['SECRETS_ENCRYPTION_KEY'] ??= Buffer.alloc(32, 1).toString('base64');
process.env['WORKSPACE_DIR'] ??= `${process.cwd()}/.workspace_test`;
process.env['PROVIDER_TIMEOUT_MS'] ??= '10000';
process.env['RUN_LEASE_SECONDS'] ??= '30';
