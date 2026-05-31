import os

ROUTERS_DIR = "/home/poa/xpenses_copy/backend/xpenses/routers"
FILES = ["categories.py", "dashboard.py", "expenses.py", "reports.py"]

for fname in FILES:
    filepath = os.path.join(ROUTERS_DIR, fname)
    with open(filepath, "r") as f:
        lines = f.readlines()
        
    new_lines = []
    in_try_block = False
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # 1. Add Depends to fastapi imports
        if line.startswith("from fastapi import "):
            if "Depends" not in line:
                line = line.replace("from fastapi import ", "from fastapi import Depends, ")
            new_lines.append(line)
            i += 1
            continue

        # 2. Add aiosqlite import to expenses and dashboard
        if fname in ["expenses.py", "dashboard.py"] and line.startswith("from ..database import get_db"):
            new_lines.append("import aiosqlite\n")
            new_lines.append(line)
            i += 1
            continue
            
        # 3. Add Depends(get_db) to endpoint signatures
        if line.strip().startswith("async def ") and i > 0 and ("@router" in lines[i-1] or "@router" in lines[i-2]):
            while not lines[i].strip().endswith("):"):
                new_lines.append(lines[i])
                i += 1
            
            sig_line = lines[i]
            if sig_line.strip().endswith("():"):
                sig_line = sig_line.replace("():", "(db: aiosqlite.Connection = Depends(get_db)):")
            else:
                sig_line = sig_line.replace("):", ", db: aiosqlite.Connection = Depends(get_db)):")
            new_lines.append(sig_line)
            i += 1
            continue
            
        # 4. Remove `db = await get_db()`
        if "db = await get_db()" in line and line.startswith("    db ="):
            i += 1
            continue
            
        # 5. Remove `try:` and unindent body
        if line.startswith("    try:\n"):
            in_try_block = True
            i += 1
            continue
            
        # 6. Remove `finally:` and `await db.close()`
        if in_try_block and line.startswith("    finally:\n"):
            in_try_block = False
            i += 2  # Skip this line and the `await db.close()` line
            continue
            
        if in_try_block:
            if line.startswith("        "):
                new_lines.append(line[4:])
            elif line.strip() == "":
                new_lines.append(line)
            else:
                new_lines.append(line[4:] if len(line) >= 4 else line)
            i += 1
            continue
            
        new_lines.append(line)
        i += 1
        
    with open(filepath, "w") as f:
        f.writelines(new_lines)

print("Routers refactored successfully.")
