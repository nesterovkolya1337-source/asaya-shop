"""Read-only XLSX extraction. Dates in the supplied WB export use Moscow local time.
Usage: python extract-wb-reviews.py reviews.xlsx output.json
Neither the workbook nor its review text is rewritten.
"""
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
import openpyxl

book = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
sheet = book['feedbacks']
rows = iter(sheet.values)
headers = next(rows)
expected = ['Дата', 'Артикул продавца', 'Количество звезд', 'Бренд', 'Текст отзыва', 'Имя']
if list(headers) != expected:
    raise ValueError('Unexpected feedbacks columns')
result = []
for date, sku, rating, brand, body, author in rows:
    if all(v is None for v in (date, sku, rating, brand, body, author)):
        continue
    if isinstance(date, datetime):
        date = date.replace(tzinfo=timezone(timedelta(hours=3))).isoformat()
    result.append(dict(sku=sku, rating=rating, body=body or '', author=author or '', date=date))
Path(sys.argv[2]).write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
print(f'Extracted {len(result)} non-empty rows')
