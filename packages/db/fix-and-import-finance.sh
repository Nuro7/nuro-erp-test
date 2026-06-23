#!/bin/bash
# Usage: ./fix-and-import-finance.sh "your-supabase-password"
# Fixes the missing SALARY enum value, wipes partial import, re-runs import.

if [ -z "$1" ]; then
  echo "Usage: $0 \"<supabase-db-password>\""
  exit 1
fi

DB_URL="postgresql://postgres.bsvjxywgkrusaoburius:$1@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?connection_limit=3"

cd "$(dirname "$0")"

echo "==> 1/3 Adding SALARY to ExpenseCategory enum in Supabase..."
# DDL must run outside a transaction for ADD VALUE on an enum
DATABASE_URL="$DB_URL" npx tsx --eval "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  try {
    await p.\$executeRawUnsafe(\"ALTER TYPE \\\"ExpenseCategory\\\" ADD VALUE IF NOT EXISTS 'SALARY'\");
    console.log('  ✓ SALARY enum value added (or already exists)');
  } catch (e) {
    console.log('  Note:', e.message);
  } finally {
    await p.\$disconnect();
  }
})();
"
if [ $? -ne 0 ]; then echo "Enum fix failed"; exit 1; fi

echo ""
echo "==> 2/3 Wiping partial finance data (so re-import doesn't duplicate)..."
DATABASE_URL="$DB_URL" npx tsx prisma/wipe-business-data.ts
if [ $? -ne 0 ]; then echo "Wipe failed"; exit 1; fi

echo ""
echo "==> 3/3 Re-running finance import..."
DATABASE_URL="$DB_URL" npx tsx prisma/notion-finance-import/import.ts
if [ $? -ne 0 ]; then echo "Import failed"; exit 1; fi

echo ""
echo "==> Verifying counts..."
DATABASE_URL="$DB_URL" npx tsx prisma/notion-finance-import/verify.ts
