import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

/**
 * The CI job graph.
 *
 * The story says: *"Given the shared package's test suite, when it runs, then
 * it covers every Zod schema and every enum parser, and it is executed as the
 * first test job in CI, before the mobile and admin suites."*
 *
 * The suite's **coverage** is asserted by the other test files. This asserts
 * the **order** — and the order is a property of the workflow file, which no
 * unit test can see on its own. A shared contract that breaks should fail the
 * PR before the mobile and admin suites spend minutes on a broken baseline,
 * and that only holds while `shared-test` gates them.
 *
 * The workflow is parsed as YAML rather than grepped. A grep for
 * `shared-test` would match the comment above the job — the file explains its
 * own graph in prose, exactly the way the source files explain their own
 * rules.
 */

const WORKFLOW_PATH = join(__dirname, '..', '..', '..', '.github', 'workflows', 'ci.yml');

interface WorkflowJob {
  needs?: string | string[];
  steps?: { run?: string }[];
}

interface Workflow {
  jobs: Record<string, WorkflowJob>;
}

const workflow = (): Workflow => {
  const parsed = load(readFileSync(WORKFLOW_PATH, 'utf8')) as Workflow | null;
  if (!parsed?.jobs) throw new Error(`Could not read the job graph from ${WORKFLOW_PATH}`);
  return parsed;
};

/** The names of the jobs that run a package's test suite. */
const testJobs = (jobs: Record<string, WorkflowJob>): string[] =>
  Object.keys(jobs).filter((name) => {
    const runs = jobs[name]?.steps?.map((step) => step.run ?? '') ?? [];
    return runs.some((run) => /pnpm\s+--filter\s+@nagar-shield\/\S+\s+test/.test(run));
  });

/** The package a test job runs. */
const testedPackage = (job: WorkflowJob | undefined): string | undefined => {
  const run = job?.steps?.map((step) => step.run ?? '').join('\n') ?? '';
  return /@nagar-shield\/([\w-]+)\s+test/.exec(run)?.[1];
};

describe('the CI job graph', () => {
  it('reads the workflow', () => {
    expect(Object.keys(workflow().jobs).length).toBeGreaterThan(0);
  });

  it('runs the shared suite in a test job', () => {
    const jobs = workflow().jobs;
    const shared = testJobs(jobs).filter((name) => testedPackage(jobs[name]) === 'shared');

    expect(shared).toEqual(['shared-test']);
  });

  it('runs the shared suite before the mobile and admin suites', () => {
    const jobs = workflow().jobs;
    const order = testJobs(jobs);

    const sharedAt = order.indexOf('shared-test');
    const mobileAt = order.indexOf('unit-test-mobile');
    const adminAt = order.indexOf('unit-test-admin');

    expect(sharedAt).toBeGreaterThanOrEqual(0);
    expect(mobileAt).toBeGreaterThanOrEqual(0);
    expect(adminAt).toBeGreaterThanOrEqual(0);

    expect(sharedAt).toBeLessThan(mobileAt);
    expect(sharedAt).toBeLessThan(adminAt);
  });

  it('gates the mobile and admin suites on the shared suite', () => {
    // The order of the `jobs:` block is a *presentation* order. The `needs:`
    // edge is the one GitHub actually honours — without it the three jobs
    // run in parallel and the shared contract is no longer the first signal.
    const jobs = workflow().jobs;

    for (const consumer of ['unit-test-mobile', 'unit-test-admin', 'unit-test-functions']) {
      const needs = jobs[consumer]?.needs;
      const list = Array.isArray(needs) ? needs : needs ? [needs] : [];

      expect(list).toContain('shared-test');
    }
  });

  it('runs every test job in the repository', () => {
    // A package that adds a test script but no CI job would silently stop
    // being tested. The three workspaces are the known set.
    const packages = new Set(
      Object.values(workflow().jobs)
        .map(testedPackage)
        .filter((name): name is string => Boolean(name)),
    );

    expect(packages).toEqual(new Set(['shared', 'mobile', 'admin']));
  });
});
