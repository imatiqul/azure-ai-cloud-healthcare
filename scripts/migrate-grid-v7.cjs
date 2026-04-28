'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const files = [
  'frontend/apps/engagement-mfe/src/components/DeliveryAnalyticsDashboard.tsx',
  'frontend/apps/pophealth-mfe/src/App.tsx',
  'frontend/apps/revenue-mfe/src/components/DenialManager.tsx',
  'frontend/apps/revenue-mfe/src/App.tsx',
  'frontend/apps/scheduling-mfe/src/components/SlotCalendar.tsx',
  'frontend/apps/scheduling-mfe/src/App.tsx',
  'frontend/apps/shell/src/components/DashboardQuickActions.tsx',
  'frontend/apps/shell/src/pages/AdminSettings.tsx',
  'frontend/apps/shell/src/pages/BreakGlassAccessPanel.tsx',
  'frontend/apps/shell/src/pages/BusinessKpiDashboard.tsx',
  'frontend/apps/shell/src/pages/ClinicalAlertsCenter.tsx',
  'frontend/apps/shell/src/pages/Dashboard.tsx',
  'frontend/apps/shell/src/pages/IdentityUserAdminPanel.tsx',
  'frontend/apps/shell/src/pages/ModelGovernanceDashboard.tsx',
  'frontend/apps/shell/src/pages/ModelRegisterPanel.tsx',
  'frontend/apps/shell/src/pages/PlatformHealthPanel.tsx',
  'frontend/apps/shell/src/pages/PractitionerManager.tsx',
  'frontend/apps/shell/src/pages/ReportsExportPanel.tsx',
  'frontend/apps/shell/src/pages/TenantAdminPanel.tsx',
  'frontend/apps/shell/src/pages/WorkflowOperationsWorkbench.tsx',
];

/**
 * Build the MUI v7 size prop from extracted breakpoint values.
 * If only xs is present, use size={n} shorthand; otherwise use size={{ xs: n, ... }}.
 */
function buildSizeProp(xs, sm, md, lg) {
  const parts = [];
  if (xs !== undefined) parts.push(`xs: ${xs}`);
  if (sm !== undefined) parts.push(`sm: ${sm}`);
  if (md !== undefined) parts.push(`md: ${md}`);
  if (lg !== undefined) parts.push(`lg: ${lg}`);

  if (parts.length === 1 && xs !== undefined) {
    return `size={${xs}}`;
  }
  return `size={{ ${parts.join(', ')} }}`;
}

/**
 * Transform a single file's content.
 * Matches <Grid item ...> and rewrites to <Grid size={...} ...>.
 * Handles optional key={...} and other non-breakpoint props.
 * The [^>]* captures everything up to the closing > on the same line.
 */
function transform(content) {
  return content.replace(/<Grid\s+item\b([^>]*?)>/g, (match, propsStr) => {
    // Extract numeric breakpoint values
    const xsMatch = propsStr.match(/\bxs=\{(\d+)\}/);
    const smMatch = propsStr.match(/\bsm=\{(\d+)\}/);
    const mdMatch = propsStr.match(/\bmd=\{(\d+)\}/);
    const lgMatch = propsStr.match(/\blg=\{(\d+)\}/);

    const xs = xsMatch?.[1];
    const sm = smMatch?.[1];
    const md = mdMatch?.[1];
    const lg = lgMatch?.[1];

    if (!xs && !sm && !md && !lg) {
      // No numeric breakpoint props — just remove 'item'
      const remaining = propsStr.trim();
      return remaining ? `<Grid ${remaining}>` : `<Grid>`;
    }

    const sizeProp = buildSizeProp(xs, sm, md, lg);

    // Strip breakpoint props from remaining props string
    let remaining = propsStr
      .replace(/\s*\bxs=\{\d+\}/g, '')
      .replace(/\s*\bsm=\{\d+\}/g, '')
      .replace(/\s*\bmd=\{\d+\}/g, '')
      .replace(/\s*\blg=\{\d+\}/g, '')
      .trim();

    return remaining ? `<Grid ${sizeProp} ${remaining}>` : `<Grid ${sizeProp}>`;
  });
}

let totalChanged = 0;
let totalItems = 0;

for (const rel of files) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) {
    console.log(`  SKIP (not found): ${rel}`);
    continue;
  }
  const original = fs.readFileSync(filePath, 'utf8');
  const itemCount = (original.match(/<Grid\s+item\b/g) || []).length;
  const transformed = transform(original);

  if (original !== transformed) {
    fs.writeFileSync(filePath, transformed, 'utf8');
    console.log(`  CHANGED (${itemCount} item→size): ${rel}`);
    totalChanged++;
    totalItems += itemCount;
  } else {
    console.log(`  UNCHANGED: ${rel}`);
  }
}

console.log(`\nDone. ${totalChanged} files modified, ${totalItems} Grid item occurrences migrated.`);
