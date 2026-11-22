"""
แปลงไฟล์บัญชียาหลัก (datadrug.xlsx) เป็น data/medicines.json
ให้ backend ใช้ตั้งต้นฐานข้อมูลยา

วิธีใช้ (รันจากโฟลเดอร์โปรเจกต์):
    pip install pandas openpyxl
    python scripts/import_xlsx.py
จากนั้นรัน  npm run reset-medicines  เพื่อโหลดข้อมูลยาชุดใหม่เข้าฐานข้อมูล
"""
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "datadrug.xlsx"
OUT = ROOT / "data" / "medicines.json"

COLUMNS = {
    "ลำดับ (No.)": "no",
    "ชื่อหมวดหมู่หลัก (Main Group)": "main_group",
    "หมวดหมูีย่อย (Subgroup Path)": "subgroup",
    "ชื่อสามัญทางยา (Generic Name)": "generic_name",
    "รูปแบบยา (Dosage Form)": "dosage_form",
    "ความแรง / เกลือ (Strength/Salt)": "strength",
    "บัญชีย่อยเดิม": "account_old",
    "บัญชีย่อยใหม่": "account_new",
    "รหัสการเปลี่ยนแปลง (Change Code)": "change_code",
    "รายละเอียดการเปลี่ยนแปลง": "change_detail",
    "เงื่อนไขการใช้ยา": "conditions",
    "คำเตือน / หมายเหตุเพิ่มเติม": "remarks",
    "วันที่ประกาศราชกิจจาฯ": "announced_at",
}


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC
    xls = pd.ExcelFile(src)
    sheet = next((s for s in xls.sheet_names if "NLEM" in s or "Data" in s), xls.sheet_names[-1])
    df = xls.parse(sheet).rename(columns=COLUMNS)

    missing = [c for c in COLUMNS.values() if c not in df.columns]
    if missing:
        raise SystemExit(f"ไม่พบคอลัมน์: {missing}")

    rows = []
    for _, r in df.iterrows():
        if pd.isna(r["generic_name"]) or not str(r["generic_name"]).strip():
            continue
        item = {}
        for key in COLUMNS.values():
            v = r[key]
            if pd.isna(v):
                item[key] = 0 if key == "no" else ""
            elif key == "no":
                item[key] = int(v)
            else:
                item[key] = str(v).strip()
        rows.append(item)

    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"เขียน {len(rows)} รายการไปที่ {OUT} (จากชีต {sheet})")


if __name__ == "__main__":
    main()
