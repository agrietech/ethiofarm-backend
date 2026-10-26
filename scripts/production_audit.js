#!/usr/bin/env node

/**
 * AgriEtech Production Readiness Audit
 * Checks for bugs, security issues, redundant files, and production readiness
 */

const fs = require('fs');
const path = require('path');

const issues = [];
const warnings = [];
const info = [];

function log(type, category, message, file = null) {
  const entry = { type, category, message, file };
  if (type === 'ERROR') issues.push(entry);
  else if (type === 'WARN') warnings.push(entry);
  else info.push(entry);
}

// Check 1: Duplicate/Redundant Files
console.log('🔍 Phase 1: Checking for duplicate/redundant files...\n');

if (fs.existsSync('prisma.config.js') && fs.existsSync('prisma.config.ts')) {
  log('WARN', 'Redundancy', 'Duplicate Prisma config files found (prisma.config.js and prisma.config.ts)', 'prisma.config.ts');
}

// Check 2: Environment Variables
console.log('🔍 Phase 2: Validating environment configuration...\n');

const envExample = fs.existsSync('.env.example');
const envFile = fs.existsSync('.env');

if (!envExample) {
  log('ERROR', 'Config', '.env.example file missing - required for deployment documentation');
}

if (!envFile) {
  log('WARN', 'Config', '.env file not found - will use defaults (acceptable for Docker)');
}

// Check required env vars from .env.example
if (envExample) {
  const envExampleContent = fs.readFileSync('.env.example', 'utf8');
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'NODE_ENV',
    'PORT',
    'REDIS_URL',
  ];

  requiredVars.forEach(varName => {
    if (!envExampleContent.includes(varName)) {
      log('ERROR', 'Config', `Required environment variable ${varName} not documented in .env.example`);
    }
  });
}

// Check 3: Security Issues
console.log('🔍 Phase 3: Security vulnerability scan...\n');

function scanFileForSecurityIssues(filePath) {
  if (!filePath.endsWith('.js')) return;
  if (filePath.includes('node_modules')) return;
  if (filePath.includes('scripts/')) return; // Scripts can have console.log

  const content = fs.readFileSync(filePath, 'utf8');

  // Check for eval() usage
  if (content.includes('eval(')) {
    log('ERROR', 'Security', 'Usage of eval() detected - major security risk', filePath);
  }

  // Check for hardcoded secrets (excluding config files)
  if (!filePath.includes('config/env.js')) {
    const secretPatterns = [
      /password\s*=\s*["'][^"']+["']/i,
      /api_key\s*=\s*["'][a-zA-Z0-9]{20,}["']/i,
      /secret\s*=\s*["'][a-zA-Z0-9]{20,}["']/i,
    ];

    secretPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        log('ERROR', 'Security', 'Possible hardcoded secret detected', filePath);
      }
    });
  }
}

// Scan all JS files
function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  entries.forEach(entry => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'uploads', 'logs'].includes(entry.name)) {
        scanDirectory(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      scanFileForSecurityIssues(fullPath);
    }
  });
}

scanDirectory('src');

// Check 4: Code Quality
console.log('🔍 Phase 4: Code quality checks...\n');

// Check if critical files exist
const criticalFiles = [
  'src/app.js',
  'src/server.js',
  'src/config/db.js',
  'src/config/env.js',
  'prisma/schema.prisma',
  'package.json',
  'README.md',
];

criticalFiles.forEach(file => {
  if (!fs.existsSync(file)) {
    log('ERROR', 'Structure', `Critical file missing: ${file}`);
  } else {
    log('INFO', 'Structure', `Critical file exists: ${file}`);
  }
});

// Check 5: Production Readiness
console.log('🔍 Phase 5: Production readiness validation...\n');

// Check package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (!packageJson.engines) {
  log('WARN', 'Production', 'package.json missing "engines" field - specify Node.js version');
}

if (!packageJson.scripts.start) {
  log('ERROR', 'Production', 'package.json missing "start" script');
} else {
  log('INFO', 'Production', 'Production start script defined');
}

