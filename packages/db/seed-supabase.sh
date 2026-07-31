#!/bin/bash
# Usage: ./seed-supabase.sh "your-supabase-password"
# Runs all 3 seeds against Supabase without touching .env

if [ -z "$1" ]; then
  echo "Usage: $0 \"<supabase-db-password>\""
  echo "Find your password at: Supabase Dashboard → Settings → Database"
  exit 1
fi

SUPABASE_URL="postgresql://postgres.bsvjxywgkrusaoburius:$1@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

cd "$(dirname "$0")"

echo "==> 1/3 Seeding demo users..."
DATABASE_URL="$SUPABASE_URL" npx prisma db seed
if [ $? -ne 0 ]; then echo "Seed failed"; exit 1; fi

echo ""
echo "==> 2/3 Cleaning up — keep only admin@nuro7.com..."
DATABASE_URL="$SUPABASE_URL" npx tsx prisma/clean-users.ts
if [ $? -ne 0 ]; then echo "Clean failed"; exit 1; fi

echo ""
echo "==> 3/3 Seeding Nuro 7 organization data..."
DATABASE_URL="$SUPABASE_URL" npx tsx prisma/seed-org-nuro7.mjs
if [ $? -ne 0 ]; then echo "Org seed failed"; exit 1; fi

echo ""
echo "✅ All done. Login:"
echo "   Email:    admin@nuro7.com"
echo "   Password: Nuro@2026"
