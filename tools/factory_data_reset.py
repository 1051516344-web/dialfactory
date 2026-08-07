"""DialFactory V1.1 · Factory Data Migration
Replaces Phase 1-E demo data with real factory data.
No schema changes. Data only."""

import urllib.request, json, sys

BASE = "https://wzfkmwrqnvjegunjueka.supabase.co"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Zmttd3JxbnZqZWd1bmp1ZWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5ODExNTksImV4cCI6MjEwMTU1NzE1OX0.Y8IVY-epnh_0gBpumzyDSy6W8mEtVX8mrwd4ExngL2M"

def api(method, table, data=None, params=""):
    url = f"{BASE}/rest/v1/{table}?{params}" if params else f"{BASE}/rest/v1/{table}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("apikey", ANON)
    req.add_header("Authorization", f"Bearer {ANON}")
    if data:
        req.add_header("Content-Type", "application/json")
        req.add_header("Prefer", "return=representation")
    if method == "GET" and "count" in params:
        req.add_header("Prefer", "count=exact")
    try:
        resp = urllib.request.urlopen(req)
        text = resp.read().decode()
        return json.loads(text) if text else []
    except Exception as e:
        print(f"  ERROR: {e}", file=sys.stderr)
        return None

def count(table):
    rows = api("GET", table)
    return len(rows) if rows else 0

def delete_all(table, condition=None):
    url = f"{BASE}/rest/v1/{table}"
    if condition:
        url += f"?{condition}"
    req = urllib.request.Request(url, method="DELETE")
    req.add_header("apikey", ANON)
    req.add_header("Authorization", f"Bearer {ANON}")
    try:
        urllib.request.urlopen(req)
        return True
    except Exception as e:
        print(f"  DELETE ERROR ({table}): {e}", file=sys.stderr)
        return False

