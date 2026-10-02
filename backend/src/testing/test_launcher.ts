import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AppConfig } from '@/config/config.schema';
import { DockerEngineClient } from '@/lib/docker_engine/docker_engine_client';
import { SandboxLauncherModule } from '@/lib/sandbox_launcher/sandbox_launcher.module';

const exec_file = promisify(execFile);

/** The image the sandbox tests run, built from `Dockerfile.sandbox` when it is missing. */
export const TEST_SANDBOX_IMAGE = 'tbn/sandbox:test';

/** The internal network the sandbox tests create. */
export const TEST_SANDBOX_NETWORK = 'tbn_test_sandbox';

/**
 * Configuration for a launcher in tests: the test image and network, the test workspace directory
 * bound into containers as a host path, this process's uid so the files the two sides write
 * belong to one user, and two containers at a time.
 */
export function launcher_test_config(config: AppConfig): AppConfig {
  return {
    ...config,
    sandbox: {
      ...config.sandbox,
      image: TEST_SANDBOX_IMAGE,
      network: TEST_SANDBOX_NETWORK,
      workspace_volume: resolve(config.workspace.dir),
      uid: process.getuid?.() ?? config.sandbox.uid,
      max_parallel: 2,
    },
  };
}

/**
 * Checks that the engine answers, builds the test image when it is missing and creates the test
 * network. Returns a client for the test's own use.
 *
 * @throws Error when Docker is not reachable: the sandbox tests need it.
 */
export async function prepare_test_sandbox(config: AppConfig): Promise<DockerEngineClient> {
  const docker = new DockerEngineClient(config.sandbox.docker_socket);
  if (!(await docker.ping())) {
    throw new Error(
      `Docker does not answer on ${config.sandbox.docker_socket}. The sandbox tests need it.`,
    );
  }
  if (!(await docker.has_image(config.sandbox.image))) {
    await exec_file(
      'docker',
      ['build', '--file', 'Dockerfile.sandbox', '--tag', config.sandbox.image, '.'],
      { cwd: resolve(process.cwd(), '..'), maxBuffer: 16 * 1_048_576 },
    );
  }
  await docker.ensure_network(config.sandbox.network, true);
  return docker;
}

/**
 * Starts the sandbox launcher in this process, the way `sandbox.ts` does but without a port. It
 * removes orphaned containers, then handles `sandbox_job` jobs until closed.
 */
export async function start_test_launcher(config: AppConfig): Promise<INestApplicationContext> {
  const module_ref = await Test.createTestingModule({
    imports: [
      SandboxLauncherModule.register({ ...config, sandbox: { ...config.sandbox, port: 0 } }),
    ],
  }).compile();
  return module_ref.init();
}
