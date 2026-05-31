import os

ROUTERS_DIR = "/home/poa/xpenses_copy/backend/xpenses/routers"
FILES = ["categories.py", "dashboard.py", "expenses.py", "reports.py"]

for fname in FILES:
    filepath = os.path.join(ROUTERS_DIR, fname)
    with open(filepath, "r") as f:
        content = f.read()

    lines = content.split('\n')
    new_lines = []
    
    i = 0
    in_try_block = False
    import_depends_added = False
    
    while i < len(lines):
        line = lines[i]
        
        if line.startswith("from fastapi import ") and not import_depends_added:
            if "Depends" not in line:
                line = line.replace("from fastapi import ", "from fastapi import Depends, ")
            new_lines.append(line)
            import_depends_added = True
            i += 1
            continue

        if fname in ["expenses.py", "dashboard.py"] and line.startswith("from ..database import get_db"):
            new_lines.append("import aiosqlite")
            new_lines.append(line)
            i += 1
            continue
            
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
            
        if line == "    db = await get_db()":
            i += 1
            if i < len(lines) and lines[i] == "    try:":
                in_try_block = True
                i += 1 
            continue
            
        if in_try_block and line == "    finally:":
            in_try_block = False
            i += 2
            continue
            
        if in_try_block:
            if line.startswith("        "):
                new_lines.append(line[4:])
            elif line.strip() == "":
                new_lines.append(line)
            else:
                new_lines.append(line)
            i += 1
            continue
            
        new_lines.append(line)
        i += 1

    content_out = '\n'.join(new_lines)

    if fname == "reports.py":
        old_str = """    await db.execute(
        "UPDATE expense_reports SET status = 'draft', submitted_at = NULL, total_amount = 0, updated_at = ? WHERE id = ?",
        (now, report_id),
    )"""
        new_str = """    async with db.execute("SELECT COALESCE(SUM(amount_eur), 0.0) as total FROM expenses WHERE report_id = ?", (report_id,)) as c:
        total = (await c.fetchone())["total"]

    await db.execute(
        "UPDATE expense_reports SET status = 'draft', submitted_at = NULL, total_amount = ?, updated_at = ? WHERE id = ?",
        (total, now, report_id),
    )"""
        content_out = content_out.replace(old_str, new_str)

    with open(filepath, "w") as f:
        f.write(content_out)

print("Routers refactored successfully.")
