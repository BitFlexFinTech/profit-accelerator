-- Clean up invalid balance history records with total_balance = 0
DELETE FROM balance_history WHERE total_balance = 0;