// Check for required dependencies
const requiredDeps = ['express', 'dotenv', '@prisma/client'];
requiredDeps.forEach(dep => {
  if (!packageJson.dependencies[dep]) {
    log('ERROR', 'Dependencies', `Required dependency missing: ${dep}`);
  }
});

// Check Dockerfile
if (!fs.existsSync('Dockerfile')) {
  log('WARN', 'Production', 'Dockerfile not found - Docker deployment not configured');
} else {
  log('INFO', 'Production', 'Dockerfile exists for containerized deployment');
}

// Check docker-compose.yml
if (!fs.existsSync('docker-compose.yml')) {
  log('WARN', 'Production', 'docker-compose.yml not found');
} else {
  log('INFO', 'Production', 'docker-compose.yml exists for local development');
}

// Check 6: Unused Files
console.log('🔍 Phase 6: Checking for unused/obsolete files...\n');

const potentiallyUnusedFiles = [
  'start-dev.bat', // Windows-specific dev script
];

potentiallyUnusedFiles.forEach(file => {
  if (fs.existsSync(file)) {
    log('INFO', 'Cleanup', `Platform-specific file found: ${file} (OK for dev convenience)`);
  }
});

// Check 7: Documentation
console.log('🔍 Phase 7: Documentation validation...\n');

const docFiles = [
  'README.md',
  'docs/README.md',
  'docs/ARCHITECTURE.md',
  'docs/API_SPECIFICATION.md',
  'firmware/README.md',
];

docFiles.forEach(file => {
  if (!fs.existsSync(file)) {
    log('WARN', 'Documentation', `Documentation file missing: ${file}`);
  } else {
    log('INFO', 'Documentation', `Documentation exists: ${file}`);
  }
});

// Generate Report
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('           PRODUCTION READINESS AUDIT REPORT');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`📊 Summary:`);
console.log(`   ✅ Info: ${info.length}`);
console.log(`   ⚠️  Warnings: ${warnings.length}`);
console.log(`   ❌ Errors: ${issues.length}\n`);

if (issues.length > 0) {
  console.log('❌ CRITICAL ISSUES (Must Fix):');
  console.log('─────────────────────────────────────────────────────────────');
  issues.forEach((issue, i) => {
    console.log(`${i + 1}. [${issue.category}] ${issue.message}`);
    if (issue.file) console.log(`   File: ${issue.file}`);
  });
  console.log('');
}

if (warnings.length > 0) {
  console.log('⚠️  WARNINGS (Should Fix):');
  console.log('─────────────────────────────────────────────────────────────');
  warnings.forEach((warn, i) => {
    console.log(`${i + 1}. [${warn.category}] ${warn.message}`);
    if (warn.file) console.log(`   File: ${warn.file}`);
  });
  console.log('');
}

console.log('✅ PRODUCTION READINESS CHECKLIST:');
console.log('─────────────────────────────────────────────────────────────');
console.log(`[${fs.existsSync('.env.example') ? '✓' : '✗'}] Environment variables documented`);
console.log(`[${fs.existsSync('Dockerfile') ? '✓' : '✗'}] Docker configuration`);
console.log(`[${fs.existsSync('README.md') ? '✓' : '✗'}] README documentation`);
console.log(`[${fs.existsSync('docs/API_SPECIFICATION.md') ? '✓' : '✗'}] API documentation`);
console.log(`[${packageJson.scripts.start ? '✓' : '✗'}] Production start script`);
console.log(`[${issues.length === 0 ? '✓' : '✗'}] No critical errors`);
console.log(`[${warnings.length < 3 ? '✓' : '✗'}] Minimal warnings`);
console.log('');

console.log('═══════════════════════════════════════════════════════════════');

if (issues.length === 0) {
  console.log('✅ PASSED - Backend is production-ready!');
} else {
  console.log(`❌ FAILED - ${issues.length} critical issue(s) must be fixed`);
}

console.log('═══════════════════════════════════════════════════════════════\n');

process.exit(issues.length > 0 ? 1 : 0);
