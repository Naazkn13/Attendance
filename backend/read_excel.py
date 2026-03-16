import pandas as pd

file_path = 'c:/Users/NuzhatKhan/Downloads/Attendance/excel/Emp pay sheet.xlsx'
output_file = 'c:/Users/NuzhatKhan/Downloads/Attendance/backend/excel_output.txt'

xl = pd.ExcelFile(file_path)
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(f"Sheet names: {xl.sheet_names}\n")
    for sheet in xl.sheet_names:
        f.write(f"\n{'='*80}\n")
        f.write(f"SHEET: {sheet}\n")
        f.write(f"{'='*80}\n")
        df = pd.read_excel(file_path, sheet_name=sheet, header=None)
        for i in range(min(40, len(df))):
            row_vals = []
            for col in df.columns:
                val = df.iloc[i][col]
                if pd.notna(val) and str(val).strip() != "":
                    row_vals.append(f"[Col{col}] {val}")
            if row_vals:
                f.write(f"  Row {i}: {' | '.join(row_vals)}\n")

print("Done! Output written to excel_output.txt")
