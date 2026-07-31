#!/bin/bash
# Usage: ./import-finance.sh "your-supabase-password"
# Imports Notion finance CSVs (accounts, expenses, incomes, transfers) into Supabase.

if [ -z "$1" ]; then
  echo "Usage: $0 \"<supabase-db-password>\""
  echo ""
  echo "This imports:"
  echo "  - 4 bank accounts (N7 Main + 3 founder personal)"
  echo "  - All expenses (Expense + BankTransaction DEBIT per row)"
  echo "  - All incomes (Revenue + BankTransaction CREDIT per row)"
  echo "  - Paired transfers between accounts"
  echo "  - Matching journal entries to the GL"
  exit 1
fi

# Use session pooler (same as Render uses now)
DB_URL="postgresql://postgres.bsvjxywgkrusaoburius:$1@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"

cd "$(dirname "$0")"

echo "==> Importing finance data into Supabase..."
DATABASE_URL="$DB_URL" npx tsx prisma/notion-finance-import/import.ts

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Import complete. Verifying counts..."
  DATABASE_URL="$DB_URL" npx tsx prisma/notion-finance-import/verify.ts
fi
