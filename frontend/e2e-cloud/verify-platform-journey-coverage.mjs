#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const resultsArg = process.argv[2] ?? 'test-results/results.json';
const manifestArg = process.argv[3] ?? 'e2e-cloud/platform-journey-manifest.json';

const resultsPath = path.resolve(process.cwd(), resultsArg);
const manifestPath = path.resolve(process.cwd(), manifestArg);
const reportPath = path.resolve(process.cwd(), 'test-results/platform-journey-coverage.json');

function appendSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, markdown);
}

function collectTestsFromSuite(suite, parentTitles = []) {
  const titleChain = suite.title ? [...parentTitles, suite.title] : parentTitles;
  const collected = [];

  for (const spec of suite.specs ?? []) {
    const specPrefix = [...titleChain, spec.title].filter(Boolean).join(' > ');

    for (const test of spec.tests ?? []) {
      const statuses = (test.results ?? []).map((result) => result.status);
      const passed = statuses.includes('passed');
      const title = [specPrefix, test.title].filter(Boolean).join(' > ');
      collected.push({ title, passed });
    }
  }

  for (const childSuite of suite.suites ?? []) {
    collected.push(...collectTestsFromSuite(childSuite, titleChain));
  }

  return collected;
}

function collectTests(results) {
  const all = [];
  for (const suite of results.suites ?? []) {
    all.push(...collectTestsFromSuite(suite, []));
  }
  return all;
}

if (!fs.existsSync(resultsPath)) {
  console.error(`[journey-coverage] Missing Playwright results file: ${resultsPath}`);
  process.exit(1);
}

if (!fs.existsSync(manifestPath)) {
  console.error(`[journey-coverage] Missing journey manifest: ${manifestPath}`);
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (!Array.isArray(manifest) || manifest.length === 0) {
  console.error('[journey-coverage] Journey manifest must be a non-empty array.');
  process.exit(1);
}

const manifestIds = manifest.map((item) => item.id);
const uniqueManifestIds = [...new Set(manifestIds)];

if (manifestIds.length !== uniqueManifestIds.length) {
  const duplicates = manifestIds.filter((id, index) => manifestIds.indexOf(id) !== index);
  console.error(`[journey-coverage] Duplicate journey IDs in manifest: ${[...new Set(duplicates)].join(', ')}`);
  process.exit(1);
}

const tests = collectTests(results);
const journeyTagRegex = /\[journey:([^\]]+)\]/g;
const coveredJourneyIds = new Set();

for (const test of tests) {
  for (const match of test.title.matchAll(journeyTagRegex)) {
    const id = match[1];
    if (test.passed) coveredJourneyIds.add(id);
  }
}

const uncoveredJourneyIds = uniqueManifestIds.filter((id) => !coveredJourneyIds.has(id));
const unknownCoveredJourneyIds = [...coveredJourneyIds].filter((id) => !uniqueManifestIds.includes(id));

const coveragePercent = uniqueManifestIds.length === 0
  ? 0
  : Math.round((coveredJourneyIds.size / uniqueManifestIds.length) * 10000) / 100;

const report = {
  manifestJourneys: uniqueManifestIds.length,
  coveredJourneys: coveredJourneyIds.size,
  coveragePercent,
  uncoveredJourneyIds,
  unknownCoveredJourneyIds,
  generatedAt: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

const markdown = [
  '\n## Platform Journey Coverage',
  '',
  `- Covered journeys: **${coveredJourneyIds.size}/${uniqueManifestIds.length}**`,
  `- Coverage: **${coveragePercent}%**`,
  '',
  uncoveredJourneyIds.length === 0
    ? '✅ 100% platform journey coverage reached.'
    : `❌ Missing journey coverage: ${uncoveredJourneyIds.join(', ')}`,
  unknownCoveredJourneyIds.length > 0
    ? `⚠️ Journey tags not in manifest: ${unknownCoveredJourneyIds.join(', ')}`
    : '',
  '',
].join('\n');

appendSummary(markdown);

console.log(`[journey-coverage] Covered ${coveredJourneyIds.size}/${uniqueManifestIds.length} journeys (${coveragePercent}%).`);

if (uncoveredJourneyIds.length > 0) {
  console.error(`[journey-coverage] Missing journeys: ${uncoveredJourneyIds.join(', ')}`);
  process.exit(1);
}
