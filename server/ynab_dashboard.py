#!/usr/bin/env python3
"""YNAB dashboard snapshot — returns JSON for the finance widget."""
import sys, json, os
from datetime import datetime, timezone

sys.path.insert(0, os.path.expanduser('~/finn/skills/ynab'))
try:
    import ynab_helper as y
except Exception as e:
    print(json.dumps({'error': f'Could not load ynab_helper: {e}'}))
    sys.exit(0)

try:
    bid = y.default_budget_id()
    if not bid:
        print(json.dumps({'error': 'No YNAB budget found'}))
        sys.exit(0)

    # Accounts
    accts_raw = y.api(f'budgets/{bid}/accounts')
    if '_error' in accts_raw:
        print(json.dumps({'error': accts_raw['_error']}))
        sys.exit(0)

    accounts = [
        {
            'id': a['id'],
            'name': a['name'],
            'balance': a['balance'] / 1000,
            'type': a['type'],  # savings, checking, creditCard, otherAsset, etc.
        }
        for a in accts_raw['data']['accounts']
        if not a['deleted'] and not a['closed']
    ]

    assets = [a for a in accounts if a['balance'] >= 0]
    liabilities = [a for a in accounts if a['balance'] < 0]
    total_assets = sum(a['balance'] for a in assets)
    total_liabilities = sum(a['balance'] for a in liabilities)
    net_worth = total_assets + total_liabilities  # liabilities are negative

    # Recent transactions (last 30 days)
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%d')
    txn_raw = y.api(f'budgets/{bid}/transactions?since_date={since}')
    transactions = []
    if '_error' not in txn_raw:
        for t in txn_raw['data']['transactions'][:20]:
            if t.get('deleted'):
                continue
            transactions.append({
                'date': t['date'],
                'amount': t['amount'] / 1000,
                'payee': t.get('payee_name') or '',
                'category': t.get('category_name') or '',
                'approved': t.get('approved', True),
                'memo': t.get('memo') or '',
            })
        # Sort newest first, skip pure starting-balance entries
        transactions = [t for t in transactions if t['payee'] != 'Starting Balance']
        transactions.sort(key=lambda t: t['date'], reverse=True)

    # Category spend for current month
    month = datetime.now(timezone.utc).strftime('%Y-%m-01')
    cat_raw = y.api(f'budgets/{bid}/months/{month}/categories')
    category_spend = []
    if '_error' not in cat_raw:
        for c in cat_raw['data']['month']['categories']:
            if c.get('deleted') or c.get('hidden'):
                continue
            spent = abs(c['activity'] / 1000)
            budgeted = c['budgeted'] / 1000
            if spent > 0 or budgeted > 0:
                category_spend.append({
                    'name': c['name'],
                    'spent': spent,
                    'budgeted': budgeted,
                    'group': c.get('category_group_name') or '',
                })
        category_spend.sort(key=lambda c: c['spent'], reverse=True)

    unapproved = sum(1 for t in (txn_raw.get('data', {}).get('transactions', []) if '_error' not in txn_raw else []) if not t.get('approved') and not t.get('deleted'))

    print(json.dumps({
        'accounts': accounts,
        'netWorth': net_worth,
        'totalAssets': total_assets,
        'totalLiabilities': total_liabilities,
        'transactions': transactions[:15],
        'categorySpend': category_spend[:15],
        'unapproved': unapproved,
        'asOf': datetime.now(timezone.utc).isoformat(),
    }))
except Exception as e:
    print(json.dumps({'error': str(e)}))