def insert_batch(table, rows):
    body = json.dumps(rows).encode()
    req = urllib.request.Request(f"{BASE}/rest/v1/{table}", data=body, method="POST")
    req.add_header("apikey", ANON)
    req.add_header("Authorization", f"Bearer {ANON}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "return=representation")
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except Exception as e:
        print(f"  INSERT ERROR ({table}): {e}", file=sys.stderr)
        return None

# ============================================================
# Step 0: Backup counts
# ============================================================
print("=== BEFORE ===")
before = {}
for t in ["departments","customers","processes","process_routes","route_steps","orders","order_nodes","exception_events"]:
    before[t] = count(t)
    print(f"  {t}: {before[t]}")

# ============================================================
# Step 1: Delete demo data (FK order: route_steps -> process_routes -> processes -> customers)
# ============================================================
print("\n=== Step 1: Delete demo data ===")
delete_all("route_steps")
delete_all("process_routes")
delete_all("processes")
delete_all("customers")
print("  Demo data deleted.")

# ============================================================
# Step 2: Verify departments (should still be 5)
# ============================================================
deps = api("GET", "departments")
dept_map = {d['name']: d['id'] for d in deps}
print(f"\n  Departments: {len(deps)} (expected 5)")
for name in ['制一','制二','制三','制四','总QC']:
    print(f"    {name}: {'OK' if name in dept_map else 'MISSING!'}")

# ============================================================
# Step 3: Insert real customers (16)
# ============================================================
print("\n=== Step 3: Insert 16 real customers ===")
CUSTOMERS = [
    ("ACC", "ACCENDO HONG KONG LTD", True),
    ("ATT", "艺时香港有限公司", True),
    ("FAF", "俊光实业有限公司", True),
    ("REN", "Reniey Watch Manufacturing Co.Ltd", True),
    ("OW", "Oruebtak Wheel International", True),
    ("冠球", "冠球代理人有限公司", True),
    ("TSI", "TIMER SHINE INDUSTRY,CO.LTD", True),
    ("TEL", "晶宝电子有限公司", True),
    ("WEL", "三井表业有限公司", True),
    ("THA", "深圳市金辰宇科技有限公司", True),
    ("GLB", "东莞高宝精密钟表制品有限公司", True),
    ("PYX", "长安翡仕实业有限公司", False),
    ("APW", "东莞亚太表业有限公司", True),
    ("JIP", "钦州金泰精密制造有限公司", True),
    ("CES", "格致", True),
    # 16th placeholder
    ("HKG", "香港钟表(待确认)", True),
]
cust_rows = [{"name": n, "code": c, "is_active": a} for c, n, a in CUSTOMERS]
result = insert_batch("customers", cust_rows)
print(f"  Inserted: {len(result) if result else 0} customers")

# ============================================================
# Step 4: Insert real processes (35) with correct factory names + dept assignments
# ============================================================
print("\n=== Step 4: Insert 35 real processes ===")
PROCESSES = [
    # 制一 (1-11)
    ("P01", "冲板", "加工", "制一"),
    ("P02", "冲孔", "加工", "制一"),
    ("P03", "焊脚", "加工", "制一"),
    ("P04", "允窗", "加工", "制一"),
    ("P05", "平压", "辅助", "制一"),
    ("P06", "撕（泡）胶纸", "辅助", "制一"),
    ("P07", "车圈", "加工", "制一"),
    ("P08", "车窗", "加工", "制一"),
    ("P09", "车唱片纹", "加工", "制一"),
    ("P10", "倒喇叭孔", "加工", "制一"),
    ("P11", "磨毛刺", "辅助", "制一"),
    # 制二 (12-25) — NOTE: P16 电镀 in 制二, not 制三
    ("P12", "磨板", "加工", "制二"),
    ("P13", "喷砂", "加工", "制二"),
    ("P14", "刷直线纹", "加工", "制二"),
    ("P15", "刷太阳纹", "加工", "制二"),
    ("P16", "电镀", "加工", "制二"),
    ("P17", "打底", "加工", "制二"),
    ("P18", "喷漆", "加工", "制二"),
    ("P19", "消光", "加工", "制二"),
    ("P20", "烤板", "加工", "制二"),
    ("P21", "洗板", "辅助", "制二"),
    ("P22", "抛光", "加工", "制二"),
    ("P23", "QC（QC板面）", "检验", "制二"),
    ("P24", "QC（排版、移交）", "检验", "制二"),
    ("P25", "QC（接板、移交）", "检验", "制二"),
    # 制三 (26-27)
    ("P26", "网印", "加工", "制三"),
    ("P27", "球印", "加工", "制三"),
    # 制四 (28-34)
    ("P28", "穴修", "辅助", "制四"),
    ("P29", "装钉", "加工", "制四"),
    ("P30", "打胶", "加工", "制四"),
    ("P31", "调钉", "辅助", "制四"),
    ("P32", "点（填）夜光", "加工", "制四"),
    ("P33", "贴UP", "加工", "制四"),
    ("P34", "组装配件", "辅助", "制四"),
    # 总QC (35)
    ("P35", "总QC", "检验", "总QC"),
]

proc_rows = []
for code, name, ptype, dept_name in PROCESSES:
    dept_id = dept_map.get(dept_name)
    if dept_id:
        proc_rows.append({
            "code": code, "name": name, "type": ptype,
            "default_dept_id": dept_id,
            "is_required": False, "is_active": True
        })
    else:
        print(f"  WARNING: Dept '{dept_name}' not found for {code}")

result = insert_batch("processes", proc_rows)
print(f"  Inserted: {len(result) if result else 0} processes")

# ============================================================
# Step 5: Verify final counts
# ============================================================
print("\n=== AFTER ===")
after = {}
for t in ["departments","customers","processes","process_routes","route_steps","orders","order_nodes","exception_events"]:
    after[t] = count(t)
    status = "OK" if (
        (t == "departments" and after[t] == 5) or
        (t == "customers" and after[t] == 16) or
        (t == "processes" and after[t] == 35) or
        (t in ["process_routes","route_steps","orders","order_nodes","exception_events"] and after[t] == 0)
    ) else "CHECK!"
    print(f"  {t}: {after[t]} {status}")

# Verify P16 is in 制二
print("\n=== P16 Verification ===")
p16 = api("GET", "processes", params="code=eq.P16&select=code,name,default_dept:departments(name)")
if p16:
    dept_name = p16[0].get("default_dept", {}).get("name", "UNKNOWN") if isinstance(p16[0].get("default_dept"), dict) else "UNKNOWN"
    print(f"  P16 dept: {dept_name} (expected: 制二)")

print("\nDone.")
